// 백엔드 API 요청·응답 타입
// 기준: CHECKIT_BE docs/api-reference.md + app/analysis_jobs.py (develop 16a56e4, 2026-11-13)
//       분석 결과의 세부 필드는 백엔드 "Gemini 출력 결과 초안"(2026-11-12) 기준입니다.
//
// ⚠️ 분석 결과 구조는 아직 확정되지 않았습니다(분류 모델·RAG 개선 중).
//    초안에만 있거나 바뀔 수 있는 필드는 `?`(선택)로 두고 "초안" 주석을 달았습니다.
//    구조가 확정되면 이 파일만 고치고, 타입 에러가 나는 화면을 따라가며 맞춥니다.

/* ───────── 공통 ───────── */

/** UUID 문자열 */
export type Uuid = string
/** ISO 8601 날짜·시각 문자열. 예: "2026-11-12T07:50:28.024339Z" */
export type IsoDateTime = string

export type RecoveryAction = 'REUPLOAD' | 'RETRY' | 'LOGIN' | 'NONE'

/** 모든 오류 응답의 형식 */
export type ErrorResponse = {
  error: {
    code: string
    message: string
    recovery_action: RecoveryAction
    retryable: boolean
  }
}

/* ───────── 인증 ───────── */

export type Provider = 'EMAIL' | 'KAKAO' | 'GOOGLE'

export type User = {
  id: Uuid
  status: 'ACTIVE'
  provider: Provider
}

/** GET /api/auth/me */
export type MeResponse = { user: User }

/** GET /api/auth/csrf */
export type CsrfResponse = { csrf_token: string }

/** POST /api/auth/oauth/{provider}/start */
export type OAuthStartRequest = { return_path?: string }
export type OAuthStartResponse = { authorization_url: string }

/** POST /api/auth/login */
export type EmailLoginRequest = { email: string; password: string }
export type EmailLoginResponse = { user: User; csrf_token: string }

/* ───────── 계약서 ───────── */

export type InputKind = 'PDF' | 'IMAGES'

export type ContractSummary = {
  id: Uuid
  /** 현재는 'EMPLOYMENT'(근로계약서)만 저장됩니다. */
  contract_type: string
  input_kind: InputKind
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export type Contract = ContractSummary & {
  current_file_generation_id: Uuid | null
  first_uploaded_at: IsoDateTime | null
}

/** 원본 파일 정보. 브라우저 OCR 흐름에서는 원본을 보내지 않으므로 항상 빈 배열입니다. */
export type ContractFile = {
  id: Uuid
  original_filename: string | null
  media_type: string
  size_bytes: number
}

/** 원본 페이지 정보. 브라우저 OCR 흐름에서는 항상 빈 배열입니다. */
export type ContractPage = {
  id: Uuid
  file_asset_id: Uuid
  source_page_number: number
  page_order: number
  width: number | null
  height: number | null
  coordinate_unit: 'PIXEL' | 'POINT' | 'NORMALIZED' | null
}

/** 저장된 텍스트에서 각 페이지가 차지하는 범위(content 기준 글자 위치) */
export type TextPageRange = { page: number; start: number; end: number }

export type TextRevision = {
  id: Uuid
  revision: number
  kind: 'EXTRACTED' | 'USER_EDITED'
  /** 페이지 텍스트를 줄바꿈(\n)으로 이어 붙인 전체 원문(개인정보 가린 상태) */
  content: string
  /** 브라우저 OCR 흐름에서는 TextPageRange[] 입니다. */
  blocks: TextPageRange[] | unknown[]
  confirmed_at: IsoDateTime | null
}

/** GET /api/contracts?limit=&offset= */
export type ContractListResponse = {
  contracts: ContractSummary[]
  limit: number
  offset: number
}

/** GET /api/contracts/{contract_id} */
export type ContractDetailResponse = {
  contract: Contract
  files: ContractFile[]
  pages: ContractPage[]
  text: TextRevision | null
  current_result: ContractAnalysisResult | null
}

/** POST /api/contracts — 브라우저에서 OCR·수정·개인정보 가리기를 마친 텍스트 저장 */
export type CreateContractRequest = {
  input_kind: InputKind
  /** 1~10개, page는 1부터 빠짐없이 이어져야 합니다. */
  pages: { page: number; text: string }[]
  /** 사용자가 개인정보를 확인·가렸다는 동의 */
  privacy_confirmed: true
  /** Gemini 전송 안내를 확인했다는 동의 */
  gemini_notice_acknowledged: true
}
export type CreateContractResponse = { contract_id: Uuid; revision_id: Uuid }

/* ───────── 분석 결과 ───────── */

/**
 * 점검 항목의 최종 판단
 * - CAUTION: 주의(위험)
 * - MISSING_SUSPECTED: 누락 의심
 * - NEEDS_CONFIRMATION: 확인 필요(판단 보류 포함)
 * - PRESENT: 계약서에 있음/문제 없음
 */
export type CheckStatus = 'CAUTION' | 'MISSING_SUSPECTED' | 'NEEDS_CONFIRMATION' | 'PRESENT'

export const CHECK_STATUSES: readonly CheckStatus[] = [
  'CAUTION',
  'MISSING_SUSPECTED',
  'NEEDS_CONFIRMATION',
  'PRESENT',
]

/**
 * 점검 항목의 종류(rule_candidate.category)
 * - MISSING: 필수 기재사항
 * - LEGAL_RISK: 법적 위험 조항
 * - DISADVANTAGE: 근로자에게 불리할 수 있는 조건(법 판단과 별개)
 */
export type CheckCategory = 'MISSING' | 'LEGAL_RISK' | 'DISADVANTAGE'

/** 계약서에 해당 내용이 적혀 있는지 */
export type DocumentPresence = 'PRESENT' | 'ABSENT' | 'UNCLEAR'

/** 계약서 원문 위치. 글자 위치(offset)는 없으므로 원문 강조는 quoted_text로 찾습니다. */
export type SourceLocation = {
  page: number
  /** 예: "{revision_id}:c0001" */
  clause_id?: string
}

/** 규칙(또는 Gemini)이 처음 만든 점검 후보. 화면 표시는 CheckItem의 바깥 값(status, explanation)을 씁니다. */
export type RuleCandidate = {
  category: CheckCategory
  check_code?: string
  labels?: string[]
  clause_id?: string | null
  quoted_text?: string | null
  /** 규칙의 1차 추정. 최종 판단은 CheckItem.status */
  explanation?: string
  /** 규칙의 1차 추정 상태. 최종 판단은 CheckItem.status — 초안 */
  status_hint?: CheckStatus
  /** 초안 */
  candidate_id?: string
  /** Gemini가 규칙 목록에 없는 문제를 새로 찾은 경우 'GEMINI' — 초안 */
  source?: 'GEMINI' | string
  source_locations?: SourceLocation[]
  retrieval_warnings?: string[]
  required_information?: string[]
  /** 확정 전 추가 필드를 허용합니다. */
  [key: string]: unknown
}

export type CheckItem = {
  id: Uuid
  /** 예: 'MISSING_HOLIDAY', 'MISSING_WAGE_PAYMENT', Gemini 새 발견은 'DISCOVERED_ISSUE' */
  check_code: string
  /** 분류 라벨. 예: ['임금'], ['근무 장소·업무'] */
  labels: string[]
  /** 최종 판단 — 화면에 표시하는 값 */
  status: CheckStatus
  /** 초안 — DB 변경(005) 적용 전 응답에는 없을 수 있습니다. */
  document_presence?: DocumentPresence | null
  /** 계약서에서 인용한 문구. 누락 항목은 null */
  quoted_text: string | null
  /** 최종 설명 — 화면에 표시하는 값 */
  explanation: string
  /** 사장님께 확인할 정보. 예: ['임금 지급 방법'] */
  required_information: string[]
  source_locations: SourceLocation[]
  rule_candidate: RuleCandidate
}

/** 근거 법령. 같은 조문(chunk_id)이 항목마다 반복되므로 화면에서는 묶어서 보여줍니다. */
export type Citation = {
  /** 상세 조회 응답에만 있습니다. */
  id?: Uuid
  check_item_id: Uuid
  law_id: string
  law_name: string
  article_id: string
  article_number: string
  chunk_id: string
  content: string
  effective_date: string | null
  source_url: string
  corpus_version: string
}

/** 분석 결과 공통 필드(분석 상태 조회·계약서 상세 둘 다) */
export type AnalysisResult = {
  id: Uuid
  /** 서버가 만든 요약. 영어 상태 코드가 섞여 있어 화면에 그대로 쓰지 않습니다. */
  summary: string
  completed_at: IsoDateTime
  items: CheckItem[]
  citations: Citation[]
}

/** GET /api/analysis/.../jobs/{job_id} 의 result */
export type JobAnalysisResult = AnalysisResult & {
  /** 예: { gemini_model, classifier_model, classifier_revision } */
  model_versions: Record<string, string>
  prompt_version: string | null
  corpus_version: string
  rule_version: string | null
}

/** GET /api/contracts/{id} 의 current_result */
export type ContractAnalysisResult = AnalysisResult & {
  input_revision_id: Uuid
  file_generation_id: Uuid
  counts: Record<CheckStatus, number>
  is_current_generation: boolean
  is_current_revision: boolean
}

/* ───────── 분석 작업 ───────── */

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

/** 진행 단계: 조항 분류 → 법령 검색 → 판단 → 설명 */
export type JobStage = 'CLASSIFY' | 'RETRIEVE' | 'EVALUATE' | 'EXPLAIN'

/** POST /api/analysis/contracts/{contract_id}/jobs */
export type StartAnalysisRequest = {
  privacy_confirmed: true
  gemini_notice_acknowledged: true
  /** 'YYYY-MM-DD'. 문서에서 확인되지 않으면 보내지 않습니다. */
  effective_date?: string
  /** 상시 근로자 수 1~100000 */
  employee_count?: number
  /** 예: '통상 근로', 최대 80자 */
  work_type?: string
  /** 0 초과 168 이하 */
  weekly_hours?: number
  /** 1~10, 기본 5 */
  top_k?: number
}
export type StartAnalysisResponse = { job_id: Uuid; status: 'QUEUED' }

/** GET /api/analysis/contracts/{contract_id}/jobs/{job_id} */
export type AnalysisJobResponse = {
  job_id: Uuid
  status: JobStatus
  stage: JobStage | null
  /** status가 FAILED일 때만. 예: 'ANALYSIS_INTERRUPTED', 'ANALYSIS_FAILED' */
  error_code: string | null
  /** status가 SUCCEEDED일 때만 */
  result: JobAnalysisResult | null
}

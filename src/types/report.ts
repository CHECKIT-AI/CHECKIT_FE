// 점검 리포트 형식 (화면용).
// 백엔드 DB(check_items·law_citations)를 기준으로 하되, 목업 화면에 필요한데 백엔드에 아직 없는 필드는
// "백엔드 미정"으로 표시했습니다. API 연결 시 응답 형식에 맞춰 조정합니다.

/** 위험 조항의 심각도 — 백엔드 미정 (DB에는 CAUTION 하나뿐) */
export type RiskSeverity = 'VIOLATION' | 'UNFAVORABLE' | 'UNCLEAR'

/** 필수 기재사항 상태 — DB: MISSING_SUSPECTED / NEEDS_CONFIRMATION / PRESENT */
export type RequiredStatus = 'MISSING_SUSPECTED' | 'NEEDS_CONFIRMATION' | 'PRESENT'

/** 근거 법령 — DB law_citations 기준 */
export type LawCitation = {
  law_name: string
  article_number: string
  /** 조문 제목 — 백엔드 미정 */
  article_title?: string
  content: string
  source_url: string
  effective_date?: string
}

export type Clause = {
  clause_id: string
  /** 예: 제7조 */
  number: string | null
  title: string
  text: string
}

type BaseItem = {
  id: string
  /** 항목 제목 — 백엔드 미정 */
  title: string
  /** 연결된 계약서 조항. 누락 의심이면 null (DB: source_locations) */
  clause_id: string | null
  /** DB: explanation */
  explanation: string
  citation: LawCitation | null
  /** 적용 요건 — 백엔드 미정 */
  requirements?: string[]
  /** 서명 전 확인 질문 — 백엔드 첫 버전 범위 밖 */
  question?: string
}

export type RiskItem = BaseItem & {
  kind: 'RISK'
  severity: RiskSeverity
  /** 분류 — DB labels */
  category: string
}

export type RequiredItem = BaseItem & {
  kind: 'REQUIRED'
  status: RequiredStatus
}

export type ReportItem = RiskItem | RequiredItem

export type Report = {
  id: string
  title: string
  checked_at: string
  clauses: Clause[]
  items: ReportItem[]
}

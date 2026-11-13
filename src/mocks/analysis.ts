// 리포트 화면 확인용 예시 데이터 — GET /api/contracts/{id} 응답(ContractDetailResponse) 형식
//
// 점검 결과(items·citations)는 백엔드 "Gemini 출력 결과 초안"(2026-11-12)의 예시 2개를 옮겼습니다.
// ⚠️ 초안이라 판단 내용은 정확하지 않습니다. 화면 모양을 맞추기 위한 데이터입니다.
// ⚠️ 초안에는 계약서 원문(text)이 없어서 원문은 아래처럼 채웠습니다.
//    - sample-2: 초안의 인용 문구(quoted_text)를 이어 붙여 복원
//    - sample-1: 초안에 원문 정보가 없어 임의로 작성
// TODO: 리포트 상세 연동 시 GET /api/contracts/{id} 응답으로 대체

import type { CheckItem, Citation, ContractDetailResponse, TextRevision } from '../types/api'
import { CHECK_STATUSES, type CheckStatus } from '../types/api'

/* ───────── 근거 법령 원문 ───────── */

const LAW_17 = {
  law_id: '001872',
  law_name: '근로기준법',
  article_id: '001872_285279_20261008_0017001',
  article_number: '제17조',
  chunk_id: '001872_285279_20261008_0017001::full',
  content:
    '제17조(근로조건의 명시)\n① 사용자는 근로계약을 체결할 때에 근로자에게 다음 각 호의 사항을 명시하여야 한다. 근로계약 체결 후 다음 각 호의 사항을 변경하는 경우에도 또한 같다. <개정 2010.5.25>\n1. 임금\n2. 소정근로시간\n3. 제55조에 따른 휴일\n4. 제60조에 따른 연차 유급휴가\n5. 그 밖에 대통령령으로 정하는 근로조건\n② 사용자는 제1항제1호와 관련한 임금의 구성항목ㆍ계산방법ㆍ지급방법 및 제2호부터 제4호까지의 사항이 명시된 서면(「전자문서 및 전자거래 기본법」 제2조제1호에 따른 전자문서를 포함한다)을 근로자에게 교부하여야 한다. 다만, 본문에 따른 사항이 단체협약 또는 취업규칙의 변경 등 대통령령으로 정하는 사유로 인하여 변경되는 경우에는 근로자의 요구가 있으면 그 근로자에게 교부하여야 한다. <신설 2010.5.25, 2021.1.5>',
  effective_date: '2026-10-08',
  source_url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=285279',
  corpus_version: 'employment_basic_v004',
}

const DECREE_8 = {
  law_id: '003058',
  law_name: '근로기준법 시행령',
  article_id: '003058_270551_20251023_0008001',
  article_number: '제8조',
  chunk_id: '003058_270551_20251023_0008001::full',
  content:
    '제8조(명시하여야 할 근로조건) 법 제17조제1항제5호에서 "대통령령으로 정하는 근로조건"이란 다음 각 호의 사항을 말한다. <개정 2018.6.29>\n1. 취업의 장소와 종사하여야 할 업무에 관한 사항\n2. 법 제93조제1호부터 제12호까지의 규정에서 정한 사항\n3. 사업장의 부속 기숙사에 근로자를 기숙하게 하는 경우에는 기숙사 규칙에서 정한 사항',
  effective_date: '2025-10-23',
  source_url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=270551',
  corpus_version: 'employment_basic_v004',
}

function cite(law: typeof LAW_17, checkItemId: string, n: number): Citation {
  return { id: `cite-${checkItemId.slice(0, 8)}-${n}`, check_item_id: checkItemId, ...law }
}

/* ───────── 필수 기재사항 항목 만들기 ───────── */

type MissingSpec = {
  id: string
  code: string
  label: string
  info: string
  candidateId: string
  hint: CheckStatus
}

const MISSING = {
  wageComponents: { code: 'MISSING_WAGE_COMPONENTS', label: '임금', info: '임금 구성 항목', candidateId: 'candidate_0001', hint: 'NEEDS_CONFIRMATION' },
  wageCalculation: { code: 'MISSING_WAGE_CALCULATION', label: '임금', info: '임금 계산 방법', candidateId: 'candidate_0002', hint: 'MISSING_SUSPECTED' },
  wagePayment: { code: 'MISSING_WAGE_PAYMENT', label: '임금', info: '임금 지급 방법', candidateId: 'candidate_0003', hint: 'MISSING_SUSPECTED' },
  hours: { code: 'MISSING_SCHEDULED_HOURS', label: '근로시간', info: '소정근로시간', candidateId: 'candidate_0004', hint: 'NEEDS_CONFIRMATION' },
  holiday: { code: 'MISSING_HOLIDAY', label: '휴일', info: '휴일', candidateId: 'candidate_0005', hint: 'NEEDS_CONFIRMATION' },
  annualLeave: { code: 'MISSING_ANNUAL_LEAVE', label: '휴가', info: '연차 유급휴가', candidateId: 'candidate_0006', hint: 'NEEDS_CONFIRMATION' },
  workplace: { code: 'MISSING_WORKPLACE', label: '근무 장소·업무', info: '근무 장소', candidateId: 'candidate_0007', hint: 'NEEDS_CONFIRMATION' },
  duties: { code: 'MISSING_DUTIES', label: '근무 장소·업무', info: '종사할 업무', candidateId: 'candidate_0008', hint: 'NEEDS_CONFIRMATION' },
} satisfies Record<string, Omit<MissingSpec, 'id'>>

const HOLD = '적용 시점과 법령 근거를 검증할 수 없어 판단을 보류합니다.'

function missingItem(
  spec: MissingSpec,
  result: Pick<CheckItem, 'status' | 'explanation' | 'quoted_text' | 'document_presence' | 'source_locations'>,
): CheckItem {
  return {
    id: spec.id,
    check_code: spec.code,
    labels: [spec.label],
    required_information: [],
    ...result,
    rule_candidate: {
      labels: [spec.label],
      category: 'MISSING',
      clause_id: null,
      check_code: spec.code,
      explanation: `${spec.info}의 명시 여부를 확인해야 합니다.`,
      quoted_text: null,
      status_hint: spec.hint,
      candidate_id: spec.candidateId,
      source_locations: result.source_locations,
      retrieval_warnings: [],
      required_information: [spec.info],
    },
  }
}

function countByStatus(items: CheckItem[]) {
  const counts = Object.fromEntries(CHECK_STATUSES.map((s) => [s, 0])) as Record<CheckStatus, number>
  for (const it of items) counts[it.status] += 1
  return counts
}

function text(id: string, pages: string[]): TextRevision {
  const blocks = []
  let start = 0
  for (const [i, page] of pages.entries()) {
    blocks.push({ page: i + 1, start, end: start + page.length })
    start += page.length + 1
  }
  return { id, revision: 1, kind: 'USER_EDITED', content: pages.join('\n'), blocks, confirmed_at: '2026-11-12T07:49:00Z' }
}

/* ───────── 예시 1: 대부분 판단 보류 (prompt v4) ───────── */

const S1_REVISION = '6b1f0c2e-1d1a-4f0e-9a57-0c1d2e3f4a51'
const s1Loc = [{ page: 1 }]

const S1_ITEMS: CheckItem[] = [
  missingItem({ id: '5155469a-4fac-4da7-ab85-72fab56c683a', ...MISSING.wageCalculation }, { status: 'NEEDS_CONFIRMATION', explanation: HOLD, quoted_text: null, document_presence: null, source_locations: [] }),
  missingItem({ id: '68c5ef0a-ea3c-4a21-badb-26f74c6e2a6d', ...MISSING.holiday }, { status: 'NEEDS_CONFIRMATION', explanation: HOLD, quoted_text: null, document_presence: null, source_locations: [] }),
  missingItem({ id: '89eb8dda-ca15-4ae7-bcfd-39e103b8b875', ...MISSING.hours }, { status: 'NEEDS_CONFIRMATION', explanation: HOLD, quoted_text: null, document_presence: null, source_locations: [] }),
  missingItem({ id: '9083145a-6d3f-4d7c-8751-704099cb516a', ...MISSING.workplace }, { status: 'PRESENT', explanation: '근무 장소가 명시되어 있습니다.', quoted_text: null, document_presence: null, source_locations: s1Loc }),
  missingItem({ id: '91ec47ea-a0f3-491b-a37c-ba0e7eb9ecd9', ...MISSING.annualLeave }, { status: 'NEEDS_CONFIRMATION', explanation: HOLD, quoted_text: null, document_presence: null, source_locations: [] }),
  missingItem({ id: '9c30ccad-56c0-45be-9f46-1647f3f9fe78', ...MISSING.duties }, { status: 'PRESENT', explanation: '종사할 업무가 명시되어 있습니다.', quoted_text: null, document_presence: null, source_locations: s1Loc }),
  missingItem({ id: 'c2040002-a9e3-4766-97b2-3cceed28cc13', ...MISSING.wageComponents }, { status: 'NEEDS_CONFIRMATION', explanation: HOLD, quoted_text: null, document_presence: null, source_locations: [] }),
  missingItem({ id: 'c8ebfe90-de97-480d-9b68-97785166db6f', ...MISSING.wagePayment }, { status: 'NEEDS_CONFIRMATION', explanation: HOLD, quoted_text: null, document_presence: null, source_locations: [] }),
]

const SAMPLE_1: ContractDetailResponse = {
  contract: {
    id: 'sample-1',
    contract_type: 'EMPLOYMENT',
    input_kind: 'IMAGES',
    created_at: '2026-11-12T07:48:10Z',
    updated_at: '2026-11-12T07:50:28Z',
    current_file_generation_id: '0d9b7a41-5c1e-4b8e-9f2d-1a2b3c4d5e61',
    first_uploaded_at: null,
  },
  files: [],
  pages: [],
  // 임의로 작성한 원문(초안에 원문 정보 없음)
  text: text(S1_REVISION, [
    '근 로 계 약 서\n사용자: ****** | 근로자: ***\n1. 근무장소: 가상시 미래로 108길 18, 매장\n2. 업무내용: 매장 고객응대 및 상품 진열',
  ]),
  current_result: {
    id: 'ffaa3a7e-c3cf-4c45-aa14-2ae65cad1638',
    input_revision_id: S1_REVISION,
    file_generation_id: '0d9b7a41-5c1e-4b8e-9f2d-1a2b3c4d5e61',
    summary: '2개 조항, 8개 항목 검토: CAUTION 0건, MISSING_SUSPECTED 0건, NEEDS_CONFIRMATION 6건, PRESENT 2건',
    completed_at: '2026-11-12T07:50:28.024339Z',
    items: S1_ITEMS,
    counts: countByStatus(S1_ITEMS),
    citations: [cite(DECREE_8, '9c30ccad-56c0-45be-9f46-1647f3f9fe78', 1), cite(DECREE_8, '9083145a-6d3f-4d7c-8751-704099cb516a', 1)],
    is_current_generation: true,
    is_current_revision: true,
  },
}

/* ───────── 예시 2: 필수 기재사항 확인 + Gemini 새 발견 1건 (prompt v5) ───────── */

const S2_REVISION = '32a55385-d39a-4d85-b884-8d5be69fa46f'
const C1 = { page: 1, clause_id: `${S2_REVISION}:c0001` }
const C2 = { page: 1, clause_id: `${S2_REVISION}:c0002` }

/** 초안의 DISCOVERED_ISSUE 인용 문구(첫 조항 묶음 전체) */
const S2_CLAUSE_1 =
  '근 로 계 약 서   CHK_SYN_008 | 합성 평가용 \n사용자: ****** | 대표: *** | 상시근로자: 12명\n근로자: *** | 주소: 가상시 평화구 샘물로 8 | 형태: 단시간\n체결일: 2026년 11월 12일 \n1   근로계약기간: 2026년 11월 16일부터 기간의 정함이 없음. \n2   근무장소: 가상시 미래로 108길 18, 건설 사업장. \n3   업무내용: 건설 관련 고객응대, 기록관리 및 현장 지원. \n4   소정근로시간: 월·수·금 13:00~18:00, 각 5시간·주 15시간. \n5   휴게시간: 15:00~15:30이며 근로자가 자유롭게 이용한다. \n6   휴일: 매주 일요일을 유급 주휴일로 하고 법정 요건에 따른 휴일을 부여한다. \n7   임금: 시간급 12,000원. 기본급과 각 수당의 계산내역을 임금명세서로 교부하며 매월 25일 본인 계좌로 지급한'

const S2_ITEMS: CheckItem[] = [
  {
    id: '057b1feb-f552-444d-bd46-a71b7ebed6d0',
    check_code: 'DISCOVERED_ISSUE',
    labels: [],
    status: 'NEEDS_CONFIRMATION',
    document_presence: null,
    quoted_text: S2_CLAUSE_1,
    explanation: '적용 시점과 법령 근거를 검증할 수 없어 판단을 보류합니다. 법령 인용을 검증할 수 없어 추가 판단을 보류합니다.',
    required_information: ['임금 지급 원칙'],
    source_locations: [C1],
    rule_candidate: {
      labels: [],
      source: 'GEMINI',
      category: 'LEGAL_RISK',
      clause_id: C1.clause_id,
      check_code: 'DISCOVERED_ISSUE',
      quoted_text: S2_CLAUSE_1,
      candidate_id: 'scan_0001',
      source_locations: [C1],
    },
  },
  missingItem({ id: '0db8283e-4118-4c29-8a5b-b113f9559258', ...MISSING.holiday }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '매주 일요일을 유급 주휴일로 하고 법정 요건에 따른 휴일을 부여한다.', explanation: '계약서에서 휴일 관련 문구를 확인했습니다.', source_locations: [C1] }),
  missingItem({ id: '36716523-d026-4b47-a482-cc2de1c7b477', ...MISSING.wageComponents }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '기본급과 각 수당의 계산내역을 임금명세서로 교부하며', explanation: '계약서에서 임금 구성 항목 관련 문구를 확인했습니다.', source_locations: [C1] }),
  missingItem({ id: '52ee93fe-d92a-4690-bec3-d072466858f8', ...MISSING.wageCalculation }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '시간급 12,000원. 기본급과 각 수당의 계산내역을 임금명세서로 교부하며', explanation: '계약서에서 임금 계산 방법 관련 문구를 확인했습니다.', source_locations: [C1] }),
  missingItem({ id: '5667fc9e-33f4-47cc-9cb1-fbdc753ccb45', ...MISSING.wagePayment }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '매월 25일 본인 계좌로 지급한', explanation: '계약서에서 임금 지급 방법 관련 문구를 확인했습니다.', source_locations: [C1] }),
  missingItem({ id: '63fc535e-1d63-4b31-a154-5481e2798d5a', ...MISSING.duties }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '건설 관련 고객응대, 기록관리 및 현장 지원.', explanation: '계약서에서 종사할 업무 관련 문구를 확인했습니다.', source_locations: [C1] }),
  missingItem({ id: '7bc9b265-577c-425e-90af-1360831d0282', ...MISSING.annualLeave }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '연차유급휴가는 근로기준법 등 관계 법령이 정한 바에 따라 부여한다.', explanation: '계약서에서 연차 유급휴가 관련 문구를 확인했습니다.', source_locations: [C2] }),
  missingItem({ id: '942cd307-ebad-49e6-99db-3b1cf54c90d1', ...MISSING.hours }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '월·수·금 13:00~18:00, 각 5시간·주 15시간.', explanation: '계약서에서 소정근로시간 관련 문구를 확인했습니다.', source_locations: [C1] }),
  missingItem({ id: 'db19f6db-1ab6-40bf-b74b-4976faa1a8ff', ...MISSING.workplace }, { status: 'PRESENT', document_presence: 'PRESENT', quoted_text: '가상시 미래로 108길 18, 건설 사업장.', explanation: '계약서에서 근무 장소 관련 문구를 확인했습니다.', source_locations: [C1] }),
]

const SAMPLE_2: ContractDetailResponse = {
  contract: {
    id: 'sample-2',
    contract_type: 'EMPLOYMENT',
    input_kind: 'PDF',
    created_at: '2026-11-12T08:57:40Z',
    updated_at: '2026-11-12T08:59:54Z',
    current_file_generation_id: '7c2e9d10-3b4a-4e5f-8a6b-9c0d1e2f3a42',
    first_uploaded_at: null,
  },
  files: [],
  pages: [],
  // 초안의 인용 문구를 이어 붙여 복원한 원문
  text: text(S2_REVISION, [
    `${S2_CLAUSE_1}다. \n8   연차휴가: 연차유급휴가는 근로기준법 등 관계 법령이 정한 바에 따라 부여한다.`,
  ]),
  current_result: {
    id: '2395b93d-af6f-40ee-ab72-2131597a4cf6',
    input_revision_id: S2_REVISION,
    file_generation_id: '7c2e9d10-3b4a-4e5f-8a6b-9c0d1e2f3a42',
    summary: '3개 조항, 9개 항목 검토: CAUTION 0건, MISSING_SUSPECTED 0건, NEEDS_CONFIRMATION 1건, PRESENT 8건',
    completed_at: '2026-11-12T08:59:54.473187Z',
    items: S2_ITEMS,
    counts: countByStatus(S2_ITEMS),
    citations: S2_ITEMS.filter((it) => it.check_code !== 'DISCOVERED_ISSUE').map((it) => cite(LAW_17, it.id, 1)),
    is_current_generation: true,
    is_current_revision: true,
  },
}

export const SAMPLE_CONTRACTS: Record<string, ContractDetailResponse> = {
  'sample-1': SAMPLE_1,
  'sample-2': SAMPLE_2,
}

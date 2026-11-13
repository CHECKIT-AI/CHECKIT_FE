// 리포트 화면 확인용 예시 데이터 — GET /api/contracts/{id} 응답(ContractDetailResponse) 형식
//
// 형식(필드 구조)은 백엔드 "Gemini 출력 결과 초안"(2026-11-12)을 그대로 따릅니다.
// ⚠️ 내용(계약서 원문·판정·설명·법령 인용)은 화면 시연용으로 지어낸 예시입니다. 실제 분석 결과가 아닙니다.
//    점검 항목(check_code)은 백엔드 규칙(CHECKIT_BE app/analysis_rules.py)에 있는 것만 사용했고,
//    법령 조문 내용은 해당 조문의 주요 문장만 옮겼습니다.
// TODO: 리포트 상세 연동 시 GET /api/contracts/{id} 응답으로 대체

import type {
  CheckCategory,
  CheckItem,
  CheckStatus,
  Citation,
  ContractDetailResponse,
  DocumentPresence,
  TextRevision,
} from '../types/api'
import { CHECK_STATUSES } from '../types/api'

/* ───────── 근거 법령 ───────── */

type Law = Omit<Citation, 'id' | 'check_item_id'>

const LSA_URL = 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=285279'
const lsa = (no: string, content: string): Law => ({
  law_id: '001872',
  law_name: '근로기준법',
  article_id: `001872_285279_20261008_${no.padStart(4, '0')}001`,
  article_number: `제${no}조`,
  chunk_id: `001872_285279_20261008_${no.padStart(4, '0')}001::full`,
  content,
  effective_date: '2026-10-08',
  source_url: LSA_URL,
  corpus_version: 'employment_basic_v004',
})

const LAW = {
  art17: lsa(
    '17',
    '제17조(근로조건의 명시)\n① 사용자는 근로계약을 체결할 때에 근로자에게 다음 각 호의 사항을 명시하여야 한다.\n1. 임금\n2. 소정근로시간\n3. 제55조에 따른 휴일\n4. 제60조에 따른 연차 유급휴가\n5. 그 밖에 대통령령으로 정하는 근로조건\n② 사용자는 제1항제1호와 관련한 임금의 구성항목ㆍ계산방법ㆍ지급방법 및 제2호부터 제4호까지의 사항이 명시된 서면을 근로자에게 교부하여야 한다.',
  ),
  art20: lsa('20', '제20조(위약 예정의 금지) 사용자는 근로계약 불이행에 대한 위약금 또는 손해배상액을 예정하는 계약을 체결하지 못한다.'),
  art54: lsa(
    '54',
    '제54조(휴게)\n① 사용자는 근로시간이 4시간인 경우에는 30분 이상, 8시간인 경우에는 1시간 이상의 휴게시간을 근로시간 도중에 주어야 한다.\n② 휴게시간은 근로자가 자유롭게 이용할 수 있다.',
  ),
  art56: lsa('56', '제56조(연장ㆍ야간 및 휴일 근로)\n① 사용자는 연장근로에 대하여는 통상임금의 100분의 50 이상을 가산하여 근로자에게 지급하여야 한다.'),
  minWage6: {
    law_id: '001700',
    law_name: '최저임금법',
    article_id: '001700_000000_20260101_0006001',
    article_number: '제6조',
    chunk_id: '001700_000000_20260101_0006001::full',
    content:
      '제6조(최저임금의 효력)\n① 사용자는 최저임금의 적용을 받는 근로자에게 최저임금액 이상의 임금을 지급하여야 한다.\n③ 최저임금의 적용을 받는 근로자와 사용자 사이의 근로계약 중 최저임금액에 미치지 못하는 금액을 임금으로 정한 부분은 무효로 하며, 이 경우 무효로 된 부분은 이 법으로 정한 최저임금액과 동일한 임금을 지급하기로 한 것으로 본다.',
    effective_date: '2026-01-01',
    source_url: 'https://www.law.go.kr/법령/최저임금법',
    corpus_version: 'employment_basic_v004',
  },
} satisfies Record<string, Law>

/* ───────── 항목 만들기 ───────── */

type Spec = {
  id: string
  code: string
  category: CheckCategory
  labels: string[]
  status: CheckStatus
  hint: CheckStatus
  explanation: string
  quote?: string
  clause?: string
  presence?: DocumentPresence | null
  info?: string[]
  source?: 'GEMINI'
  laws?: Law[]
}

type Built = { item: CheckItem; laws: Law[] }

function makeItems(revision: string, specs: Spec[]): Built[] {
  return specs.map((s, i) => {
    const loc = s.clause ? [{ page: 1, clause_id: `${revision}:${s.clause}` }] : []
    return {
      laws: s.laws ?? [],
      item: {
        id: s.id,
        check_code: s.code,
        labels: s.labels,
        status: s.status,
        document_presence: s.category === 'MISSING' ? (s.presence ?? 'UNCLEAR') : null,
        quoted_text: s.quote ?? null,
        explanation: s.explanation,
        required_information: s.status === 'PRESENT' ? [] : (s.info ?? []),
        source_locations: loc,
        rule_candidate: {
          labels: s.labels,
          category: s.category,
          clause_id: s.category === 'MISSING' ? null : loc[0]?.clause_id ?? null,
          check_code: s.code,
          explanation: s.explanation,
          quoted_text: s.category === 'MISSING' ? null : (s.quote ?? null),
          status_hint: s.hint,
          candidate_id: s.source === 'GEMINI' ? `scan_${String(i + 1).padStart(4, '0')}` : `candidate_${String(i + 1).padStart(4, '0')}`,
          ...(s.source ? { source: s.source } : {}),
          source_locations: loc,
          retrieval_warnings: [],
          required_information: s.info ?? [],
        },
      },
    }
  })
}

function countByStatus(items: CheckItem[]) {
  const counts = Object.fromEntries(CHECK_STATUSES.map((s) => [s, 0])) as Record<CheckStatus, number>
  for (const it of items) counts[it.status] += 1
  return counts
}

function text(id: string, content: string): TextRevision {
  return { id, revision: 1, kind: 'USER_EDITED', content, blocks: [{ page: 1, start: 0, end: content.length }], confirmed_at: '2026-11-12T07:49:00Z' }
}

function contract(o: {
  id: string
  revision: string
  generation: string
  resultId: string
  inputKind: 'PDF' | 'IMAGES'
  createdAt: string
  completedAt: string
  content: string
  summary: string
  built: Built[]
}): ContractDetailResponse {
  const items = o.built.map((b) => b.item)
  const citations = o.built.flatMap((b) =>
    b.laws.map((law, n) => ({ id: `cite-${b.item.id.slice(0, 8)}-${n + 1}`, check_item_id: b.item.id, ...law })),
  )
  return {
    contract: {
      id: o.id,
      contract_type: 'EMPLOYMENT',
      input_kind: o.inputKind,
      created_at: o.createdAt,
      updated_at: o.completedAt,
      current_file_generation_id: o.generation,
      first_uploaded_at: null,
    },
    files: [],
    pages: [],
    text: text(o.revision, o.content),
    current_result: {
      id: o.resultId,
      input_revision_id: o.revision,
      file_generation_id: o.generation,
      summary: o.summary,
      completed_at: o.completedAt,
      items,
      counts: countByStatus(items),
      citations,
      is_current_generation: true,
      is_current_revision: true,
    },
  }
}

/* ───────── 예시 1: 위험 조항이 많은 카페 아르바이트 계약서 ───────── */

const S1_REV = '6b1f0c2e-1d1a-4f0e-9a57-0c1d2e3f4a51'

const S1_TEXT = `근 로 계 약 서
사업주: ○○카페 (대표 ***)   근로자: ***
제1조(계약기간) 2026년 12월 1일부터 2027년 11월 30일까지로 한다.
제2조(근무장소 및 업무) 근무장소는 가상시 미래로 108길 18 ○○카페 매장으로 하고, 업무는 음료 제조 및 매장 관리로 한다.
제3조(근로시간) 근로시간은 매주 월요일부터 금요일까지 10:00~19:00로 하며, 휴게시간은 근로시간 중 30분으로 한다.
제4조(임금) 시급은 10,000원으로 하며, 매월 10일 근로자 명의 계좌로 지급한다.
제5조(연장근로) 연장근로에 대한 가산수당은 기본급에 포함된 것으로 본다.
제6조(휴일) 주휴일은 매주 일요일로 한다.
제7조(위약금) 근로자가 계약기간 중 퇴사하는 경우 교육비 명목으로 100만원을 배상한다.
제8조(근로조건 변경) 회사는 경영상 필요에 따라 근무시간 및 근무장소를 변경할 수 있으며, 근로자는 이에 따른다.`

const S1 = contract({
  id: 'sample-1',
  revision: S1_REV,
  generation: '0d9b7a41-5c1e-4b8e-9f2d-1a2b3c4d5e61',
  resultId: 'ffaa3a7e-c3cf-4c45-aa14-2ae65cad1638',
  inputKind: 'IMAGES',
  createdAt: '2026-11-12T07:48:10Z',
  completedAt: '2026-11-12T07:50:28.024339Z',
  content: S1_TEXT,
  summary: '8개 조항, 13개 항목 검토: CAUTION 5건, MISSING_SUSPECTED 1건, NEEDS_CONFIRMATION 1건, PRESENT 6건',
  built: makeItems(S1_REV, [
    {
      id: 'a1e0c3b2-0001-4c1a-9a01-000000000001', code: 'PRESET_PENALTY', category: 'LEGAL_RISK', labels: ['손해배상·위약금'],
      status: 'CAUTION', hint: 'CAUTION', clause: 'c0008',
      quote: '근로자가 계약기간 중 퇴사하는 경우 교육비 명목으로 100만원을 배상한다.',
      explanation: '퇴사를 이유로 미리 정한 금액을 물어내게 하는 조항입니다. 근로기준법은 근로계약 불이행에 대한 위약금이나 손해배상액을 미리 정하는 계약을 금지하고 있어, 이 조항은 효력이 없을 가능성이 큽니다.',
      info: ['교육비 배상 조항을 삭제할 수 있는지', '실제로 교육비가 발생했는지'],
      laws: [LAW.art20],
    },
    {
      id: 'a1e0c3b2-0002-4c1a-9a01-000000000002', code: 'MINIMUM_WAGE', category: 'LEGAL_RISK', labels: ['임금'],
      status: 'CAUTION', hint: 'CAUTION', clause: 'c0005', quote: '시급은 10,000원으로 하며',
      explanation: '2026년 최저시급은 10,320원입니다. 계약서의 시급 10,000원은 최저임금보다 320원 낮아, 이 부분은 무효이고 최저임금 이상을 받을 수 있습니다.',
      info: ['시급을 10,320원 이상으로 고칠 수 있는지'],
      laws: [LAW.minWage6],
    },
    {
      id: 'a1e0c3b2-0003-4c1a-9a01-000000000003', code: 'OVERTIME_PREMIUM', category: 'LEGAL_RISK', labels: ['임금', '근로시간'],
      status: 'CAUTION', hint: 'CAUTION', clause: 'c0006', quote: '연장근로에 대한 가산수당은 기본급에 포함된 것으로 본다.',
      explanation: '연장근로를 하면 통상임금의 50% 이상을 더 받아야 합니다. 가산수당을 기본급에 포함시킨다는 조항은 시급제에서 실제 연장근로 수당을 받지 못하게 될 수 있습니다.',
      info: ['연장근로를 하면 수당을 따로 계산해 주는지'],
      laws: [LAW.art56],
    },
    {
      id: 'a1e0c3b2-0004-4c1a-9a01-000000000004', code: 'INSUFFICIENT_BREAK', category: 'LEGAL_RISK', labels: ['근로시간'],
      status: 'CAUTION', hint: 'CAUTION', clause: 'c0004', quote: '휴게시간은 근로시간 중 30분으로 한다.',
      explanation: '10시부터 19시까지 근무하면 휴게시간을 빼도 8시간 이상 일하게 됩니다. 근로시간이 8시간이면 휴게시간은 1시간 이상이어야 해서 30분은 부족합니다.',
      info: ['휴게시간을 1시간으로 늘릴 수 있는지'],
      laws: [LAW.art54],
    },
    {
      id: 'a1e0c3b2-0005-4c1a-9a01-000000000005', code: 'UNILATERAL_CHANGE', category: 'DISADVANTAGE', labels: ['기타 근로조건'],
      status: 'CAUTION', hint: 'CAUTION', clause: 'c0009',
      quote: '회사는 경영상 필요에 따라 근무시간 및 근무장소를 변경할 수 있으며, 근로자는 이에 따른다.',
      explanation: '회사가 근무시간과 장소를 혼자 바꿀 수 있게 되어 있습니다. 법 위반으로 단정하기는 어렵지만, 근로자에게 불리할 수 있으니 변경할 때 미리 협의한다는 문구를 넣는 것이 좋습니다.',
      info: ['근무시간·장소를 바꿀 때 미리 협의하는지'],
    },
    {
      id: 'a1e0c3b2-0006-4c1a-9a01-000000000006', code: 'MISSING_ANNUAL_LEAVE', category: 'MISSING', labels: ['휴가'],
      status: 'MISSING_SUSPECTED', hint: 'MISSING_SUSPECTED', presence: 'ABSENT',
      explanation: '연차 유급휴가에 관한 내용이 계약서에서 확인되지 않습니다. 연차 유급휴가는 근로계약서에 반드시 적어야 하는 사항입니다.',
      info: ['연차 유급휴가를 어떻게 부여하는지'],
      laws: [LAW.art17],
    },
    {
      id: 'a1e0c3b2-0007-4c1a-9a01-000000000007', code: 'MISSING_WAGE_COMPONENTS', category: 'MISSING', labels: ['임금'],
      status: 'NEEDS_CONFIRMATION', hint: 'NEEDS_CONFIRMATION', presence: 'UNCLEAR', clause: 'c0005', quote: '시급은 10,000원으로 하며',
      explanation: '시급은 적혀 있지만 주휴수당 등 다른 수당이 포함되는지는 계약서만으로 알 수 없습니다.',
      info: ['주휴수당을 따로 지급하는지'],
      laws: [LAW.art17],
    },
    {
      id: 'a1e0c3b2-0008-4c1a-9a01-000000000008', code: 'MISSING_WAGE_CALCULATION', category: 'MISSING', labels: ['임금'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0005', quote: '시급은 10,000원으로 하며',
      explanation: '시급으로 임금을 계산한다는 내용을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'a1e0c3b2-0009-4c1a-9a01-000000000009', code: 'MISSING_WAGE_PAYMENT', category: 'MISSING', labels: ['임금'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0005', quote: '매월 10일 근로자 명의 계좌로 지급한다.',
      explanation: '임금 지급일과 지급 방법을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'a1e0c3b2-0010-4c1a-9a01-000000000010', code: 'MISSING_SCHEDULED_HOURS', category: 'MISSING', labels: ['근로시간'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0004', quote: '매주 월요일부터 금요일까지 10:00~19:00로 하며',
      explanation: '근무 요일과 시간을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'a1e0c3b2-0011-4c1a-9a01-000000000011', code: 'MISSING_HOLIDAY', category: 'MISSING', labels: ['휴일'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0007', quote: '주휴일은 매주 일요일로 한다.',
      explanation: '주휴일을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'a1e0c3b2-0012-4c1a-9a01-000000000012', code: 'MISSING_WORKPLACE', category: 'MISSING', labels: ['근무 장소·업무'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0003', quote: '근무장소는 가상시 미래로 108길 18 ○○카페 매장으로 하고',
      explanation: '근무 장소를 확인했습니다.',
    },
    {
      id: 'a1e0c3b2-0013-4c1a-9a01-000000000013', code: 'MISSING_DUTIES', category: 'MISSING', labels: ['근무 장소·업무'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0003', quote: '업무는 음료 제조 및 매장 관리로 한다.',
      explanation: '맡을 업무를 확인했습니다.',
    },
  ]),
})

/* ───────── 예시 2: 대체로 잘 쓰인 편의점 계약서 ───────── */

const S2_REV = '32a55385-d39a-4d85-b884-8d5be69fa46f'

const S2_TEXT = `근 로 계 약 서 (단시간근로자)
사업주: ○○편의점 (대표 ***)   근로자: ***
1. 근로계약기간: 2026년 11월 16일부터 기간의 정함이 없음.
2. 근무장소: 가상시 평화구 샘물로 8, ○○편의점.
3. 업무내용: 계산, 상품 진열 및 매장 정리.
4. 소정근로시간: 월·수·금 13:00~18:00 (1일 5시간, 주 15시간).
5. 휴게시간: 15:00~15:30이며 근로자가 자유롭게 이용한다.
6. 휴일: 매주 일요일을 유급 주휴일로 한다.
7. 임금: 시간급 10,500원. 기본급과 각 수당의 계산내역을 임금명세서로 교부하며 매월 25일 근로자 명의 계좌로 지급한다.
8. 연차휴가: 연차유급휴가는 근로기준법 등 관계 법령이 정한 바에 따라 부여한다.
9. 손해배상: 근무 중 발생한 재고 차이와 현금 부족액은 사유를 묻지 않고 근로자가 전액 배상한다.`

const S2 = contract({
  id: 'sample-2',
  revision: S2_REV,
  generation: '7c2e9d10-3b4a-4e5f-8a6b-9c0d1e2f3a42',
  resultId: '2395b93d-af6f-40ee-ab72-2131597a4cf6',
  inputKind: 'PDF',
  createdAt: '2026-11-12T08:57:40Z',
  completedAt: '2026-11-12T08:59:54.473187Z',
  content: S2_TEXT,
  summary: '9개 조항, 10개 항목 검토: CAUTION 1건, MISSING_SUSPECTED 0건, NEEDS_CONFIRMATION 1건, PRESENT 8건',
  built: makeItems(S2_REV, [
    {
      id: 'b2f1d4c3-0001-4d2b-8b02-000000000001', code: 'BROAD_LIABILITY', category: 'DISADVANTAGE', labels: ['손해배상·위약금'],
      status: 'CAUTION', hint: 'CAUTION', clause: 'c0010',
      quote: '근무 중 발생한 재고 차이와 현금 부족액은 사유를 묻지 않고 근로자가 전액 배상한다.',
      explanation: '근로자의 잘못이 있는지와 상관없이 모든 손실을 근로자가 떠안도록 되어 있습니다. 실제 손해와 책임 범위를 따지지 않는 배상 조항은 근로자에게 크게 불리할 수 있습니다.',
      info: ['재고·현금 차이가 생겼을 때 책임을 어떻게 판단하는지', '임금에서 바로 공제하는지'],
    },
    {
      id: 'b2f1d4c3-0002-4d2b-8b02-000000000002', code: 'DISCOVERED_ISSUE', category: 'LEGAL_RISK', labels: ['계약 종료'], source: 'GEMINI',
      status: 'NEEDS_CONFIRMATION', hint: 'NEEDS_CONFIRMATION', clause: 'c0003', quote: '2026년 11월 16일부터 기간의 정함이 없음.',
      explanation: '계약기간은 정해져 있지 않지만 수습기간이나 계약 해지 절차에 관한 내용이 없습니다. 법령 근거를 확인하지 못해 판단을 보류했어요.',
      info: ['수습기간이 있는지', '그만둘 때 언제까지 알려야 하는지'],
    },
    {
      id: 'b2f1d4c3-0003-4d2b-8b02-000000000003', code: 'MISSING_WAGE_COMPONENTS', category: 'MISSING', labels: ['임금'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0008', quote: '기본급과 각 수당의 계산내역을 임금명세서로 교부하며',
      explanation: '임금 구성 항목을 임금명세서로 안내한다는 내용을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'b2f1d4c3-0004-4d2b-8b02-000000000004', code: 'MISSING_WAGE_CALCULATION', category: 'MISSING', labels: ['임금'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0008', quote: '시간급 10,500원.',
      explanation: '시간급으로 임금을 계산한다는 내용을 확인했습니다. 2026년 최저시급(10,320원) 이상입니다.', laws: [LAW.art17],
    },
    {
      id: 'b2f1d4c3-0005-4d2b-8b02-000000000005', code: 'MISSING_WAGE_PAYMENT', category: 'MISSING', labels: ['임금'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0008', quote: '매월 25일 근로자 명의 계좌로 지급한다.',
      explanation: '임금 지급일과 지급 방법을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'b2f1d4c3-0006-4d2b-8b02-000000000006', code: 'MISSING_SCHEDULED_HOURS', category: 'MISSING', labels: ['근로시간'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0005', quote: '월·수·금 13:00~18:00 (1일 5시간, 주 15시간).',
      explanation: '근무 요일과 시간을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'b2f1d4c3-0007-4d2b-8b02-000000000007', code: 'MISSING_HOLIDAY', category: 'MISSING', labels: ['휴일'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0007', quote: '매주 일요일을 유급 주휴일로 한다.',
      explanation: '유급 주휴일을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'b2f1d4c3-0008-4d2b-8b02-000000000008', code: 'MISSING_ANNUAL_LEAVE', category: 'MISSING', labels: ['휴가'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0009', quote: '연차유급휴가는 근로기준법 등 관계 법령이 정한 바에 따라 부여한다.',
      explanation: '연차 유급휴가에 관한 내용을 확인했습니다.', laws: [LAW.art17],
    },
    {
      id: 'b2f1d4c3-0009-4d2b-8b02-000000000009', code: 'MISSING_WORKPLACE', category: 'MISSING', labels: ['근무 장소·업무'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0004', quote: '가상시 평화구 샘물로 8, ○○편의점.',
      explanation: '근무 장소를 확인했습니다.',
    },
    {
      id: 'b2f1d4c3-0010-4d2b-8b02-000000000010', code: 'MISSING_DUTIES', category: 'MISSING', labels: ['근무 장소·업무'],
      status: 'PRESENT', hint: 'NEEDS_CONFIRMATION', presence: 'PRESENT', clause: 'c0004', quote: '계산, 상품 진열 및 매장 정리.',
      explanation: '맡을 업무를 확인했습니다.',
    },
  ]),
})

export const SAMPLE_CONTRACTS: Record<string, ContractDetailResponse> = {
  'sample-1': S1,
  'sample-2': S2,
}

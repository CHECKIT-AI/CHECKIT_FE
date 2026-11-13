// 내 리포트 목록 확인용 예시 데이터 — 리포트 상세 예시(mocks/analysis.ts)에서 만듭니다.
// TODO: 목록 연동 시 GET /api/contracts 응답으로 대체.
//       단, 목록 응답(ContractSummary)에는 점검 결과 개수가 없어 카드의 개수 표시는 백엔드 협의가 필요합니다.

import { groupCounts, type GroupKey } from '../report/view'
import type { ContractSummary } from '../types/api'
import { SAMPLE_CONTRACTS } from './analysis'

export type ReportListItem = {
  contract: ContractSummary
  /** 점검이 끝난 시각. 분석 전이면 null */
  checkedAt: string | null
  /** 검토한 항목 수 */
  itemCount: number
  counts: Record<GroupKey, number> | null
}

export const SAMPLE_REPORTS: ReportListItem[] = Object.values(SAMPLE_CONTRACTS)
  .map(({ contract, current_result: r }) => ({
    contract,
    checkedAt: r?.completed_at ?? null,
    itemCount: r?.items.length ?? 0,
    counts: r ? groupCounts(r.items) : null,
  }))
  .sort((a, b) => b.contract.created_at.localeCompare(a.contract.created_at))

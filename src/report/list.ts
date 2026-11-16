// 내 리포트 목록 카드용 데이터
import type { ContractAnalysisResult, ContractSummary } from '../types/api'
import { groupCounts, type GroupKey } from './view'

export type ReportListItem = {
  contract: ContractSummary
  /**
   * 점검 결과 상태
   * - loading: 상세 조회 중 (목록 API에는 결과가 없어 상세를 따로 불러옵니다)
   * - none: 아직 분석 결과 없음
   * - ready: 결과 있음
   * - unknown: 상세를 불러오지 못함
   */
  result: 'loading' | 'none' | 'ready' | 'unknown'
  /** 점검이 끝난 시각 */
  checkedAt: string | null
  /** 검토한 항목 수 */
  itemCount: number
  counts: Record<GroupKey, number> | null
}

export function toListItem(contract: ContractSummary, result?: ContractAnalysisResult | null): ReportListItem {
  if (result === undefined) return { contract, result: 'loading', checkedAt: null, itemCount: 0, counts: null }
  if (result === null) return { contract, result: 'none', checkedAt: null, itemCount: 0, counts: null }
  return {
    contract,
    result: 'ready',
    checkedAt: result.completed_at,
    itemCount: result.items.length,
    counts: groupCounts(result.items),
  }
}

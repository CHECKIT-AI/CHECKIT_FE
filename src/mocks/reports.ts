// 내 리포트 목록 확인용 예시 — 리포트 상세 예시(mocks/analysis.ts)에서 만듭니다.
// 개발 서버에서만 실제 목록 아래 '예시 리포트'로 보여줍니다.

import { toListItem, type ReportListItem } from '../report/list'
import { SAMPLE_CONTRACTS } from './analysis'

export const SAMPLE_REPORTS: ReportListItem[] = Object.values(SAMPLE_CONTRACTS)
  .map(({ contract, current_result }) => toListItem(contract, current_result))
  .sort((a, b) => b.contract.created_at.localeCompare(a.contract.created_at))

/** 예시 리포트 ID인지 (서버에 없는 데이터) */
export const isSampleId = (id: string) => id in SAMPLE_CONTRACTS

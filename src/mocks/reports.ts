// 화면 확인용 예시 데이터입니다. API 연결 시 GET /api/contracts 응답으로 대체합니다.

export type ReportSummary = {
  /** 법령 위반 가능성 */
  violation: number
  /** 주의 조항 (불리한 조건·명확성 부족) */
  warning: number
  /** 누락 의심 */
  missing: number
  /** 추가 확인 필요 */
  needsCheck: number
  /** 확인됨 */
  ok: number
  /** 서명 전 확인할 사항 */
  questions: number
  /** 분석한 조항 수 */
  clauses: number
}

export type Report = {
  id: string
  title: string
  checkedAt: string
  summary: ReportSummary
}

export const SAMPLE_REPORTS: Report[] = [
  {
    id: 'sample-1',
    title: 'OO카페 근로계약서',
    checkedAt: '2026-11-01T14:05:00',
    summary: { violation: 1, warning: 2, missing: 1, needsCheck: 1, ok: 3, questions: 5, clauses: 8 },
  },
  {
    id: 'sample-2',
    title: 'OO편의점 근로계약서',
    checkedAt: '2026-10-02T15:20:00',
    summary: { violation: 1, warning: 0, missing: 2, needsCheck: 0, ok: 3, questions: 3, clauses: 5 },
  },
  {
    id: 'sample-3',
    title: 'OO학원 근로계약서',
    checkedAt: '2026-09-18T10:42:00',
    summary: { violation: 0, warning: 0, missing: 0, needsCheck: 0, ok: 5, questions: 0, clauses: 9 },
  },
]

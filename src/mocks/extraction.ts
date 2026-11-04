// 화면 확인용 예시 OCR 결과입니다. API 연결 시 POST /api/contracts 응답으로 대체합니다.
import type { ExtractionResult, TextBlock } from '../types/extraction'

const LINES: { text: string; confidence: number }[] = [
  { text: '근 로 계 약 서', confidence: 0.98 },
  { text: '사업주 OO카페(대표 김OO)와 근로자는 다음과 같이 근로계약을 체결한다.', confidence: 0.95 },
  { text: '제1조 (계약기간) 계약기간은 2026년 11월 1일부터 2027년 4월 30일까지로 한다.', confidence: 0.96 },
  { text: '제2조 (근무 장소 및 업무) 근무 장소는 OO카페 OO점으로 하며, 음료 제조 및 매장 관리 업무를 수행한다.', confidence: 0.94 },
  { text: '제3조 (임금) 시급은 1O,5OO원으로 하며, 매월 1O일 근로자 명의의 계좌로 지급한다.', confidence: 0.71 },
  { text: '제4조 (근무시간) 근무시간은 주 4일, 18:00~22:00로 하며 휴게시간은 3O분으로 한다. 업무 상황에 따라 근무시간이 변경될 수 있다.', confidence: 0.78 },
  { text: '제5조 (연차유급휴가) 연차유급휴가는 관련 법령에 따른다.', confidence: 0.92 },
  { text: '제6조 (임금 공제) 근로자의 실수로 발생한 매장 손실은 다음 달 임금에서 공제한다.', confidence: 0.88 },
  { text: '제7조 (손해배상) 근로자가 계약기간 중 ▒▒할 경우 ▒▒금 ▒0만 원을 지급한다.', confidence: 0.41 },
  { text: '제8조 (기타) 이 계약에 정하지 않은 사항은 근로기준법에 따른다.', confidence: 0.95 },
]

function buildBlocks(): { content: string; blocks: TextBlock[] } {
  let offset = 0
  const blocks = LINES.map((line, i) => {
    const start = offset
    const end = start + [...line.text].length
    offset = end + 1 // 줄바꿈
    const top = 0.08 + i * 0.085
    return {
      block_id: `blk_${String(i + 1).padStart(3, '0')}`,
      page_id: 'page_001',
      start,
      end,
      text: line.text,
      regions: [
        [
          [0.08, top],
          [0.92, top],
          [0.92, top + 0.06],
          [0.08, top + 0.06],
        ],
      ],
      recognition_confidence: line.confidence,
      is_user_edited: false,
    } satisfies TextBlock
  })
  return { content: LINES.map((l) => l.text).join('\n'), blocks }
}

const { content, blocks } = buildBlocks()

export const SAMPLE_EXTRACTION: ExtractionResult = {
  contract_id: 'sample-contract',
  file_generation_id: 'sample-generation',
  revision_id: 'sample-revision-1',
  content,
  pages: [{ page_id: 'page_001', page_order: 1, method: 'OCR', status: 'PARTIAL' }],
  blocks,
  review_candidates: [
    { block_id: 'blk_005', field: '시급', value: '1O,5OO원' },
    { block_id: 'blk_005', field: '임금 지급일', value: '매월 1O일' },
    { block_id: 'blk_006', field: '근로시간', value: '18:00~22:00' },
    { block_id: 'blk_009', field: '위약금', value: '▒0만 원' },
  ],
  warnings: [
    { code: 'LOW_CONFIDENCE', page_id: 'page_001', message: '일부 줄의 인식 신뢰도가 낮아요.' },
  ],
}

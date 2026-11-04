// 백엔드 설계(CHECKIT_BE/docs/ai-interface-design.md)의 ExtractionOutput·TextBlock 형식입니다.
// 업로드·텍스트 추출 API(POST /api/contracts) 응답의 text 부분에 해당합니다.

/** 원본 페이지 기준 0~1 정규화 좌표 polygon. [[x, y], ...] */
export type Region = [number, number][]

export type TextBlock = {
  block_id: string
  page_id: string
  /** content 안의 위치 [start, end). 프론트는 offset 대신 block_id·text 기준으로 편집합니다. */
  start: number
  end: number
  text: string
  regions: Region[]
  /** 0~1. OCR 엔진 신호이며 정확도 확률이 아님. PDF 내장 텍스트는 null */
  recognition_confidence: number | null
  is_user_edited: boolean
}

export type ExtractionPage = {
  page_id: string
  page_order: number
  /** OCR 또는 PDF 내장 텍스트 */
  method: 'OCR' | 'NATIVE_TEXT'
  status: 'OK' | 'PARTIAL' | 'UNREADABLE'
}

/**
 * 확인이 필요한 핵심 값 후보.
 * 설계 문서에는 "임금·시간 등 핵심 값 후보와 불확실 블록 ID"로만 정의돼 있어,
 * 세부 필드는 백엔드와 확정이 필요합니다(현재는 프론트 가정).
 */
export type ReviewCandidate = {
  block_id: string
  field: string
  value: string
}

export type ExtractionWarning = {
  code: string
  page_id?: string
  message: string
}

export type ExtractionResult = {
  contract_id: string
  file_generation_id: string
  revision_id: string
  content: string
  pages: ExtractionPage[]
  blocks: TextBlock[]
  review_candidates: ReviewCandidate[]
  warnings: ExtractionWarning[]
}

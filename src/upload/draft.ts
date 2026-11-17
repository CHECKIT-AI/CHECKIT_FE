// 첫 화면에서 고른 파일을 인식 결과 확인 화면(/review)으로 넘깁니다.
// File은 라우터 state로 넘기기에 크고 새로고침하면 어차피 사라지므로 메모리에만 둡니다.

import type { InputKind } from '../types/api'
import type { UploadSelection } from './ocr'
import type { PageText } from './privacy'

let pending: UploadSelection | null = null

export function setPendingUpload(selection: UploadSelection) {
  pending = selection
}

export function getPendingUpload() {
  return pending
}

export function clearPendingUpload() {
  pending = null
}

/** 개인정보를 가리고 동의까지 마친 텍스트. 저장(POST /api/contracts) 단계에서 씁니다. */
export type ConfirmedText = { kind: InputKind; pages: PageText[] }

let confirmed: ConfirmedText | null = null

export function setConfirmedText(text: ConfirmedText) {
  confirmed = text
}

export function getConfirmedText() {
  return confirmed
}

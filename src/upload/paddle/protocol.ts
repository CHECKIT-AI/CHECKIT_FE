// 화면 ↔ PaddleOCR Worker 메시지 형식

import type { Box } from '../ocr'

export type PaddleRegion = {
  text: string
  /** 인식 신뢰도(0~1) */
  score: number
  /** 원본 이미지에서의 위치 */
  box: Box
  /** 기울어진 글자 영역의 중심·기울기(라디안)·높이 (줄 묶기용) */
  cx: number
  cy: number
  angle: number
  height: number
}

export type PaddleBackend = 'wasm' | 'webgpu'
/** auto: WebGPU가 되면 WebGPU, 안 되면 wasm */
export type PaddleBackendChoice = PaddleBackend | 'auto'

export type PaddleRequest =
  | { type: 'recognize'; id: number; image: ImageBitmap; backend: PaddleBackendChoice }
  | { type: 'cancel'; id: number }

export type PaddleResponse =
  | { type: 'progress'; id: number; stage: 'download' | 'prepare' | 'detect' | 'recognize'; ratio: number | null }
  | {
      type: 'result'
      id: number
      regions: PaddleRegion[]
      backend: PaddleBackend
      /** 단계별 걸린 시간(ms): 모델 준비, 영역 찾기, 글자 인식 */
      ms: { load: number; detect: number; recognize: number }
    }
  | { type: 'error'; id: number; message: string }
  | { type: 'cancelled'; id: number }

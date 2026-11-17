// PaddleOCR Worker를 부르고, 찾은 글자 영역을 줄 단위로 묶습니다.
// Worker와 모델은 한 번 만들면 계속 씁니다. (다시 받지 않도록)

import type { Box, ExtractedLine } from '../ocr'
import type { PaddleBackendChoice, PaddleRegion, PaddleResponse } from './protocol'

/** 이 값보다 인식 신뢰도가 낮은 줄은 확인이 필요하다고 표시합니다. (0~1) */
const LOW_SCORE = 0.9

export type PaddleProgress = { stage: 'download' | 'prepare' | 'detect' | 'recognize'; ratio: number | null }

/**
 * 실행 방식. 기본은 auto(WebGPU가 되면 그래픽 카드, 안 되면 CPU)입니다.
 * 비교하려면 브라우저 콘솔에서 localStorage.setItem('checkit.paddleBackend', 'wasm' 또는 'webgpu')
 */
function backend(): PaddleBackendChoice {
  try {
    const v = localStorage.getItem('checkit.paddleBackend')
    return v === 'wasm' || v === 'webgpu' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

let worker: Worker | null = null
let nextId = 1

function getWorker() {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function paddleRecognize(
  image: ImageBitmap,
  onProgress: (p: PaddleProgress) => void,
  signal?: AbortSignal,
): Promise<{ lines: ExtractedLine[]; confidence: number }> {
  if (signal?.aborted) {
    image.close()
    return Promise.reject(new DOMException('취소됨', 'AbortError'))
  }
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<PaddleResponse>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') {
        onProgress({ stage: msg.stage, ratio: msg.ratio })
        return
      }
      w.removeEventListener('message', onMessage)
      if (msg.type === 'cancelled') {
        reject(new DOMException('취소됨', 'AbortError'))
        return
      }
      if (msg.type === 'error') {
        reject(new Error(msg.message))
        return
      }
      console.info(
        `[PaddleOCR] ${msg.backend} · 영역 ${msg.regions.length}개 · 모델 준비 ${msg.ms.load}ms · 영역 찾기 ${msg.ms.detect}ms · 글자 인식 ${msg.ms.recognize}ms`,
      )
      resolve(toLines(msg.regions))
    }
    w.addEventListener('message', onMessage)
    signal?.addEventListener('abort', () => w.postMessage({ type: 'cancel', id }), { once: true })
    w.postMessage({ type: 'recognize', id, image, backend: backend() }, [image])
  })
}

/**
 * 글자 영역을 줄로 묶습니다. 사진이 기울어져 있을 수 있으므로
 * 전체 기울기 방향으로 좌표를 돌린 뒤, 세로 위치가 가까운 영역끼리 한 줄로 봅니다.
 */
function toLines(regions: PaddleRegion[]): { lines: ExtractedLine[]; confidence: number } {
  if (!regions.length) return { lines: [], confidence: 0 }
  // 긴 영역의 기울기를 대표로 씁니다.
  const g = [...regions].sort((a, b) => b.box.x1 - b.box.x0 - (a.box.x1 - a.box.x0))[0].angle
  const cos = Math.cos(g)
  const sin = Math.sin(g)
  const placed = regions
    .map((r) => ({ r, u: r.cx * cos + r.cy * sin, v: -r.cx * sin + r.cy * cos }))
    .sort((a, b) => a.v - b.v)

  const groups: (typeof placed)[] = []
  for (const p of placed) {
    const line = groups[groups.length - 1]
    const ref = line?.[0]
    if (ref && Math.abs(p.v - ref.v) < Math.min(ref.r.height, p.r.height) * 0.5) line.push(p)
    else groups.push([p])
  }

  let weighted = 0
  let chars = 0
  const lines = groups.map((group) => {
    group.sort((a, b) => a.u - b.u)
    const text = group.map((p) => p.r.text.trim()).join(' ')
    let score = 0
    let len = 0
    for (const { r } of group) {
      score += r.score * r.text.length
      len += r.text.length
    }
    score = len ? score / len : 0
    weighted += score * len
    chars += len
    const box: Box = {
      x0: Math.min(...group.map((p) => p.r.box.x0)),
      y0: Math.min(...group.map((p) => p.r.box.y0)),
      x1: Math.max(...group.map((p) => p.r.box.x1)),
      y1: Math.max(...group.map((p) => p.r.box.y1)),
    }
    return { text, low: score < LOW_SCORE && text.length > 1, box }
  })
  return { lines, confidence: Math.round((chars ? weighted / chars : 0) * 100) }
}

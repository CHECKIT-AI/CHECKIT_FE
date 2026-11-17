/// <reference lib="webworker" />
// PaddleOCR(ONNX)을 브라우저에서 돌리는 Web Worker. 화면이 멈추지 않도록 별도 스레드에서 실행합니다.
//
// 처리 순서 (PaddleX OCR 파이프라인과 같은 값)
// 1. 글자 영역 찾기(det): 이미지를 32의 배수로 맞추고 정규화 → 확률 지도
// 2. 확률 지도 > 0.3 인 픽셀을 덩어리(연결 요소)로 묶고, 평균 확률 < 0.6 은 버림
// 3. 덩어리마다 기울기(PCA)를 구해 기울어진 사각형으로 감싸고 1.5배 비율로 넓힘(unclip)
// 4. 그 사각형을 똑바로 펴서 높이 48로 잘라 글자 인식(rec) → CTC로 글자 이어 붙이기
//
// 모델 파일: public/models/paddle/ (scripts/paddle-models.sh 로 만듭니다)

import * as ort from 'onnxruntime-web/webgpu'
import type { PaddleBackendChoice, PaddleRequest, PaddleResponse, PaddleRegion } from './protocol'

const MODEL_BASE = '/models/paddle'
const DET_THRESH = 0.3
const DET_BOX_THRESH = 0.6
const DET_UNCLIP = 1.5
/** 브라우저 메모리·속도 때문에 긴 변을 이 크기로 줄여서 찾습니다. (PaddleX 기본은 4000) */
const DET_MAX_SIDE = 2560
const DET_MEAN = [0.485, 0.456, 0.406]
const DET_STD = [0.229, 0.224, 0.225]
const REC_H = 48
const REC_MIN_W = 320
const REC_MAX_W = 3200

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`

const post = (msg: PaddleResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer)
/** 지금 처리 중인 요청 번호 (진행률 메시지에 붙입니다) */
let currentId = 0
/** 요청을 하나씩 차례로 처리합니다. 같은 모델을 동시에 돌리지 않도록 합니다. */
let queue: Promise<void> = Promise.resolve()

/** 진행률을 알리면서 파일을 받습니다. */
async function download(path: string, onBytes: (n: number) => void) {
  const res = await fetch(`${MODEL_BASE}/${path}`)
  if (!res.ok || !res.body) {
    throw new Error(
      `PaddleOCR 모델 파일(${path})을 찾지 못했어요. 프로젝트에서 'bash scripts/paddle-models.sh'를 먼저 실행해 주세요.`,
    )
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('text/html')) {
    // 개발 서버는 없는 파일에 index.html을 돌려줍니다.
    throw new Error(
      `PaddleOCR 모델 파일(${path})이 없어요. 프로젝트에서 'bash scripts/paddle-models.sh'를 먼저 실행해 주세요.`,
    )
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

type Backend = 'wasm' | 'webgpu'
type Models = { det: ort.InferenceSession; rec: ort.InferenceSession; dict: string[] }

let files: Promise<{ det: Uint8Array; rec: Uint8Array; dict: string[] }> | null = null
const sessions = new Map<Backend, Promise<Models>>()

function loadFiles() {
  files ??= (async () => {
    const total = 75_000_000 // 대략적인 전체 크기(진행률 표시용)
    let got = 0
    const onBytes = (n: number) => {
      got += n
      post({ type: 'progress', id: currentId, stage: 'download', ratio: Math.min(1, got / total) })
    }
    const [det, rec, dict] = await Promise.all([
      download('det.onnx', onBytes),
      download('rec.onnx', onBytes),
      download('korean_dict.json', onBytes),
    ])
    return { det, rec, dict: JSON.parse(new TextDecoder().decode(dict)) as string[] }
  })()
  files.catch(() => {
    files = null // 다음에 다시 시도할 수 있게
  })
  return files
}

/**
 * wasm: CPU(WebAssembly). 어느 브라우저에서나 동작합니다.
 * webgpu: 그래픽 카드. 더 빠르지만(이 Mac에서 약 1.5배) 안 되는 브라우저·기기가 있습니다.
 */
function load(backend: Backend) {
  let p = sessions.get(backend)
  if (!p) {
    p = (async () => {
      const f = await loadFiles()
      post({ type: 'progress', id: currentId, stage: 'prepare', ratio: null })
      const opts: ort.InferenceSession.SessionOptions = { executionProviders: [backend] }
      // 바이트 배열을 넘기면 ort가 가져갈 수 있어 복사본을 씁니다(다른 방식으로 다시 만들 수 있게).
      const det = await ort.InferenceSession.create(f.det.slice(), opts)
      const rec = await ort.InferenceSession.create(f.rec.slice(), opts)
      return { det, rec, dict: f.dict }
    })()
    p.catch(() => sessions.delete(backend))
    sessions.set(backend, p)
  }
  return p
}

/** auto면 WebGPU를 먼저 시도하고, 안 되면 wasm으로 돌립니다. */
let autoBackend: Backend | null = null
async function loadFor(choice: PaddleBackendChoice): Promise<Models & { backend: Backend }> {
  if (choice !== 'auto') return { ...(await load(choice)), backend: choice }
  if (autoBackend) return { ...(await load(autoBackend)), backend: autoBackend }
  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()
      if (adapter) {
        const models = await load('webgpu')
        autoBackend = 'webgpu'
        return { ...models, backend: 'webgpu' }
      }
    } catch (e) {
      console.warn('[PaddleOCR] WebGPU를 쓸 수 없어 wasm으로 돌립니다.', e)
    }
  }
  autoBackend = 'wasm'
  return { ...(await load('wasm')), backend: 'wasm' }
}

/* ───────── 이미지 → 텐서 ───────── */

function pixels(source: CanvasImageSource, w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

/** RGBA → CHW BGR float (PaddleOCR은 OpenCV처럼 BGR 순서로 학습되었습니다) */
function toTensor(rgba: Uint8ClampedArray, w: number, h: number, mean: number[], std: number[], outW = w) {
  const plane = h * outW
  const data = new Float32Array(3 * plane)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const o = y * outW + x
      // BGR
      data[o] = (rgba[i + 2] / 255 - mean[0]) / std[0]
      data[plane + o] = (rgba[i + 1] / 255 - mean[1]) / std[1]
      data[2 * plane + o] = (rgba[i] / 255 - mean[2]) / std[2]
    }
  }
  return data
}

/* ───────── 1~3. 글자 영역 찾기 ───────── */

type Quad = { cx: number; cy: number; ux: number; uy: number; len: number; height: number; score: number }

async function detect(det: ort.InferenceSession, image: ImageBitmap): Promise<Quad[]> {
  const { width: w, height: h } = image
  const scale = Math.min(1, DET_MAX_SIDE / Math.max(w, h))
  const rw = Math.max(32, Math.round((w * scale) / 32) * 32)
  const rh = Math.max(32, Math.round((h * scale) / 32) * 32)
  const input = new ort.Tensor('float32', toTensor(pixels(image, rw, rh), rw, rh, DET_MEAN, DET_STD), [1, 3, rh, rw])
  const out = await det.run({ [det.inputNames[0]]: input })
  const prob = (await out[det.outputNames[0]].getData()) as Float32Array
  input.dispose()

  const sx = w / rw
  const sy = h / rh
  const n = rw * rh
  const label = new Int32Array(n)
  const stack = new Int32Array(n)
  const quads: Quad[] = []

  // 덩어리별 통계: 픽셀 수, 좌표 합·제곱합, 확률 합
  type Stat = { count: number; sx: number; sy: number; sxx: number; syy: number; sxy: number; prob: number }
  const stats: Stat[] = [{ count: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, prob: 0 }]

  for (let start = 0; start < n; start++) {
    if (label[start] || prob[start] <= DET_THRESH) continue
    const id = stats.length
    const s: Stat = { count: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, prob: 0 }
    let top = 0
    stack[top++] = start
    label[start] = id
    while (top) {
      const p = stack[--top]
      const x = p % rw
      const y = (p - x) / rw
      s.count++
      s.sx += x
      s.sy += y
      s.sxx += x * x
      s.syy += y * y
      s.sxy += x * y
      s.prob += prob[p]
      // 4방향 이웃
      const visit = (q: number) => {
        if (!label[q] && prob[q] > DET_THRESH) {
          label[q] = id
          stack[top++] = q
        }
      }
      if (x > 0) visit(p - 1)
      if (x < rw - 1) visit(p + 1)
      if (y > 0) visit(p - rw)
      if (y < rh - 1) visit(p + rw)
    }
    stats.push(s)
  }

  // 덩어리마다 기울기(주축 방향)를 구합니다. 좌표는 원본 이미지 기준입니다.
  const axes = stats.map((s) => {
    if (s.count < 10) return null
    const mx = s.sx / s.count
    const my = s.sy / s.count
    const cxx = (s.sxx / s.count - mx * mx) * sx * sx
    const cyy = (s.syy / s.count - my * my) * sy * sy
    const cxy = (s.sxy / s.count - mx * my) * sx * sy
    const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
    return { cx: (mx + 0.5) * sx, cy: (my + 0.5) * sy, ux: Math.cos(ang), uy: Math.sin(ang) }
  })

  // 주축 기준으로 덩어리의 가로·세로 범위를 구합니다.
  const ext = stats.map(() => ({ u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity }))
  for (let p = 0; p < n; p++) {
    const id = label[p]
    const a = id && axes[id]
    if (!a) continue
    const x = p % rw
    const y = (p - x) / rw
    const dx = (x + 0.5) * sx - a.cx
    const dy = (y + 0.5) * sy - a.cy
    const u = dx * a.ux + dy * a.uy
    const v = -dx * a.uy + dy * a.ux
    const e = ext[id]
    if (u < e.u0) e.u0 = u
    if (u > e.u1) e.u1 = u
    if (v < e.v0) e.v0 = v
    if (v > e.v1) e.v1 = v
  }

  for (let id = 1; id < stats.length; id++) {
    const a = axes[id]
    if (!a) continue
    const score = stats[id].prob / stats[id].count
    if (score < DET_BOX_THRESH) continue
    const e = ext[id]
    let u0 = e.u0 - 0.5 * sx
    let u1 = e.u1 + 0.5 * sx
    let v0 = e.v0 - 0.5 * sy
    let v1 = e.v1 + 0.5 * sy
    const L = u1 - u0
    const H = v1 - v0
    if (Math.min(L, H) < 3) continue
    // unclip: 넓이 × 비율 / 둘레 만큼 바깥으로 넓힙니다.
    const d = (L * H * DET_UNCLIP) / (2 * (L + H))
    u0 -= d
    u1 += d
    v0 -= d
    v1 += d
    const mu = (u0 + u1) / 2
    const mv = (v0 + v1) / 2
    quads.push({
      cx: a.cx + mu * a.ux - mv * a.uy,
      cy: a.cy + mu * a.uy + mv * a.ux,
      ux: a.ux,
      uy: a.uy,
      len: u1 - u0,
      height: v1 - v0,
      score,
    })
  }
  return quads
}

/* ───────── 4. 글자 인식 ───────── */

async function recognizeQuad(rec: ort.InferenceSession, dict: string[], image: ImageBitmap, q: Quad) {
  const k = REC_H / q.height
  const rw = Math.min(REC_MAX_W, Math.max(1, Math.ceil(q.len * k)))
  const outW = Math.max(REC_MIN_W, rw)
  // 기울어진 사각형을 똑바로 펴서 높이 48로 그립니다.
  const canvas = new OffscreenCanvas(rw, REC_H)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, rw, REC_H)
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(rw / q.len, k)
  ctx.translate(q.len / 2, q.height / 2)
  ctx.rotate(-Math.atan2(q.uy, q.ux))
  ctx.translate(-q.cx, -q.cy)
  ctx.drawImage(image, 0, 0)
  const rgba = ctx.getImageData(0, 0, rw, REC_H).data
  // 남는 오른쪽은 0(정규화 후 값)으로 채웁니다. PaddleX와 같습니다.
  const input = new ort.Tensor('float32', toTensor(rgba, rw, REC_H, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], outW), [
    1,
    3,
    REC_H,
    outW,
  ])
  const out = await rec.run({ [rec.inputNames[0]]: input })
  const t = out[rec.outputNames[0]]
  const data = (await t.getData()) as Float32Array
  input.dispose()
  const [, steps, classes] = t.dims
  // CTC: 칸마다 가장 높은 글자를 고르고, 연속 중복과 blank(0)를 뺍니다.
  let text = ''
  let sum = 0
  let count = 0
  let prev = -1
  for (let s = 0; s < steps; s++) {
    let best = 0
    let bestP = -Infinity
    const base = s * classes
    for (let c = 0; c < classes; c++) {
      const v = data[base + c]
      if (v > bestP) {
        bestP = v
        best = c
      }
    }
    if (best !== prev && best !== 0) {
      text += dict[best] ?? ''
      sum += bestP
      count++
    }
    prev = best
  }
  return { text, score: count ? sum / count : 0 }
}

/** 기울어진 사각형의 네 꼭짓점을 감싸는 상자 */
function boundsOf(q: Quad) {
  const hx = (q.ux * q.len) / 2
  const hy = (q.uy * q.len) / 2
  const vx = (-q.uy * q.height) / 2
  const vy = (q.ux * q.height) / 2
  const xs = [q.cx - hx - vx, q.cx + hx - vx, q.cx + hx + vx, q.cx - hx + vx]
  const ys = [q.cy - hy - vy, q.cy + hy - vy, q.cy + hy + vy, q.cy - hy + vy]
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const cancelled = new Set<number>()

class Cancelled extends Error {}

self.onmessage = (e: MessageEvent<PaddleRequest>) => {
  const msg = e.data
  if (msg.type === 'cancel') {
    cancelled.add(msg.id)
    return
  }
  queue = queue.then(() => handle(msg))
}

async function handle(msg: Extract<PaddleRequest, { type: 'recognize' }>) {
  currentId = msg.id
  const check = () => {
    if (cancelled.has(msg.id)) throw new Cancelled()
  }
  try {
    check()
    const t0 = performance.now()
    const { det, rec, dict, backend } = await loadFor(msg.backend)
    const t1 = performance.now()
    post({ type: 'progress', id: currentId, stage: 'detect', ratio: null })
    check()
    const quads = await detect(det, msg.image)
    const t2 = performance.now()
    const regions: PaddleRegion[] = []
    for (const [i, q] of quads.entries()) {
      check()
      const { text, score } = await recognizeQuad(rec, dict, msg.image, q)
      if (text.trim()) {
        regions.push({
          text,
          score,
          box: boundsOf(q),
          cx: q.cx,
          cy: q.cy,
          angle: Math.atan2(q.uy, q.ux),
          height: q.height,
        })
      }
      post({ type: 'progress', id: currentId, stage: 'recognize', ratio: (i + 1) / quads.length })
    }
    const t3 = performance.now()
    msg.image.close()
    const ms = { load: Math.round(t1 - t0), detect: Math.round(t2 - t1), recognize: Math.round(t3 - t2) }
    post({ type: 'result', id: msg.id, regions, backend, ms })
  } catch (err) {
    msg.image.close()
    if (err instanceof Cancelled) post({ type: 'cancelled', id: msg.id })
    else post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  } finally {
    cancelled.delete(msg.id)
  }
}

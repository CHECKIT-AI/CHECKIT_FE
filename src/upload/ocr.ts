// 브라우저에서 계약서 글자를 읽습니다. 파일은 서버로 보내지 않습니다.
// - PDF: 글자가 들어 있는 페이지는 그 글자를 그대로 쓰고, 없는 페이지(스캔본)만 OCR
// - 사진: 모든 장을 OCR
// OCR은 PaddleOCR(ONNX)을 브라우저에서 돌립니다. (src/upload/paddle/)

import type { InputKind } from '../types/api'

/** 백엔드 제한: 페이지 1~10개, 페이지당 20,000자 (app/contracts.py, app/analysis.py) */
export const MAX_PAGES = 10
export const MAX_PAGE_CHARS = 20000

const IMAGE_TYPES = ['image/jpeg', 'image/png']

export type UploadSelection = { kind: InputKind; files: File[] }

/** 원본 이미지에서 한 줄이 차지하는 영역(이미지 픽셀 기준) */
export type Box = { x0: number; y0: number; x1: number; y1: number }

export type ExtractedLine = {
  text: string
  /** 인식 신뢰도가 낮아 확인이 필요한 줄 */
  low: boolean
  /** 원본에서의 위치. 모르면 null */
  box: Box | null
}

export type ExtractedPage = {
  page: number
  /** 빈 줄 없이 한 줄씩. 저장할 때는 줄바꿈으로 이어 붙입니다. */
  lines: ExtractedLine[]
  /** PDF_TEXT: PDF에 들어 있던 글자, OCR: 사진에서 읽은 글자 */
  source: 'PDF_TEXT' | 'OCR'
  /** OCR 평균 신뢰도(0~100). PDF 글자는 null */
  confidence: number | null
  /** 원본 미리보기(blob: URL). 다 쓰면 revokePreviews로 해제합니다. */
  previewUrl: string
  /** 미리보기 이미지 크기(픽셀). box 좌표의 기준입니다. */
  width: number
  height: number
}

export type OcrProgress = {
  page: number
  total: number
  /** 이 페이지에서 진행한 비율(0~1). 알 수 없으면 null */
  ratio: number | null
  label: string
}

/** 고른 파일이 PDF 한 개 또는 JPG·PNG 최대 10장인지 확인합니다. */
export function validateFiles(list: FileList | File[]): UploadSelection | { error: string } {
  const files = [...list]
  if (!files.length) return { error: '파일을 골라 주세요.' }
  const pdfs = files.filter((f) => f.type === 'application/pdf')
  if (pdfs.length) {
    return files.length === 1
      ? { kind: 'PDF', files }
      : { error: 'PDF는 한 번에 한 개만 올릴 수 있어요. 사진과 섞어서 올릴 수도 없어요.' }
  }
  if (!files.every((f) => IMAGE_TYPES.includes(f.type))) {
    return { error: 'PDF 또는 JPG·PNG 사진만 올릴 수 있어요.' }
  }
  if (files.length > MAX_PAGES) {
    return { error: `사진은 최대 ${MAX_PAGES}장까지 올릴 수 있어요.` }
  }
  // 백엔드 테스트 페이지처럼 파일 이름 순서(1, 2, 10 순)를 페이지 순서로 봅니다.
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }))
  return { kind: 'IMAGES', files: sorted }
}

export class OcrCancelled extends Error {}

/**
 * 고른 파일의 글자를 페이지별로 읽습니다.
 * signal이 취소되면 OcrCancelled를 던지고 만들어 둔 미리보기를 해제합니다.
 */
export async function extractPages(
  selection: UploadSelection,
  onProgress: (p: OcrProgress) => void,
  signal: AbortSignal,
): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = []
  // OCR 진행률을 현재 페이지에 연결합니다.
  let current = { page: 1, total: selection.files.length }

  const checkCancelled = () => {
    if (signal.aborted) throw new OcrCancelled()
  }

  const recognize = async (image: HTMLCanvasElement | File) => {
    const { paddleRecognize } = await import('./paddle/client')
    const bitmap = await createImageBitmap(image)
    if (signal.aborted) bitmap.close()
    checkCancelled()
    return paddleRecognize(bitmap, ({ stage, ratio }) => {
      const label = {
        download: '글자 인식 모델을 내려받는 중',
        prepare: '글자 인식 모델을 준비하는 중',
        detect: '글자 영역을 찾는 중',
        recognize: '글자를 인식하는 중',
      }[stage]
      onProgress({ ...current, ratio, label })
    }, signal)
  }

  try {
    if (selection.kind === 'PDF') {
      onProgress({ ...current, ratio: null, label: 'PDF를 여는 중' })
      const pdfjs = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      // 한글 글꼴(CID 글꼴)을 읽으려면 문자표(CMap)가 있어야 합니다. 없으면 한글이 모두 빠집니다.
      // 같은 버전의 jsDelivr 파일을 씁니다.
      const assets = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}`
      const task = pdfjs.getDocument({
        data: new Uint8Array(await selection.files[0].arrayBuffer()),
        cMapUrl: `${assets}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}/standard_fonts/`,
      })
      signal.addEventListener('abort', () => void task.destroy(), { once: true })
      const pdf = await task.promise.catch((e: unknown) => {
        throw new Error(pdfErrorMessage(e))
      })
      if (pdf.numPages > MAX_PAGES) {
        throw new Error(`PDF는 최대 ${MAX_PAGES}페이지까지 점검할 수 있어요. (이 파일은 ${pdf.numPages}페이지)`)
      }
      for (let n = 1; n <= pdf.numPages; n++) {
        checkCancelled()
        current = { page: n, total: pdf.numPages }
        onProgress({ ...current, ratio: null, label: '페이지를 읽는 중' })
        const page = await pdf.getPage(n)
        const viewport = page.getViewport({ scale: 2 })
        const content = await page.getTextContent()
        const embedded = pdfLines(content.items, (m) => pdfjs.Util.transform(viewport.transform, m), viewport.scale)
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        // 기본(display)은 requestAnimationFrame으로 그려서 다른 탭을 보는 동안 멈춥니다. print는 멈추지 않습니다.
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport, intent: 'print' }).promise
        checkCancelled()
        const previewUrl = await canvasToUrl(canvas)
        const size = { width: canvas.width, height: canvas.height }
        if (embedded.length) {
          pages.push({ page: n, lines: embedded, source: 'PDF_TEXT', confidence: null, previewUrl, ...size })
        } else {
          pages.push({ page: n, source: 'OCR', previewUrl, ...size, lines: [], confidence: null })
          Object.assign(pages[pages.length - 1], await recognize(canvas))
        }
      }
      void pdf.destroy()
    } else {
      for (const [i, file] of selection.files.entries()) {
        checkCancelled()
        current = { page: i + 1, total: selection.files.length }
        const previewUrl = URL.createObjectURL(file)
        const bitmap = await createImageBitmap(file)
        const size = { width: bitmap.width, height: bitmap.height }
        bitmap.close()
        pages.push({ page: i + 1, source: 'OCR', previewUrl, ...size, lines: [], confidence: null })
        Object.assign(pages[i], await recognize(file))
      }
    }
    checkCancelled()
    return pages
  } catch (e) {
    revokePreviews(pages)
    if (signal.aborted) throw new OcrCancelled()
    throw e
  }
}

export function revokePreviews(pages: { previewUrl: string }[]) {
  for (const p of pages) URL.revokeObjectURL(p.previewUrl)
}

type PdfTextItem = { str: string; hasEOL: boolean; transform: number[]; width: number; height: number }

/**
 * PDF 글자 조각을 줄 단위로 묶습니다.
 * 조각은 글꼴이 바뀔 때마다 나뉘므로(예: "10" + "시") 실제로 떨어져 있을 때만 띄어 씁니다.
 * toViewport는 PDF 좌표를 미리보기 이미지 좌표로 바꿉니다.
 */
function pdfLines(items: unknown[], toViewport: (m: number[]) => number[], scale: number): ExtractedLine[] {
  const lines: ExtractedLine[] = []
  let text = ''
  let box: Box | null = null
  let prev: { endX: number; y: number; size: number } | null = null

  const flush = () => {
    const t = text.replace(/\s+/g, ' ').trim()
    if (t) lines.push({ text: t, low: false, box })
    text = ''
    box = null
    prev = null
  }

  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null || !('str' in raw)) continue
    const it = raw as PdfTextItem
    if (it.str) {
      const x = it.transform[4]
      const y = it.transform[5]
      const size = Math.abs(it.height) || Math.abs(it.transform[3]) || 10
      if (prev && Math.abs(y - prev.y) > prev.size * 0.5) flush() // 다른 줄
      else if (prev && x - prev.endX > size * 0.15 && !text.endsWith(' ')) text += ' '
      text += it.str
      const m = toViewport(it.transform)
      const h = Math.hypot(m[2], m[3])
      const b = { x0: m[4], y0: m[5] - h, x1: m[4] + it.width * scale, y1: m[5] }
      box = box
        ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) }
        : b
      prev = { endX: x + it.width, y, size }
    }
    if (it.hasEOL) flush()
  }
  flush()
  return lines
}

function canvasToUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('미리보기를 만들지 못했어요.'))), 'image/png'),
  )
}

function pdfErrorMessage(e: unknown) {
  const name = e instanceof Error ? e.name : ''
  if (name === 'PasswordException') return '비밀번호가 걸린 PDF는 열 수 없어요. 비밀번호를 풀고 다시 올려 주세요.'
  if (name === 'InvalidPDFException') return 'PDF 파일이 손상되었거나 PDF 형식이 아니에요.'
  return 'PDF를 열지 못했어요.'
}

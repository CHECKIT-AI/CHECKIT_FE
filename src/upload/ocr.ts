// 브라우저에서 계약서 글자를 읽습니다. 파일은 서버로 보내지 않습니다.
// - PDF: 글자가 들어 있는 페이지는 그 글자를 그대로 쓰고, 없는 페이지(스캔본)만 OCR
// - 사진: 모든 장을 OCR
// OCR은 PaddleOCR(ONNX)을 브라우저에서 돌립니다. (src/upload/paddle/)

import type { InputKind } from '../types/api'
import { fileError } from './errors'
import { heicToJpeg, isHeicName, looksLikeHeic } from './heic'

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

/** 고른 파일이 PDF 한 개 또는 JPG·PNG·HEIC 최대 10장인지 확인합니다. */
export function validateFiles(list: FileList | File[]): UploadSelection | { error: string } {
  const files = [...list]
  if (!files.length) return { error: '파일을 골라 주세요.' }
  const pdfs = files.filter((f) => f.type === 'application/pdf')
  if (pdfs.length) {
    return files.length === 1
      ? { kind: 'PDF', files }
      : { error: 'PDF는 한 번에 한 개만 올릴 수 있어요. 사진과 섞어서 올릴 수도 없어요.' }
  }
  if (!files.every((f) => IMAGE_TYPES.includes(f.type) || isHeicName(f))) {
    return { error: 'PDF 또는 JPG·PNG·HEIC 사진만 올릴 수 있어요.' }
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
    const bitmap = await createImageBitmap(image).catch(() => {
      throw fileError('이미지를 열지 못했어요.\n파일이 손상되었을 수 있어요.\n다른 파일로 다시 올려 주세요.')
    })
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
        throw fileError(pdfErrorMessage(e))
      })
      if (pdf.numPages > MAX_PAGES) {
        throw fileError(`PDF가 너무 길어요. (${pdf.numPages}페이지)\n최대 ${MAX_PAGES}페이지까지 점검할 수 있어요.`)
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
      for (const [i, original] of selection.files.entries()) {
        checkCancelled()
        current = { page: i + 1, total: selection.files.length }
        // 아이폰 사진(HEIC)은 JPG로 바꿔서 읽습니다. 확장자만 .jpg·.png로 바뀐 HEIC도 여기서 걸러집니다.
        let file = original
        if (await looksLikeHeic(original)) {
          onProgress({ ...current, ratio: null, label: '아이폰 사진(HEIC)을 JPG로 바꾸는 중' })
          file = await heicToJpeg(original).catch((e: unknown) => {
            console.error('[HEIC]', e)
            throw fileError(
              [
                `'${original.name}' 사진(HEIC)을 바꾸지 못했어요.`,
                '파일이 손상되었을 수 있어요.',
                '사진 앱에서 JPG로 내보내서 다시 올려 주세요.',
              ].join('\n'),
            )
          })
          checkCancelled()
        }
        const previewUrl = URL.createObjectURL(file)
        const bitmap = await createImageBitmap(file).catch(() => {
          throw fileError(imageErrorMessage(file))
        })
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

/** 줄을 묶을 때 쓰는 PDF 좌표 정보 */
type LineMeta = { x0: number; x1: number; top: number; size: number }

/** 새 조항이나 항목이 시작되는 줄 ("1.", "제3조", "(근로자)", "가.", "①" 등) */
const NEW_ITEM = /^(\d+\s*[.)]|제\s*\d+\s*조|[(（［[]|[가-하]\s*[.)]|[①-⑳]|[-•·※*])/

/**
 * PDF 글자 조각을 줄 단위로 묶습니다.
 * 조각은 글꼴이 바뀔 때마다 나뉘므로(예: "10" + "시") 실제로 떨어져 있을 때만 띄어 씁니다.
 * toViewport는 PDF 좌표를 미리보기 이미지 좌표로 바꿉니다.
 */
function pdfLines(items: unknown[], toViewport: (m: number[]) => number[], scale: number): ExtractedLine[] {
  const lines: ExtractedLine[] = []
  const metas: LineMeta[] = []
  let text = ''
  let box: Box | null = null
  let meta: LineMeta | null = null
  let prev: { endX: number; y: number; size: number } | null = null

  const flush = () => {
    const t = text.replace(/\s+/g, ' ').trim()
    if (t && meta) {
      lines.push({ text: t, low: false, box })
      metas.push(meta)
    }
    text = ''
    box = null
    meta = null
    prev = null
  }

  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null || !('str' in raw)) continue
    const it = raw as PdfTextItem
    // 글꼴에 따라 띄어쓰기가 제어 문자(예: \u0001)로 나옵니다. 그대로 두면 띄어쓰기가 모두 사라집니다.
    // oxlint-disable-next-line no-control-regex -- 제어 문자를 찾는 것이 목적입니다.
    const str = it.str.replace(/[\u0000-\u001f\u007f]/g, ' ')
    if (str) {
      const x = it.transform[4]
      const y = it.transform[5]
      const size = Math.abs(it.height) || Math.abs(it.transform[3]) || 10
      if (prev && Math.abs(y - prev.y) > prev.size * 0.5) flush() // 다른 줄
      else if (prev && x - prev.endX > size * 0.15 && !text.endsWith(' ')) text += ' '
      text += str
      if (str.trim()) {
        const m = toViewport(it.transform)
        const h = Math.hypot(m[2], m[3])
        const b = { x0: m[4], y0: m[5] - h, x1: m[4] + it.width * scale, y1: m[5] }
        box = box
          ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) }
          : b
        meta = meta
          ? { x0: Math.min(meta.x0, x), x1: Math.max(meta.x1, x + it.width), top: Math.max(meta.top, y), size: Math.max(meta.size, size) }
          : { x0: x, x1: x + it.width, top: y, size }
      }
      prev = { endX: x + it.width, y, size }
    }
    if (it.hasEOL) flush()
  }
  flush()
  return joinWrapped(lines, metas)
}

/**
 * 문서 폭이 모자라 자동으로 줄이 바뀐 곳을 다시 한 줄로 잇습니다.
 * 백엔드는 조항 안의 줄바꿈을 그대로 두고, AI가 인용한 문구가 원문에 그대로 있는지 검사합니다.
 * "연장·야간근로에 대⏎한 수당"처럼 낱말 중간에서 끊기면 인용이 원문과 달라져 분석이 실패하므로 잇습니다.
 *
 * 이어진 줄로 보는 조건: 다음 줄의 첫 낱말이 앞 줄 끝에 들어갈 자리가 없고, 다음 줄이 같은 왼쪽에서 바로 아래에 이어지며,
 * 새 조항·항목 번호로 시작하지 않을 때. PDF에는 줄 끝 띄어쓰기 정보가 없어서 띄어쓰기 한 칸으로 잇습니다.
 */
function joinWrapped(lines: ExtractedLine[], metas: LineMeta[]): ExtractedLine[] {
  if (lines.length < 2) return lines
  const right = Math.max(...metas.map((m) => m.x1))
  const out: ExtractedLine[] = [lines[0]]
  let last = metas[0]
  for (let i = 1; i < lines.length; i++) {
    const m = metas[i]
    // 다음 줄의 첫 낱말이 앞 줄 남은 자리에 들어가지 않으면 '자리가 없어 넘어간 줄'로 봅니다.
    const firstWord = lines[i].text.split(' ')[0]
    const firstWordWidth = Math.min(firstWord.length, 12) * m.size * 0.9
    const wrapped =
      right - last.x1 < firstWordWidth + last.size * 0.5 && // 앞 줄이 오른쪽 끝까지 참
      Math.abs(m.x0 - last.x0) <= last.size && // 같은 왼쪽에서 시작 (들여쓰기 없음)
      last.top - m.top > 0 &&
      last.top - m.top <= last.size * 2.1 && // 문단 간격이 아닌 줄 간격
      Math.abs(m.size - last.size) <= last.size * 0.2 && // 같은 글자 크기
      !NEW_ITEM.test(lines[i].text)
    if (wrapped) {
      const a = out[out.length - 1]
      const b = lines[i]
      out[out.length - 1] = {
        text: `${a.text} ${b.text}`,
        low: a.low || b.low,
        box:
          a.box && b.box
            ? { x0: Math.min(a.box.x0, b.box.x0), y0: Math.min(a.box.y0, b.box.y0), x1: Math.max(a.box.x1, b.box.x1), y1: Math.max(a.box.y1, b.box.y1) }
            : (a.box ?? b.box),
      }
      // 이어 붙인 줄이 또 오른쪽 끝까지 차 있으면 다음 줄도 이어 붙입니다.
      last = { ...m, x0: last.x0 }
    } else {
      out.push(lines[i])
      last = m
    }
  }
  return out
}

function canvasToUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('미리보기를 만들지 못했어요.'))), 'image/png'),
  )
}

/** 사진을 열지 못했을 때. 대부분 손상된 파일이거나, 확장자와 실제 형식이 다른 경우입니다. (HEIC는 위에서 바꿔서 읽음) */
function imageErrorMessage(file: File) {
  return [
    `'${file.name}' 파일을 열지 못했어요.`,
    '파일이 손상되었거나, 확장자와 실제 파일 형식이 다를 수 있어요.',
    'JPG·PNG·HEIC 사진이 맞는지 확인하고 다시 올려 주세요.',
  ].join('\n')
}

function pdfErrorMessage(e: unknown) {
  const name = e instanceof Error ? e.name : ''
  if (name === 'PasswordException') return '비밀번호가 걸린 PDF는 열 수 없어요.\n비밀번호를 풀고 다시 올려 주세요.'
  if (name === 'InvalidPDFException') return 'PDF 파일을 열지 못했어요.\n파일이 손상되었거나, 확장자만 .pdf이고 실제로는 PDF가 아닐 수 있어요.\n파일을 확인하고 다시 올려 주세요.'
  return 'PDF 파일을 열지 못했어요.\n파일이 손상되었거나, 확장자와 실제 파일 형식이 다를 수 있어요.\n파일을 확인하고 다시 올려 주세요.'
}

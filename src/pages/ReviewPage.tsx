import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { AuthLoading } from '../components/AuthGate'
import { CheckIcon } from '../components/icons'
import { createContract, saveErrorMessage } from '../api/contracts'
import { clearPendingUpload, getPendingUpload } from '../upload/draft'
import { OcrError } from '../upload/errors'
import {
  extractPages,
  MAX_PAGE_CHARS,
  OcrCancelled,
  revokePreviews,
  type Box,
  type ExtractedPage,
  type OcrProgress,
  type UploadSelection,
} from '../upload/ocr'
import { detectMasks, type Mask, type PageText } from '../upload/privacy'
import PrivacyStep from './PrivacyStep'
import './ReviewPage.css'

type Line = {
  /** 화면 key용. 줄을 나누거나 합쳐도 바뀌지 않습니다. */
  id: number
  text: string
  /** 처음에 흐리게 읽혀 확인이 필요했던 줄 */
  low: boolean
  /** 흐린 줄을 사용자가 고치거나 '맞아요'로 확인했는지 */
  checked: boolean
  box: Box | null
}

type PageDraft = Omit<ExtractedPage, 'lines'> & {
  lines: Line[]
  /** 사용자가 원본과 비교해 확인했는지. 고치면 다시 확인해야 합니다. */
  confirmed: boolean
}

type Phase =
  | { kind: 'reading'; progress: OcrProgress | null }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }

const ZOOMS = [100, 150, 200, 300]

let nextLineId = 1
const newLine = (text: string, from?: Partial<Line>): Line => ({
  id: nextLineId++,
  text,
  low: false,
  checked: false,
  box: null,
  ...from,
})

function toDraft(p: ExtractedPage): PageDraft {
  const lines = p.lines.map((l) => newLine(l.text, { low: l.low, box: l.box }))
  // 글자를 하나도 못 읽은 페이지는 직접 입력할 빈 줄을 하나 둡니다.
  return { ...p, lines: lines.length ? lines : [newLine('')], confirmed: false }
}

/** 저장할 페이지 텍스트. 빈 줄은 빼고 줄바꿈으로 이어 붙입니다. */
function pageText(p: { lines: { text: string }[] }) {
  return p.lines
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join('\n')
}

const needsCheck = (l: Line) => l.low && !l.checked

/** 글자 인식 신뢰도(%)가 이보다 낮으면 다시 찍어 달라고 안내합니다. */
const RETAKE_BELOW = 85

function sourceLabel(p: PageDraft) {
  if (p.source === 'PDF_TEXT') return { text: 'PDF 글자 그대로', tone: 'green' }
  const conf = p.confidence ?? 0
  return { text: `글자 인식 · 신뢰도 ${conf}%`, tone: conf >= 85 ? 'green' : conf >= 60 ? 'amber' : 'red' }
}

function ReviewPage() {
  const { user, loading, expired } = useAuth()
  const [selection] = useState(getPendingUpload)

  if (loading) return <AuthLoading />
  // 쓰던 중 로그인이 만료되면 고친 내용을 바로 날리지 않고, 위쪽 안내(ExpiredBanner)로 다시 로그인하게 합니다.
  if (!user && !expired) return <Navigate to="/login" replace state={{ reason: 'upload', returnTo: '/' }} />
  if (!selection) {
    return (
      <section className="wrap review-empty">
        <h1>올린 파일이 없어요</h1>
        <p>새로고침하거나 다른 화면에 다녀오면 고른 파일이 사라져요. 계약서를 다시 올려 주세요.</p>
        <Link to="/" className="btn btn-primary">
          계약서 올리러 가기
        </Link>
      </section>
    )
  }
  return <Review selection={selection} />
}

function Review({ selection }: { selection: UploadSelection }) {
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'reading', progress: null })
  const [pages, setPages] = useState<PageDraft[]>([])
  const [current, setCurrent] = useState(0)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [zoom, setZoom] = useState(100)
  const [message, setMessage] = useState<string | null>(null)
  /** 1단계: 글자 확인, 2단계: 개인정보 가리기 */
  const [step, setStep] = useState<'review' | 'privacy'>('review')
  /** 개인정보 가림. 글자를 고치지 않았으면 돌아왔다 가도 그대로 둡니다. */
  const [privacy, setPrivacy] = useState<{ key: string; pages: PageText[]; masks: Mask[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const navigate = useNavigate()
  const inputs = useRef(new Map<number, HTMLTextAreaElement>())
  /** 줄을 나누거나 합친 뒤 커서를 옮길 위치 */
  const pendingFocus = useRef<{ id: number; at: number } | null>(null)

  // 글자 읽기. 화면을 떠나거나 다시 읽으면 진행 중인 작업을 멈춥니다.
  useEffect(() => {
    const controller = new AbortController()
    let result: ExtractedPage[] = []
    extractPages(
      selection,
      (progress) => {
        // 취소된 작업이 늦게 보내는 진행률은 무시합니다.
        if (!controller.signal.aborted) setPhase({ kind: 'reading', progress })
      },
      controller.signal,
    )
      .then((r) => {
        result = r
        setPages(r.map(toDraft))
        setCurrent(0)
        setPhase({ kind: 'ready' })
      })
      .catch((e: unknown) => {
        if (e instanceof OcrCancelled) return
        // 사용자용 문구가 아닌 오류(영어 원문 등)는 일반 안내로 바꿉니다.
        if (!(e instanceof OcrError)) console.error('[OCR]', e)
        setPhase({
          kind: 'error',
          message:
            e instanceof OcrError
              ? e.message
              : '글자를 읽는 중에 문제가 생겼어요.\n[다시 읽기]를 눌러 보고, 그래도 안 되면\n파일이 손상되지 않았는지, JPG·PNG·PDF가 맞는지 확인해 주세요.',
        })
      })
    return () => {
      controller.abort()
      revokePreviews(result) // 미리보기 이미지 해제
    }
  }, [selection, attempt])

  // 확인한 내용이 사라지지 않도록 새로고침·창 닫기 전에 물어봅니다.
  const hasWork = phase.kind === 'ready'
  useEffect(() => {
    if (!hasWork) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasWork])

  // 줄 입력칸 높이를 내용에 맞춥니다. 글꼴을 다 받거나 폭이 바뀌면 줄바꿈이 달라지므로 다시 맞춥니다.
  const fitLines = () => {
    for (const el of inputs.current.values()) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }
  const fitRef = useRef(fitLines)
  useLayoutEffect(() => {
    fitRef.current = fitLines
  })
  const listRef = useRef<HTMLOListElement>(null)
  const ready = phase.kind === 'ready' && step === 'review'
  useEffect(() => {
    const list = listRef.current
    if (!ready || !list) return
    const fit = () => fitRef.current()
    const observer = new ResizeObserver(fit)
    observer.observe(list)
    document.fonts.addEventListener('loadingdone', fit)
    void document.fonts.ready.then(fit)
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', fit)
    }
  }, [ready])

  // 내용이 바뀔 때마다 높이를 맞추고, 나누기·합치기 후 커서를 옮깁니다.
  useLayoutEffect(() => {
    fitLines()
    const f = pendingFocus.current
    if (f) {
      const el = inputs.current.get(f.id)
      el?.focus()
      el?.setSelectionRange(f.at, f.at)
      pendingFocus.current = null
    }
  })

  if (phase.kind === 'reading') return <Reading progress={phase.progress} kind={selection.kind} />

  if (phase.kind === 'error') {
    return (
      <section className="wrap review-empty">
        <h1>계약서를 읽지 못했어요</h1>
        {/* 첫 줄은 무슨 일인지, 나머지 줄은 어떻게 하면 되는지 */}
        <div className="review-error">
          {phase.message.split('\n').map((line, i) => (
            <p key={i} className={i === 0 ? 'review-error__lead' : undefined}>
              {line}
            </p>
          ))}
        </div>
        <div className="review-empty__actions">
          <Link to="/" className="btn btn-ghost">
            다른 파일 올리기
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setPhase({ kind: 'reading', progress: null })
              setAttempt((n) => n + 1)
            }}
          >
            다시 읽기
          </button>
        </div>
      </section>
    )
  }

  // 개인정보를 가린 텍스트를 저장하고 리포트 화면으로 이동합니다. (POST /api/contracts → 공용 DB에 기록)
  const save = async (masked: PageText[]) => {
    setSaving(true)
    setSaveError(null)
    try {
      const { contract_id } = await createContract({
        input_kind: selection.kind,
        pages: masked,
        privacy_confirmed: true,
        gemini_notice_acknowledged: true,
      })
      clearPendingUpload()
      navigate(`/reports/${contract_id}`, { replace: true, state: { saved: true } })
    } catch (e) {
      setSaveError(saveErrorMessage(e))
      setSaving(false)
    }
  }

  if (step === 'privacy' && privacy) {
    return (
      <PrivacyStep
        pages={privacy.pages}
        masks={privacy.masks}
        onMasksChange={(masks) => {
          setPrivacy({ ...privacy, masks })
          setSaveError(null)
        }}
        onBack={() => {
          setStep('review')
          setSaveError(null)
          window.scrollTo({ top: 0 })
        }}
        onDone={(masked) => void save(masked)}
        saving={saving}
        saveError={saveError}
      />
    )
  }

  const page = pages[current]
  const doneCount = pages.filter((p) => p.confirmed).length
  const text = pageText(page)
  const empty = !text
  const tooLong = text.length > MAX_PAGE_CHARS
  const left = page.lines.filter(needsCheck)
  const active = page.lines.find((l) => l.id === activeId) ?? null
  const src = sourceLabel(page)

  const setLines = (fn: (lines: Line[]) => Line[]) => {
    setPages((prev) =>
      prev.map((p, i) => (i === current ? { ...p, lines: fn(p.lines), confirmed: false } : p)),
    )
    setMessage(null)
  }

  const focusLine = (id: number, at?: number) => {
    const el = inputs.current.get(id)
    if (!el) return
    el.focus()
    const pos = at ?? el.value.length
    el.setSelectionRange(pos, pos)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  // 흐린 줄은 고치면 확인한 것으로 봅니다.
  const editLine = (id: number, value: string) =>
    setLines((lines) => lines.map((l) => (l.id === id ? { ...l, text: value, checked: l.low } : l)))

  const markChecked = (id: number) => {
    setPages((prev) =>
      prev.map((p, i) =>
        i === current ? { ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, checked: true } : l)) } : p,
      ),
    )
    const next = page.lines.find((l) => l.id !== id && needsCheck(l))
    if (next) focusLine(next.id, 0)
  }

  // Enter: 커서 위치에서 줄 나누기 / 줄 맨 앞에서 Backspace: 윗줄과 합치기 / ↑↓: 줄 이동
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, line: Line, index: number) => {
    if (e.nativeEvent.isComposing) return // 한글 조합 중
    const el = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      const added = newLine(line.text.slice(el.selectionEnd), { box: line.box })
      const head = line.text.slice(0, el.selectionStart)
      pendingFocus.current = { id: added.id, at: 0 }
      setLines((lines) => lines.flatMap((l) => (l.id === line.id ? [{ ...l, text: head }, added] : [l])))
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && index > 0) {
      e.preventDefault()
      const prev = page.lines[index - 1]
      pendingFocus.current = { id: prev.id, at: prev.text.length }
      setLines((lines) =>
        lines
          .filter((l) => l.id !== line.id)
          .map((l) => (l.id === prev.id ? { ...l, text: prev.text + line.text, checked: l.low } : l)),
      )
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && index > 0) {
      e.preventDefault()
      focusLine(page.lines[index - 1].id)
    } else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length && index < page.lines.length - 1) {
      e.preventDefault()
      focusLine(page.lines[index + 1].id, 0)
    }
  }

  // 여러 줄을 붙여넣으면 줄마다 나눕니다.
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>, line: Line) => {
    const pasted = e.clipboardData.getData('text')
    if (!pasted.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const merged = line.text.slice(0, el.selectionStart) + pasted + line.text.slice(el.selectionEnd)
    const [first, ...rest] = merged.split(/\r?\n/)
    const added = rest.map((t) => newLine(t, { box: line.box }))
    const last = added[added.length - 1]
    pendingFocus.current = { id: last.id, at: last.text.length }
    setLines((lines) =>
      lines.flatMap((l) => (l.id === line.id ? [{ ...l, text: first, checked: l.low }, ...added] : [l])),
    )
  }

  const goTo = (i: number, note: string | null = null) => {
    setCurrent(i)
    setActiveId(null)
    setMessage(note)
    // 안내 문구는 아래 버튼 옆에 나오므로, 문구가 있으면 스크롤하지 않습니다.
    if (!note) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const confirmPage = () => {
    setPages((prev) => prev.map((p, i) => (i === current ? { ...p, confirmed: true } : p)))
    const next = pages.findIndex((p, i) => i !== current && !p.confirmed)
    if (next >= 0) goTo(next)
  }

  const handleNext = () => {
    const rest = pages.filter((p) => !p.confirmed)
    if (rest.length) {
      goTo(
        rest[0].page - 1,
        `${rest.map((p) => p.page).join(', ')}페이지를 아직 확인하지 않았어요. 모든 페이지를 원본과 비교해 확인해 주세요.`,
      )
      return
    }
    // 개인정보 가리기 단계로. 글자를 고쳤으면 다시 찾습니다.
    const texts = pages.map((p) => ({ page: p.page, text: pageText(p) }))
    const key = JSON.stringify(texts)
    if (privacy?.key !== key) setPrivacy({ key, pages: texts, masks: detectMasks(texts) })
    setMessage(null)
    setStep('privacy')
    window.scrollTo({ top: 0 })
  }

  return (
    <section className="wrap">
      <div className="review-head">
        <div>
          <h1 className="review-head__title">읽어온 글자 확인</h1>
          <p className="review-head__sub">
            한 줄씩 원본과 비교해 주세요.
            <br />
            줄을 누르면 원본에서 그 위치를 보여드려요.
            <br />
            특히 <b>금액·시간·날짜</b>가 정확해야 점검 결과도 정확해요.
          </p>
        </div>
        <div className="review-prog" aria-live="polite">
          <span>
            확인 {doneCount} / {pages.length}페이지
          </span>
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${(doneCount / pages.length) * 100}%` }} />
          </span>
        </div>
      </div>

      {pages.length > 1 && (
        <div className="page-tabs" role="tablist" aria-label="페이지">
          {pages.map((p, i) => (
            <button
              key={p.page}
              type="button"
              role="tab"
              aria-selected={i === current}
              className={p.confirmed ? 'page-tab page-tab--done' : 'page-tab'}
              onClick={() => goTo(i)}
            >
              {p.confirmed && <CheckIcon size={14} />}
              {p.page}페이지
            </button>
          ))}
        </div>
      )}

      <div className="review-grid">
        {/* 원본 */}
        <div className="panel source-panel">
          <div className="panel__head">
            원본 · {page.page}페이지
            <div className="zoom" role="group" aria-label="원본 확대">
              {ZOOMS.map((z) => (
                <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                  {z === 100 ? '맞춤' : `${z}%`}
                </button>
              ))}
            </div>
          </div>
          <Scan page={page} zoom={zoom} box={active?.box ?? null} />
        </div>

        {/* 읽어온 글자 */}
        <div className="panel ocr-panel">
          <div className="panel__head">
            읽어온 글자
            <span className={`src-tag src-tag--${src.tone}`}>{src.text}</span>
          </div>

          {page.source === 'OCR' && !empty && (page.confidence ?? 0) < RETAKE_BELOW && (
            <div className="retake" role="note">
              <p className="retake__title">
                글자가 잘 읽히지 않았어요 <span>(신뢰도 {page.confidence ?? 0}%)</span>
              </p>
              <p>
                {selection.kind === 'IMAGES'
                  ? '계약서를 정면에서, 글자가 선명하게 나오도록 다시 찍어서 올리면 더 정확하게 읽을 수 있어요.'
                  : '스캔 상태가 흐려요. 계약서를 더 선명하게 스캔하거나, 정면에서 글자가 잘 나오도록 사진을 찍어서 올리면 더 정확하게 읽을 수 있어요.'}
              </p>
              <ul>
                <li>종이를 평평하게 펴고 바로 위에서 찍기</li>
                <li>그림자나 빛 반사가 없는 밝은 곳에서 찍기</li>
                <li>한 장에 한 페이지가 꽉 차고 흔들리지 않게 찍기</li>
              </ul>
              <Link to="/" className="btn-mini">
                다시 찍어서 올리기
              </Link>
            </div>
          )}

          {left.length > 0 ? (
            <div className="ocr-note ocr-note--amber">
              <span>
                노란 줄 <b>{left.length}개</b>는 흐리게 읽혔어요. 원본과 비교해 고치거나 [맞아요]를 눌러
                주세요.
              </span>
              <button type="button" className="btn-mini" onClick={() => focusLine(left[0].id, 0)}>
                다음 노란 줄로
              </button>
            </div>
          ) : empty ? (
            <p className="ocr-note ocr-note--red">
              이 페이지에서 글자를 읽지 못했어요. 원본을 보고 아래 칸에 직접 입력해 주세요.
            </p>
          ) : page.source === 'PDF_TEXT' ? (
            <p className="ocr-note">PDF에 들어 있는 글자를 그대로 가져왔어요. 줄 순서만 확인해 주세요.</p>
          ) : null}

          <ol className="lines" ref={listRef}>
            {page.lines.map((l, i) => (
              <li
                key={l.id}
                className={['line', needsCheck(l) ? 'line--low' : '', l.id === activeId ? 'line--active' : ''].join(
                  ' ',
                )}
              >
                <span className="line__no" aria-hidden="true">
                  {i + 1}
                </span>
                <textarea
                  ref={(el) => {
                    if (el) inputs.current.set(l.id, el)
                    else inputs.current.delete(l.id)
                  }}
                  rows={1}
                  value={l.text}
                  spellCheck={false}
                  placeholder={page.lines.length === 1 ? '여기에 입력해 주세요' : undefined}
                  aria-label={`${i + 1}번째 줄${needsCheck(l) ? ' (흐리게 읽힘)' : ''}`}
                  onFocus={() => setActiveId(l.id)}
                  onChange={(e) => editLine(l.id, e.target.value.replace(/\r?\n/g, ' '))}
                  onKeyDown={(e) => handleKeyDown(e, l, i)}
                  onPaste={(e) => handlePaste(e, l)}
                />
                {needsCheck(l) && (
                  <button type="button" className="btn-mini line__ok" onClick={() => markChecked(l.id)}>
                    맞아요
                  </button>
                )}
              </li>
            ))}
          </ol>
          <p className="lines-help">
            <kbd>Enter</kbd> 줄 나누기 · 줄 맨 앞에서 <kbd>Backspace</kbd> 윗줄과 합치기 · <kbd>↑</kbd>
            <kbd>↓</kbd> 줄 이동
          </p>

          <div className="ocr-page-foot">
            <span className={tooLong ? 'ocr-count ocr-count--over' : 'ocr-count'}>
              {text.length.toLocaleString()} / {MAX_PAGE_CHARS.toLocaleString()}자
            </span>
            {page.confirmed ? (
              <span className="ocr-done">
                <CheckIcon size={16} /> 확인한 페이지예요. 고치면 다시 확인해야 해요.
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={empty || tooLong || left.length > 0}
                onClick={confirmPage}
              >
                {left.length ? `노란 줄 ${left.length}개를 먼저 확인해 주세요` : '이 페이지 확인 완료'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="review-foot">
        {message && (
          <p className="ocr-msg" role="status">
            {message}
          </p>
        )}
        <div className="review-foot__actions">
          <Link to="/" className="btn btn-ghost">
            다른 파일 올리기
          </Link>
          <button type="button" className="btn btn-primary" onClick={handleNext}>
            다음: 개인정보 가리기
          </button>
        </div>
      </div>
    </section>
  )
}

/** 원본 이미지. 선택한 줄의 위치를 표시하고 그 위치로 스크롤합니다. */
function Scan({ page, zoom, box }: { page: PageDraft; zoom: number; box: Box | null }) {
  const scanRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scan = scanRef.current
    const mark = markRef.current
    if (!scan || !mark) return
    const s = scan.getBoundingClientRect()
    const m = mark.getBoundingClientRect()
    scan.scrollBy({
      top: m.top - s.top - s.height / 2 + m.height / 2,
      left: zoom > 100 ? m.left - s.left - 24 : 0,
      behavior: 'smooth',
    })
  }, [box, zoom])

  // 줄 영역에 여유를 조금 줍니다.
  const pad = page.height * 0.002
  const pct = (v: number, total: number) => `${(v / total) * 100}%`

  return (
    <div className="scan" ref={scanRef}>
      <div className="scan__sheet" style={{ width: `${zoom}%` }}>
        <img src={page.previewUrl} alt={`${page.page}페이지 원본`} className="scan__img" />
        {box && (
          <div
            ref={markRef}
            className="scan__mark"
            style={{
              left: pct(box.x0 - pad, page.width),
              top: pct(box.y0 - pad, page.height),
              width: pct(box.x1 - box.x0 + pad * 2, page.width),
              height: pct(box.y1 - box.y0 + pad * 2, page.height),
            }}
          />
        )}
      </div>
    </div>
  )
}

function Reading({ progress, kind }: { progress: OcrProgress | null; kind: UploadSelection['kind'] }) {
  const total = progress?.total ?? 1
  const page = progress?.page ?? 1
  // 전체 진행률: 끝난 페이지 + 현재 페이지 진행 비율
  const overall = ((page - 1 + (progress?.ratio ?? 0)) / total) * 100
  return (
    <section className="wrap review-reading" aria-busy="true">
      <div className="reading-card">
        <div className="spinner" aria-hidden="true" />
        <h1>계약서 글자를 읽고 있어요</h1>
        <p className="reading-card__step" aria-live="polite">
          {total > 1 && `${page} / ${total}${kind === 'PDF' ? '페이지' : '장'} · `}
          {progress?.label ?? '준비 중'}
          {progress?.ratio != null && ` ${Math.round(progress.ratio * 100)}%`}
        </p>
        <span className="bar bar--wide" aria-hidden="true">
          <i style={{ width: `${overall}%` }} />
        </span>
        <p className="reading-card__note">
          글자는 이 브라우저 안에서 읽고 원본은 서버로 보내지 않아요.
          <br />
          처음 한 번은 글자 인식 모델(약 75MB)을 내려받느라 시간이 조금 더 걸려요.
        </p>
      </div>
    </section>
  )
}

export default ReviewPage

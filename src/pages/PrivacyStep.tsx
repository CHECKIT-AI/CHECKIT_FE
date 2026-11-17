import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CheckIcon, LockIcon } from '../components/icons'
import {
  addManualMask,
  applyMasks,
  findAll,
  hasDirectIdentifier,
  MASK_LABEL,
  MAX_DOCUMENT_CHARS,
  REQUIRED_KINDS,
  sortMasks,
  type Mask,
  type MaskKind,
  type PageText,
} from '../upload/privacy'
import './PrivacyStep.css'

type Props = {
  pages: PageText[]
  masks: Mask[]
  onMasksChange: (masks: Mask[]) => void
  onBack: () => void
  /** 가림을 적용한 텍스트와 동의를 마친 뒤 */
  onDone: (masked: PageText[]) => void
  /** 다음 단계에서 알려줄 문구 */
  status?: string | null
}

/** 사용자가 고른 범위 (가리기 버튼 위치 포함) */
type Picked = { page: number; start: number; end: number; x: number; y: number }

const KIND_ORDER: MaskKind[] = ['NAME', 'RRN', 'PHONE', 'EMAIL', 'ADDRESS', 'BIRTH', 'ACCOUNT', 'BIZ', 'MANUAL']

/** 보내기 전에 사용자가 하나씩 확인하는 개인정보 목록 */
const CHECKLIST = [
  { key: 'name', label: '이름을', desc: '근로자·사업주·대표자 이름, 서명란', kinds: ['NAME'] },
  { key: 'contact', label: '연락처를', desc: '휴대전화·일반전화 번호, 이메일', kinds: ['PHONE', 'EMAIL'] },
  { key: 'id', label: '주민등록번호·생년월일을', desc: '외국인등록번호 포함', kinds: ['RRN', 'BIRTH'] },
  { key: 'address', label: '상세 주소를', desc: '내 집 주소의 도로명·번지·동·호수', kinds: ['ADDRESS'] },
  { key: 'account', label: '계좌번호를', desc: '임금을 받는 통장 번호', kinds: ['ACCOUNT'] },
] as const satisfies readonly { key: string; label: string; desc: string; kinds: readonly MaskKind[] }[]

type CheckKey = (typeof CHECKLIST)[number]['key']
const NO_CHECKS: Record<CheckKey, boolean> = { name: false, contact: false, id: false, address: false, account: false }
const checkKeyOf = (kind: MaskKind) => CHECKLIST.find((c) => (c.kinds as readonly MaskKind[]).includes(kind))?.key

function PrivacyStep({ pages, masks, onMasksChange, onBack, onDone, status }: Props) {
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(NO_CHECKS)
  const [checkedGemini, setCheckedGemini] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [word, setWord] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  const masked = useMemo(() => applyMasks(pages, masks), [pages, masks])
  const totalChars = masked.reduce((n, p) => n + p.text.length, 0) + masked.length - 1
  const onCount = masks.filter((m) => m.on).length
  const checkedCount = CHECKLIST.filter((c) => checks[c.key]).length
  const checkedPrivacy = checkedCount === CHECKLIST.length

  /**
   * 가림을 바꿉니다. 가림을 풀면 그 종류의 확인은 다시 받아야 합니다.
   * (더 가리는 것은 안전해서 확인을 그대로 둡니다.) 직접 가린 것을 풀면 무엇이었는지 모르므로 모두 다시 확인합니다.
   */
  const change = (next: Mask[], released?: Mask) => {
    onMasksChange(next)
    if (released) {
      const key = checkKeyOf(released.kind)
      if (!key && released.kind === 'MANUAL') setChecks(NO_CHECKS)
      else if (key) setChecks((c) => ({ ...c, [key]: false }))
    }
    setError(null)
  }

  const toggle = (m: Mask) => {
    if (REQUIRED_KINDS.includes(m.kind) && m.on) {
      setNotice(`${MASK_LABEL[m.kind]}는 꼭 가려야 저장할 수 있어요.`)
      return
    }
    setNotice(null)
    if (!m.auto && m.on) {
      // 직접 가린 것은 풀면 목록에서 지웁니다.
      change(
        masks.filter((x) => x.id !== m.id),
        m,
      )
      return
    }
    change(
      masks.map((x) => (x.id === m.id ? { ...x, on: !x.on } : x)),
      m.on ? m : undefined,
    )
  }

  /* ── 드래그로 고른 글자 가리기 ── */

  // 화면 위치 → 페이지 텍스트 위치
  const offsetOf = (node: Node, offset: number): { page: number; at: number; maskEnd?: number } | null => {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
    const pageEl = el?.closest<HTMLElement>('[data-page]')
    if (!el || !pageEl) return null
    const page = Number(pageEl.dataset.page)
    const maskEl = el.closest<HTMLElement>('[data-mask-start]')
    if (maskEl) return { page, at: Number(maskEl.dataset.maskStart), maskEnd: Number(maskEl.dataset.maskEnd) }
    const seg = el.closest<HTMLElement>('[data-s]')
    if (seg && node.nodeType === Node.TEXT_NODE) return { page, at: Number(seg.dataset.s) + offset }
    return null
  }

  const readSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount || !docRef.current) return setPicked(null)
    const range = sel.getRangeAt(0)
    if (!docRef.current.contains(range.commonAncestorContainer)) return setPicked(null)
    const a = offsetOf(range.startContainer, range.startOffset)
    const b = offsetOf(range.endContainer, range.endOffset)
    if (!a || !b) return setPicked(null)
    if (a.page !== b.page) {
      setPicked(null)
      setNotice('한 페이지 안에서만 골라 주세요.')
      return
    }
    const text = pages.find((p) => p.page === a.page)?.text ?? ''
    let start = Math.min(a.at, b.at)
    let end = Math.max(b.maskEnd ?? b.at, a.maskEnd ?? a.at)
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    if (start >= end) return setPicked(null)
    const rect = range.getBoundingClientRect()
    setNotice(null)
    setPicked({ page: a.page, start, end, x: rect.left + rect.width / 2, y: rect.bottom })
  }

  const maskPicked = () => {
    if (!picked) return
    change(addManualMask(masks, picked.page, picked.start, picked.end))
    setPicked(null)
    window.getSelection()?.removeAllRanges()
  }

  // 스크롤하면 떠 있는 버튼 위치가 어긋나므로 숨깁니다.
  useEffect(() => {
    if (!picked) return
    const hide = () => setPicked(null)
    window.addEventListener('scroll', hide, { passive: true })
    return () => window.removeEventListener('scroll', hide)
  }, [picked])

  const maskWord = (e: FormEvent) => {
    e.preventDefault()
    const w = word.trim()
    if (w.length < 2) {
      setNotice('두 글자 이상 입력해 주세요.')
      return
    }
    const added = findAll(pages, w, 'MANUAL', false, masks.filter((m) => m.on))
    if (!added.length) {
      setNotice(`'${w}'를 찾지 못했어요. 이미 가렸거나 글자가 다를 수 있어요.`)
      return
    }
    // 같은 자리에 풀어 둔 자동 가림이 있으면 그것을 대신합니다.
    const rest = masks.filter((m) => m.on || !added.some((a) => a.page === m.page && a.start < m.end && m.start < a.end))
    change(sortMasks([...rest, ...added]))
    setNotice(`'${w}' ${added.length}곳을 가렸어요.`)
    setWord('')
  }

  const submit = () => {
    const all = masked.map((p) => p.text).join('\n')
    if (hasDirectIdentifier(all)) {
      setError('주민등록번호·휴대전화 번호·이메일이 남아 있어요. 해당 부분을 드래그해서 가려 주세요.')
      return
    }
    if (totalChars > MAX_DOCUMENT_CHARS) {
      setError(
        `계약서가 너무 길어요. (${totalChars.toLocaleString()}자 / 최대 ${MAX_DOCUMENT_CHARS.toLocaleString()}자)\n점검에 필요 없는 부분을 글자 확인 단계에서 지워 주세요.`,
      )
      return
    }
    if (!checkedPrivacy || !checkedGemini) {
      setError('아래 목록을 하나씩 확인하고 체크해 주세요.')
      return
    }
    onDone(masked)
  }

  const groups = KIND_ORDER.map((kind) => ({ kind, items: masks.filter((m) => m.kind === kind) })).filter(
    (g) => g.items.length,
  )

  return (
    <section className="wrap">
      <div className="privacy-head">
        <button type="button" className="back-link" onClick={onBack}>
          ← 글자 확인으로 돌아가기
        </button>
        <h1>개인정보 가리기</h1>
        <p>
          점검에 필요 없는 개인정보를 가려요.
          <br />
          자동으로 찾은 부분은 <b>검은 칸</b>으로 보여요.
          <br />
          <b>빠진 곳이 있으면 드래그해서 가리고</b>, 잘못 가린 곳은 눌러서 풀 수 있어요.
          <br />
          금액·날짜·근무시간은 점검에 필요해서 가리지 않아요.
        </p>
      </div>

      <div className="privacy-grid">
        {/* 문서 */}
        <div className="panel">
          <div className="panel__head">
            가린 결과 미리보기
            <span>가림 {onCount}곳</span>
          </div>
          <div className="pv-doc" ref={docRef} onMouseUp={readSelection} onKeyUp={readSelection}>
            {pages.map((p) => (
              <article key={p.page} className="pv-page" data-page={p.page}>
                {pages.length > 1 && <div className="pv-page__no">{p.page}페이지</div>}
                <PageBody page={p} masks={masks.filter((m) => m.page === p.page)} onToggle={toggle} />
              </article>
            ))}
          </div>
        </div>

        {/* 오른쪽: 목록·직접 가리기·동의 */}
        <aside className="privacy-side">
          <div className="panel pv-card">
            <h2>찾은 개인정보</h2>
            {groups.length ? (
              <ul className="pv-groups">
                {groups.map((g) => (
                  <li key={g.kind}>
                    <div className="pv-group__head">
                      {MASK_LABEL[g.kind]}
                      {REQUIRED_KINDS.includes(g.kind) && <span className="pv-must">꼭 가려야 해요</span>}
                    </div>
                    <ul className="pv-items">
                      {g.items.map((m) => {
                        const original = pages.find((p) => p.page === m.page)?.text.slice(m.start, m.end) ?? ''
                        return (
                          <li key={m.id}>
                            <span className={m.on ? 'pv-orig' : 'pv-orig pv-orig--off'} title={original}>
                              {original}
                            </span>
                            {pages.length > 1 && <span className="pv-pageno">{m.page}p</span>}
                            {REQUIRED_KINDS.includes(m.kind) ? (
                              <span className="pv-state">
                                <LockIcon size={13} /> 가림
                              </span>
                            ) : (
                              <button type="button" className="btn-mini" onClick={() => toggle(m)}>
                                {!m.auto ? '삭제' : m.on ? '풀기' : '가리기'}
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pv-empty">자동으로 찾은 개인정보가 없어요. 이름·주소 등이 있으면 직접 가려 주세요.</p>
            )}
          </div>

          <form className="panel pv-card" onSubmit={maskWord}>
            <h2>같은 글자 모두 가리기</h2>
            <p className="pv-help">사장님 이름처럼 여러 번 나오는 글자를 한 번에 가려요.</p>
            <div className="pv-word">
              <label htmlFor="pv-word" className="sr-only">
                가릴 글자
              </label>
              <input
                id="pv-word"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="예: 홍길동"
                autoComplete="off"
              />
              <button type="submit" className="btn btn-sm btn-ghost">
                모두 가리기
              </button>
            </div>
          </form>

          <div className="panel pv-card">
            <h2>보내기 전에 확인해 주세요</h2>
            <div className="pv-list-head">
              <span>개인정보를 모두 가렸나요?</span>
              <span className={checkedPrivacy ? 'pv-count pv-count--done' : 'pv-count'}>
                {checkedCount} / {CHECKLIST.length}
              </span>
            </div>
            <p className="pv-help">
              미리보기에서 하나씩 찾아보고 체크해 주세요. 자동으로 찾지 못한 것은 드래그해서 가려 주세요.
            </p>
            <ul className="pv-checklist">
              {CHECKLIST.map((c) => {
                const found = masks.filter((m) => m.on && (c.kinds as readonly MaskKind[]).includes(m.kind)).length
                return (
                  <li key={c.key}>
                    <label className={checks[c.key] ? 'pv-item pv-item--on' : 'pv-item'}>
                      <input
                        type="checkbox"
                        checked={checks[c.key]}
                        onChange={(e) => setChecks((v) => ({ ...v, [c.key]: e.target.checked }))}
                      />
                      <span className="pv-item__text">
                        <b>{c.label}</b> 다 가렸어요
                        <small>{c.desc}</small>
                      </span>
                      <span className={found ? 'pv-found' : 'pv-found pv-found--none'}>
                        {found ? `자동 ${found}곳` : '못 찾음'}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="pv-help pv-help--small">
              '못 찾음'은 자동으로 찾지 못했다는 뜻이에요. 계약서에 없으면 그대로 체크하면 돼요. 가림을 풀면 그 항목은
              다시 확인해야 해요.
            </p>

            <label className="pv-check">
              <input type="checkbox" checked={checkedGemini} onChange={(e) => setCheckedGemini(e.target.checked)} />
              <span>
                가린 계약서 텍스트가 점검을 위해 <b>Google의 AI(Gemini)로 전송</b>되는 것을 확인했어요.
                <small>원본 파일과 사진은 보내지 않아요. 가린 텍스트만 저장되고 전송돼요.</small>
              </span>
            </label>

            <details className="pv-preview">
              <summary>보낼 텍스트 그대로 보기</summary>
              <pre>{masked.map((p) => p.text).join('\n\n')}</pre>
            </details>

            {status && !error && (
              <p className="pv-notice" role="status">
                {status}
              </p>
            )}
            {notice && !error && !status && (
              <p className="pv-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="pv-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary pv-submit"
              onClick={submit}
              disabled={!checkedPrivacy || !checkedGemini}
            >
              {checkedPrivacy && checkedGemini && <CheckIcon size={16} />} 다음: 저장하고 점검 준비
            </button>
          </div>
        </aside>
      </div>

      {picked && (
        <button
          type="button"
          className="pv-float"
          style={{ left: picked.x, top: picked.y + 8 }}
          // 버튼을 누를 때 선택이 풀리지 않도록
          onMouseDown={(e) => e.preventDefault()}
          onClick={maskPicked}
        >
          선택한 부분 가리기
        </button>
      )}
    </section>
  )
}

/** 한 페이지: 가리지 않은 글자는 위치(data-s)를 달아 두고, 가린 부분은 검은 칸으로 그립니다. */
function PageBody({ page, masks, onToggle }: { page: PageText; masks: Mask[]; onToggle: (m: Mask) => void }) {
  const parts: ReactNode[] = []
  let at = 0
  for (const m of [...masks].sort((a, b) => a.start - b.start)) {
    if (m.start < at) continue
    if (m.start > at) parts.push(<Plain key={`t${at}`} text={page.text.slice(at, m.start)} start={at} />)
    const original = page.text.slice(m.start, m.end)
    parts.push(
      <button
        key={m.id}
        type="button"
        className={m.on ? 'pv-mask' : 'pv-mask pv-mask--off'}
        data-mask-start={m.start}
        data-mask-end={m.end}
        title={m.on ? `${MASK_LABEL[m.kind]}: 눌러서 풀기` : '눌러서 다시 가리기'}
        aria-label={m.on ? `${MASK_LABEL[m.kind]} 가림. 원문 ${original}` : `가리지 않음: ${original}`}
        onClick={() => onToggle(m)}
      >
        {m.on ? MASK_LABEL[m.kind] : original}
      </button>,
    )
    at = m.end
  }
  if (at < page.text.length) parts.push(<Plain key={`t${at}`} text={page.text.slice(at)} start={at} />)
  return <div className="pv-text">{parts}</div>
}

function Plain({ text, start }: { text: string; start: number }) {
  return <span data-s={start}>{text}</span>
}

export default PrivacyStep

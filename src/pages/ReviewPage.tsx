import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { DocLinesIcon } from '../components/icons'
import { SAMPLE_EXTRACTION } from '../mocks/extraction'
import type { ExtractionResult, ReviewCandidate } from '../types/extraction'
import './ReviewPage.css'

// 인식 신뢰도 기준 (목업 기준값. 백엔드·AI 담당자와 확정 필요)
const CONF_OK = 0.85
const CONF_FAIL = 0.5

type LineStatus = 'ok' | 'low' | 'fail'

type Line = {
  blockId: string
  text: string
  confidence: number | null
  /** 최초 인식 상태. 사용자가 확인해도 바뀌지 않음 */
  status: LineStatus
  /** 확인이 필요한 줄을 사용자가 확인·수정했는지 */
  done: boolean
  edited: boolean
  candidates: ReviewCandidate[]
}

const UNREADABLE = /▒/
const DIGIT_O = /[0-9,][Oo]|[Oo][0-9]/

function lineStatus(conf: number | null): LineStatus {
  if (conf === null) return 'ok' // PDF 내장 텍스트
  if (conf >= CONF_OK) return 'ok'
  return conf >= CONF_FAIL ? 'low' : 'fail'
}

/** 숫자와 붙어 있는 영문 O가 포함된 토큰(예: 1O,5OO원)을 찾습니다. */
function digitOTokens(text: string) {
  return (text.match(/[0-9Oo,.:~]*[0-9][0-9Oo,.:~]*/g) ?? []).filter((t) => DIGIT_O.test(t))
}

/** 토큰 안의 영문 O를 강조해서 보여줍니다. 글꼴에 따라 O와 0이 비슷해 보이기 때문입니다. */
function SuspectToken({ token }: { token: string }) {
  return (
    <span className="suspects__token">
      {[...token].map((ch, i) =>
        ch === 'O' || ch === 'o' ? (
          <mark key={i} className="suspects__letter" title="영문 O">
            {ch}
          </mark>
        ) : (
          ch
        ),
      )}
    </span>
  )
}

function toLines(result: ExtractionResult): Line[] {
  return result.blocks.map((b) => ({
    blockId: b.block_id,
    text: b.text,
    confidence: b.recognition_confidence,
    status: lineStatus(b.recognition_confidence),
    done: false,
    edited: false,
    candidates: result.review_candidates.filter((c) => c.block_id === b.block_id),
  }))
}

function hintFor(line: Line) {
  if (line.status === 'fail') {
    return UNREADABLE.test(line.text)
      ? '글자를 읽지 못한 부분(▒)이 있어요. 원본을 보고 직접 입력해 주세요.'
      : '인식 신뢰도가 매우 낮아요. 원본을 보고 직접 고쳐 주세요.'
  }
  return DIGIT_O.test(line.text)
    ? '숫자 0이 영문 O로 읽혔을 수 있어요. 금액·날짜를 원본과 비교해 주세요.'
    : '흐리게 찍혀 잘못 읽었을 수 있어요. 원본과 비교해 주세요.'
}

function rowClass(line: Line) {
  if (line.status === 'ok') return 'ok'
  return line.done ? 'done' : line.status
}

function ReviewPage() {
  const { user, loading } = useAuth()
  // TODO: API 연결 시 업로드 응답(POST /api/contracts)으로 대체
  const [lines, setLines] = useState<Line[]>(() => toLines(SAMPLE_EXTRACTION))
  const [mode, setMode] = useState<'lines' | 'all'>('lines')
  const [allText, setAllText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const counts = useMemo(() => {
    const flagged = lines.filter((l) => l.status !== 'ok')
    return {
      flagged: flagged.length,
      done: flagged.filter((l) => l.done).length,
    }
  }, [lines])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ reason: 'upload', returnTo: '/' }} />

  const updateLine = (blockId: string, patch: (l: Line) => Partial<Line>) => {
    setLines((prev) => prev.map((l) => (l.blockId === blockId ? { ...l, ...patch(l) } : l)))
    setMessage(null)
  }

  const handleEdit = (blockId: string, text: string) =>
    updateLine(blockId, (l) => ({
      text,
      edited: true,
      // 확인 필요 줄은 내용이 있고 ▒가 없으면 확인한 것으로 봅니다.
      done: l.status !== 'ok' && text.trim().length > 0 && !UNREADABLE.test(text),
    }))

  const switchMode = (next: 'lines' | 'all') => {
    if (next === mode) return
    if (next === 'all') {
      setAllText(lines.map((l) => l.text).join('\n'))
    } else {
      // 직접 입력한 내용을 다시 줄로 나눕니다. 직접 입력한 줄은 인식 신뢰도가 없습니다.
      const next = allText
        .split('\n')
        .filter((t) => t.trim())
        .map((text, i) => ({
          blockId: `manual_${i + 1}`,
          text,
          confidence: null,
          status: (UNREADABLE.test(text) ? 'fail' : 'ok') as LineStatus,
          done: false,
          edited: true,
          candidates: [],
        }))
      setLines(next)
      setSelected(null)
    }
    setMode(next)
    setMessage(null)
  }

  const handleSubmit = () => {
    let text: string
    if (mode === 'all') {
      text = allText
      if (UNREADABLE.test(text)) {
        setMessage('읽지 못한 글자(▒)가 남아 있어요. 원본을 보고 해당 부분을 직접 입력해 주세요.')
        return
      }
    } else {
      const left = lines.filter((l) => l.status !== 'ok' && !l.done)
      if (left.length) {
        const fails = left.filter((l) => l.status === 'fail').length
        setMessage(
          `확인이 필요한 줄이 ${left.length}개 남았어요` +
            (fails ? ` (인식 실패 ${fails}개는 직접 입력이 필요해요)` : '') +
            '. 인식하지 못한 내용으로는 점검하지 않아요.',
        )
        setSelected(left[0].blockId)
        document.getElementById(`line-${left[0].blockId}`)?.focus()
        return
      }
      text = lines.map((l) => l.text).join('\n')
    }
    if (text.trim().length < 40) {
      setMessage('계약서 내용이 너무 짧아요. 원본을 보고 내용을 입력해 주세요.')
      return
    }
    // TODO: 분석 API(POST /api/contracts/{id}/analyses)에 edited_blocks와 함께 전송
    setMessage('확인이 끝났어요. 분석 기능은 아직 연결되지 않았어요.')
  }

  const progress =
    mode === 'all' ? 100 : counts.flagged ? Math.round((counts.done / counts.flagged) * 100) : 100

  return (
    <section className="wrap">
      <div className="review-head">
        <p className="review-head__sub">
          사진에서 글자를 읽어왔어요. 노란색·빨간색 줄은 잘못 읽었을 수 있으니 원본과 비교해
          확인하거나 고쳐 주세요.
        </p>
      </div>

      <div className="review-grid">
        {/* 원본 */}
        <div className="panel">
          <div className="panel__head">
            원본 이미지 <span>줄을 선택하면 원본 위치가 표시돼요</span>
          </div>
          <div className="scan">
            <div className="file-card">
              <DocLinesIcon size={20} className="file-card__icon" />
              <span>
                <b>예시 계약서 사진</b>
                <br />
                API 연결 전이라 예시 인식 결과를 보여드려요.
              </span>
            </div>
            {/* TODO: 실제 원본 이미지 + blocks[].regions 좌표로 위치 강조 */}
            <div className="paper">
              {lines.map((l, i) => (
                <div
                  key={l.blockId}
                  className={[
                    'paper__line',
                    i === 0 ? 'paper__title' : '',
                    l.status === 'low' ? 'faint' : '',
                    l.status === 'fail' ? 'blur' : '',
                    selected === l.blockId ? 'on' : '',
                  ].join(' ')}
                >
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 인식 결과 */}
        <div className="panel ocr-panel">
          <div className="ocr-tools">
            <div className="seg" role="group" aria-label="확인 방식">
              <button type="button" aria-pressed={mode === 'lines'} onClick={() => switchMode('lines')}>
                줄별 확인
              </button>
              <button type="button" aria-pressed={mode === 'all'} onClick={() => switchMode('all')}>
                전체 직접 입력
              </button>
            </div>
            <div className="prog">
              <span>
                {mode === 'all'
                  ? '전체 내용을 직접 확인하는 중'
                  : counts.flagged
                    ? `확인 ${counts.done} / ${counts.flagged}줄`
                    : '모든 줄이 정상 인식됐어요'}
              </span>
              <span className="bar" aria-hidden="true">
                <i style={{ width: `${progress}%` }} />
              </span>
            </div>
          </div>

          {mode === 'lines' ? (
            <div className="ocr-lines">
              {lines.map((l, i) => (
                <div key={l.blockId} className={`ocr-line ${rowClass(l)}`}>
                  <span className="ocr-line__no">{i + 1}</span>
                  <div>
                    <textarea
                      id={`line-${l.blockId}`}
                      rows={1}
                      value={l.text}
                      onChange={(e) => handleEdit(l.blockId, e.target.value.replace(/\n/g, ' '))}
                      onKeyDown={(e) => {
                        // 한 줄(블록) 안에는 줄바꿈을 넣지 않습니다.
                        if (e.key === 'Enter') e.preventDefault()
                      }}
                      onFocus={() => setSelected(l.blockId)}
                      aria-label={`${i + 1}번째 줄 인식 결과`}
                    />
                    {l.status !== 'ok' && !l.done && <div className="ocr-line__hint">{hintFor(l)}</div>}
                    {l.status !== 'ok' && !l.done && digitOTokens(l.text).length > 0 && (
                      <div className="suspects">
                        <span>영문 O로 읽힌 곳:</span>
                        {digitOTokens(l.text).map((t, i) => (
                          <SuspectToken key={`${t}-${i}`} token={t} />
                        ))}
                      </div>
                    )}
                    {l.candidates.length > 0 && !l.done && (
                      <div className="ocr-line__candidates">
                        {l.candidates.map((c) => (
                          <span key={c.field} className="pill">
                            {c.field} 확인
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ocr-line__side">
                    <span className={`conf conf--${rowClass(l)}`}>
                      {l.done && '✓ '}
                      {l.confidence === null
                        ? '직접 입력'
                        : `신뢰도 ${Math.round(l.confidence * 100)}%`}
                    </span>
                    {l.status === 'low' && !l.done && (
                      <button
                        type="button"
                        className="btn-mini"
                        onClick={() => updateLine(l.blockId, () => ({ done: true }))}
                      >
                        맞아요
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <label htmlFor="ocr-all" className="sr-only">
                계약서 전체 내용
              </label>
              <textarea
                id="ocr-all"
                className="ocr-all"
                value={allText}
                onChange={(e) => {
                  setAllText(e.target.value)
                  setMessage(null)
                }}
              />
            </>
          )}

          <div className="ocr-foot">
            {message && (
              <p className="ocr-msg" role="status">
                {message}
              </p>
            )}
            <div className="ocr-foot__actions">
              <Link to="/" className="btn btn-ghost">
                다시 올리기
              </Link>
              <button type="button" className="btn btn-primary ocr-foot__submit" onClick={handleSubmit}>
                확인 완료 후 점검하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ReviewPage

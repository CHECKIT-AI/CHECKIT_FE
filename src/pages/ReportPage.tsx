import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { BookIcon, ChatIcon } from '../components/icons'
import { SAMPLE_CONTRACTS } from '../mocks/analysis'
import {
  CATEGORY_LABEL,
  GROUPS,
  STATUS_META,
  categoryOf,
  citationsFor,
  findQuote,
  formatDate,
  groupCounts,
  groupOf,
  isDiscovered,
  pageRanges,
  titleOf,
  type GroupKey,
  type Tone,
} from '../report/view'
import type { CheckItem, TextRevision } from '../types/api'
import './ReportPage.css'

type Range = { start: number; end: number }

/** 원문 한 줄의 종류: 제목 / 당사자 정보 / 조항 / 일반 문장 */
type LineKind = 'title' | 'meta' | 'clause' | 'text'

// "제7조(위약금)" 또는 "7. 임금:" 같은 조항 머리
const CLAUSE_HEAD = /^(제\s*\d+\s*조(?:\s*\([^)]*\))?|\d+\s*[.)]\s*[^:：\n]{1,20}[:：])/

function classify(line: string, index: number): { kind: LineKind; head: number } {
  const t = line.trim()
  const m = t.match(CLAUSE_HEAD)
  if (m) return { kind: 'clause', head: line.indexOf(m[1]) + m[1].length }
  if (index === 0 && /계\s*약\s*서/.test(t)) return { kind: 'title', head: 0 }
  if (/^(사업주|사용자|근로자|대표|체결일)\s*[:：]/.test(t)) return { kind: 'meta', head: 0 }
  return { kind: 'text', head: 0 }
}

/** content[start,end) 를 그리면서 강조 구간(hit)과 겹치는 부분만 <mark>로 감쌉니다. */
function Piece({ content, start, end, hit, tone }: { content: string; start: number; end: number; hit: Range | null; tone: Tone }) {
  if (!hit || hit.end <= start || hit.start >= end) return <>{content.slice(start, end)}</>
  const s = Math.max(start, hit.start)
  const e = Math.min(end, hit.end)
  return (
    <>
      {content.slice(start, s)}
      <mark className={`hl-${tone}`}>{content.slice(s, e)}</mark>
      {content.slice(e, end)}
    </>
  )
}

/** 원문 패널: 계약서처럼 제목·당사자·조항을 나눠 보여주고, 선택한 항목의 인용 문구를 강조합니다. */
function ContractText({ text, quote, tone }: { text: TextRevision; quote: string | null; tone: Tone }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { content } = text
  const hit = findQuote(content, quote)

  // 강조한 문구가 원문 영역에 보이도록 스크롤합니다.
  useEffect(() => {
    // 첫 화면은 레이아웃이 잡힌 다음 프레임에 위치를 계산합니다.
    const frame = requestAnimationFrame(() => {
      const body = bodyRef.current
      const target = body?.querySelector<HTMLElement>('.doc-line.is-hit')
      if (!body || !target) return
      const offset = target.getBoundingClientRect().top - body.getBoundingClientRect().top
      body.scrollTop = Math.max(0, body.scrollTop + offset - 60)
    })
    return () => cancelAnimationFrame(frame)
  }, [hit?.start, hit?.end])

  const pages = pageRanges(content, text.blocks)

  return (
    <div className="doc__body" ref={bodyRef}>
      {pages.map((p) => {
        // 페이지 안의 줄을 원문 글자 위치와 함께 나눕니다.
        const lines: { start: number; end: number }[] = []
        let at = p.start
        for (const raw of content.slice(p.start, p.end).split('\n')) {
          lines.push({ start: at, end: at + raw.length })
          at += raw.length + 1
        }
        let row = 0
        return (
          <article key={p.page} className="doc-sheet">
            {pages.length > 1 && <div className="doc-sheet__page">{p.page}쪽</div>}
            {lines.map((ln) => {
              const line = content.slice(ln.start, ln.end)
              if (!line.trim()) return null
              const { kind, head } = classify(line, row++)
              const isHit = Boolean(hit && hit.start < ln.end && hit.end > ln.start)
              const props = { content, hit, tone }
              return (
                <div
                  key={ln.start}
                  className={`doc-line doc-line--${kind}${isHit ? ` is-hit hit-${tone}` : ''}`}
                >
                  {kind === 'clause' ? (
                    <>
                      <span className="doc-line__head">
                        <Piece {...props} start={ln.start} end={ln.start + head} />
                      </span>
                      <Piece {...props} start={ln.start + head} end={ln.end} />
                    </>
                  ) : (
                    <Piece {...props} start={ln.start} end={ln.end} />
                  )}
                </div>
              )
            })}
          </article>
        )
      })}
    </div>
  )
}

function ItemButton({ item, selected, onSelect }: { item: CheckItem; selected: boolean; onSelect: () => void }) {
  const st = STATUS_META[item.status]
  return (
    <button type="button" role="listitem" className="item" aria-current={selected} onClick={onSelect}>
      <span className={`item__dot dot-${st.tone}`} />
      <span className="item__body">
        <span className={`item__title ${item.status === 'PRESENT' ? 'is-ok' : ''}`}>{titleOf(item)}</span>
        {isDiscovered(item) && <span className="item__sub">AI가 추가로 찾은 항목</span>}
      </span>
      <span className={`pill tone-${st.tone}`}>{st.label}</span>
    </button>
  )
}

function ItemDetail({ item, citations }: { item: CheckItem; citations: ReturnType<typeof citationsFor> }) {
  const st = STATUS_META[item.status]
  const category = categoryOf(item)
  const page = item.source_locations[0]?.page
  const ask = item.status === 'PRESENT' ? [] : item.required_information

  return (
    <>
      <div className="tags">
        <span className={`pill tone-${st.tone}`}>{st.label}</span>
        <span className="pill tone-gray">{CATEGORY_LABEL[category]}</span>
        {isDiscovered(item) && <span className="pill tone-gray">AI 추가 발견</span>}
        {item.labels.map((l) => (
          <span key={l} className="pill tone-outline">
            {l}
          </span>
        ))}
      </div>
      <h2>{titleOf(item)}</h2>

      {item.quoted_text ? (
        <div className="quote">
          <small>계약서{page ? ` ${page}쪽` : ''}에서 찾은 문구</small>
          <span className="quote__text">{item.quoted_text}</span>
        </div>
      ) : category === 'MISSING' && item.status !== 'PRESENT' ? (
        <div className="notfound">계약서에서 관련 문장을 찾지 못했어요. 사장님께 직접 확인해 보세요.</div>
      ) : null}

      <p className="explain">{item.explanation}</p>

      {citations.map((c) => (
        <div className="law" key={c.chunk_id}>
          <div className="law__head">
            <span className="law__name">
              <BookIcon size={16} />
              {c.law_name} {c.article_number}
            </span>
            {c.effective_date && <span className="law__date">{formatDate(c.effective_date)} 시행</span>}
          </div>
          <p className="law__content">{c.content}</p>
          <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="law__link">
            국가법령정보센터에서 원문 보기
          </a>
        </div>
      ))}

      {ask.length > 0 && (
        <div className="ask">
          <ChatIcon size={18} className="ask__icon" />
          <span>서명 전에 확인해 보세요: {ask.join(', ')}</span>
        </div>
      )}
    </>
  )
}

function ReportMessage({ title, sub }: { title: string; sub: string }) {
  return (
    <section className="wrap">
      <div className="report-empty">
        <h1>{title}</h1>
        <p>{sub}</p>
        <Link to="/reports" className="btn btn-primary btn-sm">
          내 리포트로 가기
        </Link>
      </div>
    </section>
  )
}

function ReportView({ reportId }: { reportId: string }) {
  const { user, loading } = useAuth()
  // TODO: 리포트 상세 연동 시 GET /api/contracts/{reportId} 응답으로 대체
  const detail = SAMPLE_CONTRACTS[reportId] ?? null
  const items = detail?.current_result?.items ?? []
  const [selectedId, setSelectedId] = useState<string | null>(
    // 왼쪽 목록 순서대로 첫 항목을 선택합니다.
    () => GROUPS.flatMap((g) => items.filter((i) => groupOf(i) === g.key))[0]?.id ?? null,
  )
  const [showPresent, setShowPresent] = useState(false)

  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ reason: 'reports', returnTo: `/reports/${reportId}` }} />
  if (!detail) return <ReportMessage title="리포트를 찾을 수 없어요" sub="삭제되었거나 다른 계정의 리포트일 수 있어요." />

  const result = detail.current_result
  if (!result) return <ReportMessage title="아직 점검 결과가 없어요" sub="분석이 끝나면 이곳에서 결과를 볼 수 있어요." />

  const selected = items.find((i) => i.id === selectedId) ?? null
  const counts = groupCounts(items)
  const toCheck = counts.LEGAL_RISK + counts.DISADVANTAGE + counts.MISSING
  const byGroup = (key: GroupKey) => items.filter((i) => groupOf(i) === key)

  return (
    <section className="wrap">
      <div className="report-head">
        <div>
          <h1>근로계약서 점검 리포트</h1>
          <p className="report-head__sub">
            {formatDate(result.completed_at)} 점검 · 항목 {items.length}개 검토 ·{' '}
            {toCheck > 0 ? `확인할 사항 ${toCheck}개` : '확인할 사항 없음'}
          </p>
        </div>
        <div className="report-chips">
          {GROUPS.filter((g) => g.key !== 'PRESENT').map((g) => (
            <span key={g.key} className={`report-chip tone-${g.tone}`}>
              {g.label}
              <b>{counts[g.key]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="report-cols">
        {/* 항목 목록 */}
        <div className="rpanel item-list" role="list">
          {GROUPS.map((g) => {
            const list = byGroup(g.key)
            if (g.key === 'PRESENT') {
              if (list.length === 0) return null
              return (
                <div key={g.key} className={`item-group group-${g.tone}`}>
                  <button
                    type="button"
                    className="item-list__label item-list__toggle"
                    aria-expanded={showPresent}
                    onClick={() => setShowPresent((v) => !v)}
                  >
                    {g.label} {list.length} {showPresent ? '접기' : '펼치기'}
                  </button>
                  {showPresent &&
                    list.map((it) => (
                      <ItemButton key={it.id} item={it} selected={it.id === selectedId} onSelect={() => setSelectedId(it.id)} />
                    ))}
                </div>
              )
            }
            return (
              <div key={g.key} className={`item-group group-${g.tone}`}>
                <div className="item-list__label">
                  {g.label} {list.length}
                </div>
                {list.length === 0 && <p className="item-list__empty">{g.empty}</p>}
                {list.map((it) => (
                  <ItemButton key={it.id} item={it} selected={it.id === selectedId} onSelect={() => setSelectedId(it.id)} />
                ))}
              </div>
            )
          })}
        </div>

        {/* 상세 */}
        <div className="rpanel detail" aria-live="polite">
          {selected ? (
            <ItemDetail item={selected} citations={citationsFor(result.citations, selected.id)} />
          ) : (
            <p className="explain">점검 항목이 없어요. 결과가 없다고 해서 계약서가 안전하다는 뜻은 아니에요.</p>
          )}
        </div>

        {/* 원문 */}
        <div className="rpanel doc">
          <div className="doc__head">
            계약서 원문 <span className="doc__note">개인정보를 가린 텍스트</span>
          </div>
          {detail.text ? (
            <ContractText
              text={detail.text}
              quote={selected?.quoted_text ?? null}
              tone={selected ? STATUS_META[selected.status].tone : 'gray'}
            />
          ) : (
            <div className="doc__body">저장된 원문이 없어요.</div>
          )}
        </div>
      </div>
    </section>
  )
}

/** 리포트가 바뀌면 선택 상태를 새로 시작합니다. */
function ReportPage() {
  const { reportId = '' } = useParams()
  return <ReportView key={reportId} reportId={reportId} />
}

export default ReportPage

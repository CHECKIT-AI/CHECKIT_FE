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

/** 원문 패널: 페이지별로 나누고, 선택한 항목의 인용 문구를 강조합니다. */
function ContractText({ text, quote, tone }: { text: TextRevision; quote: string | null; tone: Tone }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const hit = findQuote(text.content, quote)

  // 강조한 문구가 원문 영역에 보이도록 스크롤합니다.
  useEffect(() => {
    const body = bodyRef.current
    const mark = body?.querySelector<HTMLElement>('mark')
    if (body && mark) body.scrollTop = Math.max(0, mark.offsetTop - 40) // .doc__body 기준 위치
  }, [hit?.start, hit?.end])

  const pages = pageRanges(text.content, text.blocks)

  return (
    <div className="doc__body" ref={bodyRef}>
      {pages.map((p) => {
        const s = hit ? Math.max(p.start, Math.min(hit.start, p.end)) : p.end
        const e = hit ? Math.max(s, Math.min(hit.end, p.end)) : p.end
        return (
          <div key={p.page} className="doc__page">
            {pages.length > 1 && <div className="doc__page-no">{p.page}쪽</div>}
            {text.content.slice(p.start, s)}
            {e > s && <mark className={`hl-${tone}`}>{text.content.slice(s, e)}</mark>}
            {text.content.slice(e, p.end)}
          </div>
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
    () => items.find((i) => i.status !== 'PRESENT')?.id ?? items[0]?.id ?? null,
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

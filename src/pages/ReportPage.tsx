import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { BookIcon, ChatIcon, CheckIcon } from '../components/icons'
import { SAMPLE_REPORT } from '../mocks/report'
import type { Clause, ReportItem, RequiredStatus, RiskSeverity } from '../types/report'
import './ReportPage.css'

const SEVERITY: Record<RiskSeverity, { label: string; tone: string }> = {
  VIOLATION: { label: '법령 위반 가능성', tone: 'red' },
  UNFAVORABLE: { label: '불리한 조건', tone: 'amber' },
  UNCLEAR: { label: '명확성 부족', tone: 'blue' },
}

const STATUS: Record<RequiredStatus, { label: string; tone: string }> = {
  MISSING_SUSPECTED: { label: '누락 의심', tone: 'amber' },
  NEEDS_CONFIRMATION: { label: '추가 확인 필요', tone: 'blue' },
  PRESENT: { label: '확인됨', tone: 'green' },
}

function needsQuestion(item: ReportItem) {
  return Boolean(item.question) && !(item.kind === 'REQUIRED' && item.status === 'PRESENT')
}

function clauseLabel(c: Clause) {
  return c.number ? `${c.number}${c.title ? ` (${c.title})` : ''}` : '본문'
}

function ReportPage() {
  const { user, loading } = useAuth()
  const { reportId } = useParams()
  // TODO: API 연결 시 GET /api/contracts/{reportId} 응답으로 대체
  const report = SAMPLE_REPORT
  const [selectedId, setSelectedId] = useState(report.items[0]?.id ?? null)
  const docRef = useRef<HTMLDivElement>(null)

  const selected = report.items.find((i) => i.id === selectedId) ?? null
  const selectedClause = selected?.clause_id ?? null

  // 선택한 항목의 조항이 원문 영역에 보이도록 스크롤합니다.
  useEffect(() => {
    if (!selectedClause || !docRef.current) return
    const el = docRef.current.querySelector<HTMLElement>(`[data-clause="${selectedClause}"]`)
    if (el) docRef.current.scrollTop = Math.max(0, el.offsetTop - 40) // .doc__body 기준 위치
  }, [selectedClause])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ reason: 'reports', returnTo: `/reports/${reportId}` }} />

  const risks = report.items.filter((i) => i.kind === 'RISK')
  const required = report.items.filter((i) => i.kind === 'REQUIRED')
  const questions = report.items.filter(needsQuestion)
  const clauseCount = report.clauses.filter((c) => c.number).length

  // 조항별 강조 색: 가장 심각한 위험 항목 기준
  const highlight = new Map<string, string>()
  for (const r of risks) if (r.clause_id && !highlight.has(r.clause_id)) highlight.set(r.clause_id, SEVERITY[r.severity].tone)

  const clause = selected?.clause_id ? report.clauses.find((c) => c.clause_id === selected.clause_id) : null

  return (
    <section className="wrap">
      <div className="report-head">
        <div>
          <h1>{report.title} 점검 리포트</h1>
          <p className="report-head__sub">
            조항 {clauseCount}개 분석 · 서명 전에 확인할 사항 {questions.length}개
          </p>
        </div>
        <div className="report-chips">
          <span className="report-chip tone-red">
            위험 조항<b>{risks.length}</b>
          </span>
          <span className="report-chip tone-amber">
            필수 기재사항 확인<b>{required.filter((i) => i.status !== 'PRESENT').length}</b>
          </span>
        </div>
      </div>

      <div className="report-cols">
        {/* 항목 목록 */}
        <div>
          <div className="rpanel item-list" role="list">
            <div className="item-group group-red">
              <div className="item-list__label">위험 조항 {risks.length}</div>
              {risks.length === 0 && <p className="item-list__empty">발견된 위험 조항이 없어요.</p>}
              {risks.map((it) => {
                const c = report.clauses.find((x) => x.clause_id === it.clause_id)
                const sev = SEVERITY[it.severity]
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="listitem"
                    className="item"
                    aria-current={it.id === selectedId}
                    onClick={() => setSelectedId(it.id)}
                  >
                    <span className={`item__dot dot-${sev.tone}`} />
                    <span className="item__body">
                      <span className="item__title">{it.title}</span>
                      <span className={`item__sub text-${sev.tone}`}>
                        {sev.label}
                        {c?.number ? ` · ${c.number}` : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="item-group group-amber">
              <div className="item-list__label">필수 기재사항</div>
              {required.map((it) => {
                const st = STATUS[it.status]
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="listitem"
                    className="item"
                    aria-current={it.id === selectedId}
                    onClick={() => setSelectedId(it.id)}
                  >
                    <span className="item__body">
                      <span className={`item__title ${it.status === 'PRESENT' ? 'is-ok' : ''}`}>{it.title}</span>
                    </span>
                    <span className={`pill tone-${st.tone}`}>{st.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 상세 */}
        <div className="rpanel detail" aria-live="polite">
          {selected ? (
            <>
              <div className="tags">
                {selected.kind === 'RISK' ? (
                  <>
                    <span className={`pill tone-${SEVERITY[selected.severity].tone}`}>
                      {SEVERITY[selected.severity].label}
                    </span>
                    <span className="pill tone-gray">{selected.category}</span>
                  </>
                ) : (
                  <>
                    <span className={`pill tone-${STATUS[selected.status].tone}`}>
                      {STATUS[selected.status].label}
                    </span>
                    <span className="pill tone-gray">필수 기재사항</span>
                  </>
                )}
              </div>
              <h2>
                {selected.title}
                {selected.kind === 'REQUIRED' && selected.status !== 'PRESENT' ? ' 조항' : ''}
              </h2>

              {clause ? (
                <div className="quote">
                  <small>계약서 {clauseLabel(clause)}</small>
                  {clause.text}
                </div>
              ) : selected.kind === 'REQUIRED' && selected.status === 'MISSING_SUSPECTED' ? (
                <div className="notfound">
                  계약서 전체에서 관련 문장을 찾지 못했어요. 누락으로 단정하지 않고 "누락 의심"으로
                  표시해요.
                </div>
              ) : null}

              <p className="explain">{selected.explanation}</p>

              {selected.citation && (
                <div className="law">
                  <div className="law__head">
                    <span className="law__name">
                      <BookIcon size={16} />
                      {selected.citation.law_name} {selected.citation.article_number}
                      {selected.citation.article_title ? ` (${selected.citation.article_title})` : ''}
                    </span>
                    {selected.kind === 'RISK' && (
                      <span className="law__verified">
                        <CheckIcon size={14} />
                        근거 검증됨
                      </span>
                    )}
                  </div>
                  <p>{selected.citation.content}</p>
                  {selected.requirements && (
                    <ul className="reqs">
                      {selected.requirements.map((r) => (
                        <li key={r}>
                          <CheckIcon size={14} className="reqs__icon" />
                          적용 요건: {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  <a href={selected.citation.source_url} target="_blank" rel="noopener noreferrer" className="law__link">
                    국가법령정보센터에서 원문 보기
                  </a>
                </div>
              )}

              {needsQuestion(selected) && (
                <div className="ask">
                  <ChatIcon size={18} className="ask__icon" />
                  서명 전 이렇게 물어보세요: “{selected.question}”
                </div>
              )}
            </>
          ) : (
            <p className="explain">점검 항목이 없어요.</p>
          )}
        </div>

        {/* 원본 계약서 */}
        <div className="rpanel doc">
          <div className="doc__head">원본 계약서</div>
          <div className="doc__body" ref={docRef}>
            {report.clauses.map((c) => {
              const tone = highlight.get(c.clause_id)
              return (
                <div
                  key={c.clause_id}
                  data-clause={c.clause_id}
                  className={['clause', tone ? `hl-${tone}` : '', c.clause_id === selectedClause ? 'sel' : ''].join(' ')}
                >
                  {c.number ? `${c.number} (${c.title}) ${c.text}` : c.text}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ReportPage

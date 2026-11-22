import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { deleteErrorMessage, getContract, listContracts, removeContract } from '../api/contracts'
import { useAuth } from '../auth/useAuth'
import { AuthLoading } from '../components/AuthGate'
import ConfirmDialog from '../components/ConfirmDialog'
import { DocLinesIcon, LockIcon } from '../components/icons'
import { SAMPLE_REPORTS } from '../mocks/reports'
import { toListItem, type ReportListItem } from '../report/list'
import { formatDateTime } from '../report/view'
import './MyReportsPage.css'

const TITLE: Record<string, string> = { EMPLOYMENT: '근로계약서' }

const titleOf = (r: ReportListItem) => TITLE[r.contract.contract_type] ?? '계약서'

/** 개발 서버에서만 실제 목록 아래에 예시 리포트를 함께 보여줍니다. */
const SHOW_SAMPLES = import.meta.env.DEV

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; reports: ReportListItem[] }

/**
 * 내 계약서 목록을 불러옵니다.
 * 목록 응답에는 점검 결과가 없어, 카드의 개수 태그를 위해 각 계약서의 상세를 함께 불러옵니다.
 * TODO: 백엔드 목록 응답에 결과 요약(counts)이 생기면 상세 조회를 없앱니다.
 */
async function loadReports(onPartial: (reports: ReportListItem[]) => void): Promise<ReportListItem[]> {
  const { contracts } = await listContracts()
  const sorted = [...contracts].sort((a, b) => b.created_at.localeCompare(a.created_at))
  onPartial(sorted.map((c) => toListItem(c)))
  const details = await Promise.allSettled(sorted.map((c) => getContract(c.id)))
  return sorted.map((c, i) => {
    const d = details[i]
    return d.status === 'fulfilled'
      ? toListItem(c, d.value.current_result)
      : { ...toListItem(c), result: 'unknown' as const }
  })
}

/** 비로그인 상태 */
function LoginRequired() {
  return (
    <div className="empty">
      <LockIcon size={40} strokeWidth={1.8} className="empty__icon" />
      <h2>로그인이 필요해요</h2>
      <p className="empty__sub">점검 리포트는 로그인한 계정에만 저장돼요.</p>
      <Link
        to="/login"
        state={{ reason: 'reports', returnTo: '/reports' }}
        className="btn btn-primary btn-sm empty__action"
      >
        로그인하기
      </Link>
    </div>
  )
}

/** 점검 기록이 없는 상태 */
function NoReports() {
  return (
    <div className="empty">
      <h2>아직 점검한 계약서가 없어요</h2>
      <p className="empty__sub">첫 계약서를 올려 점검해 보세요.</p>
      <Link to="/" className="btn btn-primary btn-sm empty__action">
        계약서 점검하기
      </Link>
    </div>
  )
}

function ReportCard({ report, onDelete }: { report: ReportListItem; onDelete: () => void }) {
  const { contract, counts } = report
  const title = titleOf(report)
  const toCheck = counts ? counts.LEGAL_RISK + counts.DISADVANTAGE + counts.MISSING : 0
  return (
    <article className="rcard">
      <span className="rcard__icon">
        <DocLinesIcon size={22} />
      </span>
      <div className="rcard__info">
        <h3>{title}</h3>
        <div className="rcard__meta">
          {report.result === 'ready' && report.checkedAt
            ? `${formatDateTime(report.checkedAt)} 점검 · 항목 ${report.itemCount}개 검토`
            : `${formatDateTime(contract.created_at)} 저장${report.result === 'none' ? ' · 분석 전' : ''}`}
        </div>
        <div className="pills">
          {/* 리포트 화면 상단과 같은 기준 */}
          {report.result === 'loading' && <span className="pill pill--gray">결과 불러오는 중</span>}
          {report.result === 'none' && <span className="pill pill--gray">분석 전</span>}
          {report.result === 'unknown' && <span className="pill pill--gray">결과를 불러오지 못했어요</span>}
          {counts && toCheck === 0 && <span className="pill pill--green">확인할 사항 없음</span>}
          {counts && toCheck > 0 && (
            <>
              {counts.LEGAL_RISK > 0 && <span className="pill pill--red">위험 조항 {counts.LEGAL_RISK}</span>}
              {counts.DISADVANTAGE > 0 && <span className="pill pill--blue">불리한 조건 {counts.DISADVANTAGE}</span>}
              {counts.MISSING > 0 && <span className="pill pill--amber">필수 기재사항 확인 {counts.MISSING}</span>}
            </>
          )}
        </div>
      </div>
      <div className="rcard__actions">
        <Link to={`/reports/${contract.id}`} className="btn btn-primary btn-sm">
          리포트 보기
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`${title} 삭제`} onClick={onDelete}>
          삭제
        </button>
      </div>
    </article>
  )
}

function MyReportsPage() {
  const { user, loading } = useAuth()
  // 리포트 상세에서 삭제하고 돌아온 경우 (DeleteReportButton이 state로 알려줌)
  const deletedId = (useLocation().state as { deleted?: string } | null)?.deleted ?? null
  const [deletedNote, setDeletedNote] = useState(deletedId !== null)
  const navigate = useNavigate()
  // 새로고침하면 안내가 다시 뜨지 않도록 주소 기록의 state를 비웁니다.
  useEffect(() => {
    if (deletedId) navigate('.', { replace: true, state: null })
  }, [deletedId, navigate])
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [samples, setSamples] = useState<ReportListItem[]>(() =>
    SHOW_SAMPLES ? SAMPLE_REPORTS.filter((r) => r.contract.id !== deletedId) : [],
  )
  const [reloadKey, setReloadKey] = useState(0)
  const [target, setTarget] = useState<ReportListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const closeDialog = () => {
    setTarget(null)
    setDeleteError(null)
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    loadReports((partial) => !cancelled && setList({ status: 'ready', reports: partial }))
      .then((reports) => !cancelled && setList({ status: 'ready', reports }))
      .catch(() => !cancelled && setList({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [user, reloadKey])

  const retry = () => {
    setList({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }

  const removeFromList = (id: string) => {
    setSamples((l) => l.filter((r) => r.contract.id !== id))
    setList((st) => (st.status === 'ready' ? { ...st, reports: st.reports.filter((r) => r.contract.id !== id) } : st))
  }

  const confirmDelete = async () => {
    if (!target) return
    const id = target.contract.id
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeContract(id)
    } catch (err) {
      setDeleteError(deleteErrorMessage(err))
      setDeleting(false)
      return
    }
    removeFromList(id)
    setDeleting(false)
    closeDialog()
    setDeletedNote(true)
  }

  if (loading) return <AuthLoading />

  if (!user) {
    return (
      <section className="wrap">
        <div className="page-head">
          <h1>내 리포트</h1>
          <p className="page-head__sub">로그인하면 점검한 계약서를 모아 볼 수 있어요.</p>
        </div>
        <LoginRequired />
      </section>
    )
  }

  const reports = list.status === 'ready' ? list.reports : []
  const withRisk = reports.filter((r) => r.counts && r.counts.LEGAL_RISK > 0).length
  const renderCard = (report: ReportListItem) => (
    <ReportCard key={report.contract.id} report={report} onDelete={() => setTarget(report)} />
  )

  return (
    <section className="wrap">
      <div className="page-head">
        <h1>내 리포트</h1>
        <p className="page-head__sub">
          {list.status === 'ready' ? `점검한 계약서 ${reports.length}건` : '점검한 계약서를 불러오고 있어요'}
        </p>
      </div>

      {deletedNote && (
        <p className="list-done" role="status">
          리포트를 삭제했어요.
        </p>
      )}

      {list.status === 'loading' && <p className="list-note">불러오는 중…</p>}

      {list.status === 'error' && (
        <div className="empty">
          <h2>리포트를 불러오지 못했어요</h2>
          <p className="empty__sub">잠시 후 다시 시도해 주세요.</p>
          <button type="button" className="btn btn-primary btn-sm empty__action" onClick={retry}>
            다시 시도
          </button>
        </div>
      )}

      {list.status === 'ready' && (
        <>
          <div className="stats">
            <div className="stat">
              <span>점검한 계약서</span>
              <b>{reports.length}건</b>
            </div>
            <div className="stat">
              <span>위험 조항이 있는 계약서</span>
              <b className="stat__value--red">{withRisk}건</b>
            </div>
          </div>
          {reports.length === 0 ? <NoReports /> : <div className="rlist">{reports.map(renderCard)}</div>}
        </>
      )}

      {samples.length > 0 && (
        <>
          <div className="sample-head">
            <h2>예시 리포트</h2>
            <p>개발 서버에서만 보이는 화면 확인용 예시예요. 실제 점검 결과가 아니에요.</p>
          </div>
          <div className="rlist">{samples.map(renderCard)}</div>
        </>
      )}

      {target && (
        <ConfirmDialog
          title="리포트를 삭제할까요?"
          confirmLabel="삭제"
          pendingLabel="삭제하는 중…"
          pending={deleting}
          error={deleteError}
          danger
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        >
          <p>
            {titleOf(target)} 원문과 점검 결과가 <strong>영구 삭제</strong>돼요.
          </p>
          <p>삭제하면 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

export default MyReportsPage

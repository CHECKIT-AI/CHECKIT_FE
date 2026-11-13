import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { DocLinesIcon, LockIcon } from '../components/icons'
import { SAMPLE_REPORTS, type ReportListItem } from '../mocks/reports'
import { formatDateTime } from '../report/view'
import './MyReportsPage.css'

const TITLE: Record<string, string> = { EMPLOYMENT: '근로계약서' }

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

function ReportCard({ report }: { report: ReportListItem }) {
  const { contract, counts } = report
  const title = TITLE[contract.contract_type] ?? '계약서'
  const toCheck = counts ? counts.LEGAL_RISK + counts.DISADVANTAGE + counts.MISSING : 0
  return (
    <article className="rcard">
      <span className="rcard__icon">
        <DocLinesIcon size={22} />
      </span>
      <div className="rcard__info">
        <h3>{title}</h3>
        <div className="rcard__meta">
          {report.checkedAt
            ? `${formatDateTime(report.checkedAt)} 점검 · 항목 ${report.itemCount}개 검토`
            : `${formatDateTime(contract.created_at)} 저장 · 분석 전`}
        </div>
        <div className="pills">
          {/* 리포트 화면 상단과 같은 기준 */}
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
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`${title} 삭제`}>
          삭제
        </button>
      </div>
    </article>
  )
}

function MyReportsPage() {
  const { user, loading } = useAuth()

  if (loading) return null

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

  // TODO: API 연결 시 목록(GET /api/contracts)으로 대체
  const reports = SAMPLE_REPORTS
  const withRisk = reports.filter((r) => r.counts && r.counts.LEGAL_RISK > 0).length

  return (
    <section className="wrap">
      <div className="page-head">
        <h1>내 리포트</h1>
        <p className="page-head__sub">점검한 계약서 {reports.length}건</p>
      </div>

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

      {reports.length === 0 ? (
        <NoReports />
      ) : (
        <div className="rlist">
          {reports.map((report) => (
            <ReportCard key={report.contract.id} report={report} />
          ))}
        </div>
      )}
    </section>
  )
}

export default MyReportsPage

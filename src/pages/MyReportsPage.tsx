import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { DocLinesIcon, LockIcon } from '../components/icons'
import { SAMPLE_REPORTS, type Report } from '../mocks/reports'
import './MyReportsPage.css'

function formatDate(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${hh}:${mm}`
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

function ReportCard({ report }: { report: Report }) {
  const s = report.summary
  const risk = s.violation + s.warning
  const requiredCheck = s.missing + s.needsCheck
  return (
    <article className="rcard">
      <span className="rcard__icon">
        <DocLinesIcon size={22} />
      </span>
      <div className="rcard__info">
        <h3>{report.title}</h3>
        <div className="rcard__meta">
          {formatDate(report.checkedAt)} 점검 · 조항 {s.clauses}개 분석
        </div>
        <div className="pills">
          {/* 리포트 화면 상단과 같은 기준: 위험 조항 전체, 확인이 필요한 필수 기재사항 */}
          {risk + requiredCheck === 0 ? (
            <span className="pill pill--green">확인할 사항 없음</span>
          ) : (
            <>
              <span className="pill pill--red">위험 조항 {risk}</span>
              <span className="pill pill--amber">필수 기재사항 확인 {requiredCheck}</span>
            </>
          )}
        </div>
      </div>
      <div className="rcard__actions">
        <Link to={`/reports/${report.id}`} className="btn btn-primary btn-sm">
          리포트 보기
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`${report.title} 삭제`}>
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
  const withViolation = reports.filter((r) => r.summary.violation > 0).length

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
          <span>법령 위반 가능성이 있는 계약서</span>
          <b className="stat__value--red">{withViolation}건</b>
        </div>
      </div>

      {reports.length === 0 ? (
        <NoReports />
      ) : (
        <div className="rlist">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </section>
  )
}

export default MyReportsPage

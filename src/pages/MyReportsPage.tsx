import { Link } from 'react-router'
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
export function LoginRequired() {
  return (
    <div className="empty">
      <LockIcon size={40} strokeWidth={1.8} className="empty__icon" />
      <h2>로그인이 필요해요</h2>
      <p className="empty__sub">점검 리포트는 로그인한 계정에만 저장돼요.</p>
      <Link to="/login" className="btn btn-primary btn-sm empty__action">
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
          {s.questions > 0 ? (
            <span className="pill pill--amber">확인할 사항 {s.questions}개</span>
          ) : (
            <span className="pill pill--green">확인할 사항 없음</span>
          )}
          {s.violation > 0 && <span className="pill pill--red">법령 위반 가능성 {s.violation}</span>}
          {s.warning > 0 && <span className="pill pill--amber">주의 조항 {s.warning}</span>}
          {s.missing > 0 && <span className="pill pill--amber">누락 의심 {s.missing}</span>}
          {s.needsCheck > 0 && <span className="pill pill--blue">추가 확인 {s.needsCheck}</span>}
          <span className="pill pill--green">확인됨 {s.ok}</span>
        </div>
      </div>
      <div className="rcard__actions">
        <button type="button" className="btn btn-primary btn-sm">
          리포트 보기
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`${report.title} 삭제`}>
          삭제
        </button>
      </div>
    </article>
  )
}

function MyReportsPage() {
  // TODO: API 연결 시 로그인 상태(GET /api/auth/me)와 목록(GET /api/contracts)으로 대체
  const reports = SAMPLE_REPORTS
  const withViolation = reports.filter((r) => r.summary.violation > 0).length
  const totalQuestions = reports.reduce((sum, r) => sum + r.summary.questions, 0)

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
        <div className="stat">
          <span>서명 전 확인할 사항 (전체)</span>
          <b className="stat__value--accent">{totalQuestions}개</b>
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

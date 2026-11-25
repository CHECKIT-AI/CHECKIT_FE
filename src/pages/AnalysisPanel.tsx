import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { jobFailure, startErrorMessage } from '../api/analysis'
import { guessEffectiveDate, LAW_DATA_DATE, SUPPORTED_YEAR, todayISO } from '../analysis/context'
import { clearJobId, runnerFor, saveJobId, savedJobId } from '../analysis/runner'
import DeleteReportButton from '../components/DeleteReportButton'
import { CheckIcon } from '../components/icons'
import type { ContractDetailResponse, JobAnalysisResult, JobStage, StartAnalysisRequest } from '../types/api'
import { formatDateTime } from '../report/view'
import './AnalysisPanel.css'

type Props = {
  detail: ContractDetailResponse
  /** 방금 저장하고 들어왔는지 */
  justSaved: boolean
  /** 분석이 끝났을 때. 예시는 결과를 바로 넘기고, 실제는 계약서 상세를 다시 불러옵니다. */
  onFinished: (result: JobAnalysisResult) => void
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'form' }
  | { kind: 'notLive' }
  | { kind: 'running'; jobId: string; stage: JobStage | null; queued: boolean; startedAt: number }
  | { kind: 'failed'; message: string; retry: boolean }

const STEPS: { stage: JobStage; title: string; doing: string; desc: string }[] = [
  { stage: 'CLASSIFY', title: '조항 나누기·분류', doing: '조항을 나누고 분류하고 있어요', desc: '계약서를 조항별로 나누고 어떤 내용인지 분류해요' },
  { stage: 'RETRIEVE', title: '관련 법령 찾기', doing: '관련 법령을 찾고 있어요', desc: '조항마다 관련된 근로기준법 조문을 찾아요' },
  { stage: 'EVALUATE', title: 'AI 판단', doing: 'AI가 판단하고 있어요', desc: '찾은 법령과 대조해 위험·누락 여부를 판단해요' },
  { stage: 'EXPLAIN', title: '결과 정리', doing: '결과를 정리하고 있어요', desc: '근거 법령과 설명을 정리해요' },
]

const WORK_TYPES = ['', '정규직 (기간 정함 없음)', '계약직 (기간 정함 있음)', '단시간 (아르바이트)', '기타']

function AnalysisPanel({ detail, justSaved, onFinished }: Props) {
  const contractId = detail.contract.id
  const runner = useMemo(() => runnerFor(contractId), [contractId])
  const content = detail.text?.content ?? ''
  const guess = useMemo(() => guessEffectiveDate(content), [content])

  // 진행 중이던 작업이 있으면 이어서 보여줍니다.
  const [phase, setPhase] = useState<Phase>(() => {
    const jobId = runner ? savedJobId(contractId) : null
    return jobId ? { kind: 'running', jobId, stage: null, queued: true, startedAt: Date.now() } : { kind: 'intro' }
  })
  // 기준 날짜는 오늘(점검하는 날)로 채웁니다. 계약서에서 찾은 근로 시작일은 참고로 보여줍니다.
  const [effectiveDate, setEffectiveDate] = useState(todayISO)
  const [employees, setEmployees] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('')
  const [workType, setWorkType] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const year = effectiveDate ? Number(effectiveDate.slice(0, 4)) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body: StartAnalysisRequest = { privacy_confirmed: true, gemini_notice_acknowledged: true }
    if (effectiveDate) body.effective_date = effectiveDate
    if (employees.trim()) {
      const n = Number(employees)
      if (!Number.isInteger(n) || n < 1 || n > 100000) return setFormError('상시 근로자 수는 1 이상의 정수로 적어 주세요.')
      body.employee_count = n
    }
    if (weeklyHours.trim()) {
      const h = Number(weeklyHours)
      if (!(h > 0 && h <= 168)) return setFormError('주당 근로시간은 0보다 크고 168 이하로 적어 주세요.')
      body.weekly_hours = h
    }
    if (workType) body.work_type = workType
    setFormError(null)

    if (!runner) {
      setPhase({ kind: 'notLive' })
      return
    }
    setStarting(true)
    try {
      const jobId = await runner.start(body)
      saveJobId(contractId, jobId)
      setPhase({ kind: 'running', jobId, stage: null, queued: true, startedAt: Date.now() })
    } catch (err) {
      setFormError(startErrorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  // 진행 상태를 주기적으로 묻습니다.
  const runningJob = phase.kind === 'running' ? phase.jobId : null
  useEffect(() => {
    if (!runningJob || !runner) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const job = await runner.poll(runningJob)
        if (stopped) return
        if (job.status === 'SUCCEEDED' && job.result) {
          clearJobId(contractId)
          onFinished(job.result)
          return
        }
        if (job.status === 'FAILED') {
          clearJobId(contractId)
          setPhase({ kind: 'failed', ...jobFailure(job.error_code) })
          return
        }
        setPhase((p) => (p.kind === 'running' ? { ...p, stage: job.stage, queued: job.status === 'QUEUED' } : p))
      } catch {
        // 일시적인 연결 오류는 다음 확인 때 다시 시도합니다.
      }
      if (!stopped) timer = setTimeout(tick, runner.interval)
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [runningJob, runner, contractId, onFinished])

  return (
    <section className="wrap analysis">
      <div className="analysis-head">
        <div className="analysis-head__top">
          <Link to="/reports" className="back-link">
            ← 내 리포트
          </Link>
          {/* 분석 중에는 지우지 않도록 숨깁니다. */}
          {phase.kind !== 'running' && <DeleteReportButton contractId={contractId} title="근로계약서" />}
        </div>
        <h1>{phase.kind === 'running' ? '계약서를 점검하고 있어요' : '아직 점검하지 않은 계약서예요'}</h1>
        <p>
          {justSaved && phase.kind === 'intro' && (
            <>
              <b>계약서를 저장했어요.</b>
              <br />
            </>
          )}
          {formatDateTime(detail.contract.created_at)}에 저장한 계약서예요.
          {runner?.mock && <span className="analysis-mock"> 예시 계약서라 실제 분석 대신 예시 결과로 진행돼요.</span>}
        </p>
      </div>

      {phase.kind === 'intro' && (
        <div className="panel analysis-card">
          <h2>점검을 시작해 볼까요?</h2>
          <p className="analysis-lead">
            조항마다 관련 법령을 찾아 위험한 조항, 불리한 조건, 빠진 필수 기재사항을 점검해요.
            <br />
            보통 1~2분쯤 걸려요.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setPhase({ kind: 'form' })}>
            점검 시작하기
          </button>
          <SavedText content={content} />
        </div>
      )}

      {(phase.kind === 'form' || phase.kind === 'notLive') && (
        <form className="panel analysis-card" onSubmit={submit} noValidate>
          <h2>점검 조건을 확인해 주세요</h2>
          <p className="analysis-lead">정확하게 적을수록 판단이 정확해져요. 모르는 칸은 비워 둬도 돼요.</p>

          <div className="field">
            <label htmlFor="an-date">기준 날짜</label>
            <input
              id="an-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              aria-describedby="an-date-help"
            />
            <p id="an-date-help" className="field__help">
              이 날짜에 시행 중인 법령으로 판단해요. 오늘 기준으로 점검하려면 그대로 두세요.
              {guess && (
                <>
                  <br />
                  계약서의 근로 시작일: <b>{guess.value}</b> (
                  <q>{guess.line.length > 30 ? guess.line.slice(0, 30) + '…' : guess.line}</q>)
                </>
              )}
            </p>
            {effectiveDate && effectiveDate < LAW_DATA_DATE && (
              <p className="field__warn">
                지금 준비된 법령 자료는 {LAW_DATA_DATE.replace(/-/g, '.')} 개정 기준이에요. 이보다 이른 날짜로 하면
                근로기준법 근거를 쓸 수 없어 대부분 판단을 보류해요.
              </p>
            )}
            {year !== null && year !== SUPPORTED_YEAR && (
              <p className="field__warn">
                지금은 {SUPPORTED_YEAR}년 법령·최저임금만 준비돼 있어요. 다른 연도면 일부 항목은 판단을 보류해요.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="an-emp">상시 근로자 수</label>
            <div className="field__row">
              <input
                id="an-emp"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="예: 6"
                value={employees}
                onChange={(e) => setEmployees(e.target.value)}
              />
              <span>명</span>
            </div>
            <p className="field__help">
              사장님을 빼고 평소 일하는 사람 수예요. 5명 이상이면 가산수당 같은 규정이 더 적용돼요.
            </p>
          </div>

          <div className="field">
            <label htmlFor="an-hours">주당 근로시간</label>
            <div className="field__row">
              <input
                id="an-hours"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                placeholder="예: 40"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
              />
              <span>시간</span>
            </div>
            <p className="field__help">월급제라면 최저임금 계산에 써요.</p>
          </div>

          <div className="field">
            <label htmlFor="an-type">근무 형태</label>
            <select id="an-type" value={workType} onChange={(e) => setWorkType(e.target.value)}>
              {WORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t || '선택 안 함'}
                </option>
              ))}
            </select>
          </div>

          <p className="analysis-note">
            저장할 때 동의한 대로, 개인정보를 가린 계약서 텍스트가 점검을 위해 Google의 AI(Gemini)로 전송돼요.
          </p>

          {phase.kind === 'notLive' && (
            <div className="analysis-notice" role="status">
              <strong>실제 분석은 아직 연결 준비 중이에요</strong>
              지금은 화면만 준비돼 있어서 이 계약서는 점검을 시작하지 않았어요.
              {import.meta.env.DEV && (
                <>
                  <br />
                  (개발) 진행 화면은 <Link to="/reports/sample-3">분석 전 예시 계약서</Link>에서 확인할 수 있어요.
                </>
              )}
            </div>
          )}
          {formError && (
            <p className="analysis-error" role="alert">
              {formError}
            </p>
          )}

          <div className="analysis-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhase({ kind: 'intro' })}>
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={starting}>
              {starting ? '시작하는 중…' : '점검 시작'}
            </button>
          </div>
        </form>
      )}

      {phase.kind === 'running' && <Progress stage={phase.stage} queued={phase.queued} />}

      {phase.kind === 'failed' && (
        <div className="panel analysis-card">
          <h2>점검하지 못했어요</h2>
          <div className="analysis-error" role="alert">
            {phase.message}
          </div>
          <div className="analysis-actions">
            <Link to="/reports" className="btn btn-ghost btn-sm">
              내 리포트로
            </Link>
            {phase.retry && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPhase({ kind: 'form' })}>
                다시 시도
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** 진행 단계 표시 */
function Progress({ stage, queued }: { stage: JobStage | null; queued: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const current = queued ? -1 : STEPS.findIndex((s) => s.stage === stage)

  return (
    <div className="panel analysis-card" aria-live="polite">
      <div className="progress-head">
        <h2>{queued ? '순서를 기다리고 있어요' : STEPS[Math.max(current, 0)].doing}</h2>
        <span className="progress-time">{seconds}초</span>
      </div>
      <ol className="steps-v">
        {STEPS.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'now' : 'todo'
          return (
            <li key={s.stage} className={`step-v step-v--${state}`}>
              <span className="step-v__mark" aria-hidden="true">
                {state === 'done' ? <CheckIcon size={14} /> : state === 'now' ? <span className="spinner-sm" /> : i + 1}
              </span>
              <span>
                <b>{s.title}</b>
                <small>{s.desc}</small>
              </span>
              <span className="sr-only">{state === 'done' ? '완료' : state === 'now' ? '진행 중' : '대기'}</span>
            </li>
          )
        })}
      </ol>
      <p className="analysis-note">
        보통 1~2분쯤 걸려요. 다른 화면에 다녀와도 이 탭에서는 이어서 볼 수 있어요.
      </p>
    </div>
  )
}

/** 저장된(개인정보를 가린) 계약서 텍스트 */
function SavedText({ content }: { content: string }) {
  if (!content) return null
  return (
    <details className="saved-text">
      <summary>저장된 계약서 내용 보기</summary>
      <pre>{content}</pre>
    </details>
  )
}

export default AnalysisPanel

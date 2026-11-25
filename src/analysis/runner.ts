// 분석 작업을 시작하고 진행 상태를 받아오는 방법을 고릅니다.
// - 예시 계약서(sample-*): 백엔드와 같은 형식의 예시 응답으로 진행합니다. (서버 호출 없음)
// - 실제 계약서: ANALYSIS_LIVE가 true일 때만 실제 API를 부릅니다. (Gemini 사용량이 쓰임)

import { getAnalysisJob, startAnalysis } from '../api/analysis'
import { SAMPLE_JOB_RESULTS } from '../mocks/analysis'
import type { AnalysisJobResponse, JobAnalysisResult, JobStage, StartAnalysisRequest } from '../types/api'

/**
 * 실제 분석 연결 스위치.
 * Gemini 무료 사용량 때문에 꺼 두었습니다. 켜면 실제 계약서의 [점검 시작]이 백엔드 분석을 시작합니다.
 */
export const ANALYSIS_LIVE = true

export type Runner = {
  /** 예시 응답으로 도는지 */
  mock: boolean
  /** 진행 상태를 다시 묻는 간격(ms) */
  interval: number
  start: (body: StartAnalysisRequest) => Promise<string>
  poll: (jobId: string) => Promise<AnalysisJobResponse>
}

/** 이 계약서에서 분석을 돌릴 방법. 실제 분석이 꺼져 있으면 null */
export function runnerFor(contractId: string): Runner | null {
  const sample = SAMPLE_JOB_RESULTS[contractId]
  if (sample) return mockRunner(sample)
  if (!ANALYSIS_LIVE) return null
  return {
    mock: false,
    interval: 2000,
    start: async (body) => (await startAnalysis(contractId, body)).job_id,
    poll: (jobId) => getAnalysisJob(contractId, jobId),
  }
}

/* ───────── 예시 응답 ───────── */

/** 예시 진행 시간표(초). 실제 분석은 계약서에 따라 수십 초~몇 분 걸립니다. */
const TIMELINE: { until: number; status: 'QUEUED' | 'RUNNING'; stage: JobStage | null }[] = [
  { until: 1.5, status: 'QUEUED', stage: null },
  { until: 4, status: 'RUNNING', stage: 'CLASSIFY' },
  { until: 7, status: 'RUNNING', stage: 'RETRIEVE' },
  { until: 11, status: 'RUNNING', stage: 'EVALUATE' },
  { until: 13, status: 'RUNNING', stage: 'EXPLAIN' },
]

/**
 * 시작 시각을 job_id에 넣어 두어, 화면을 나갔다 와도 이어서 진행됩니다.
 * 주소에 ?mock=fail 을 붙이면 '판단' 단계에서 실패하는 경우를 볼 수 있습니다.
 */
function mockRunner(result: JobAnalysisResult): Runner {
  return {
    mock: true,
    interval: 600,
    start: async () => {
      await new Promise((r) => setTimeout(r, 400))
      const fail = new URLSearchParams(window.location.search).get('mock') === 'fail'
      return `mock-${fail ? 'fail' : 'ok'}-${Date.now()}`
    },
    poll: async (jobId) => {
      const [, kind, startedAt] = jobId.split('-')
      const sec = (Date.now() - Number(startedAt)) / 1000
      const step = TIMELINE.find((t) => sec < t.until)
      if (kind === 'fail' && (!step || step.stage === 'EVALUATE')) {
        return { job_id: jobId, status: 'FAILED', stage: 'EVALUATE', error_code: 'LLM_UNAVAILABLE', result: null }
      }
      if (step) return { job_id: jobId, status: step.status, stage: step.stage, error_code: null, result: null }
      return {
        job_id: jobId,
        status: 'SUCCEEDED',
        stage: 'EXPLAIN',
        error_code: null,
        result: { ...result, completed_at: new Date().toISOString() },
      }
    },
  }
}

/* ───────── 진행 중인 작업 기억 ─────────
 * 분석은 서버에서 계속 돌기 때문에, 화면을 나갔다 와도 이어서 진행 상태를 보여줄 수 있게
 * 계약서별 job_id를 이 탭(sessionStorage)에 기억합니다. 백엔드에 '진행 중 작업 조회' API가 없어서입니다.
 */

const key = (contractId: string) => `checkit.analysisJob.${contractId}`

export function savedJobId(contractId: string): string | null {
  try {
    return sessionStorage.getItem(key(contractId))
  } catch {
    return null
  }
}

export function saveJobId(contractId: string, jobId: string) {
  try {
    sessionStorage.setItem(key(contractId), jobId)
  } catch {
    // 저장소를 못 써도 진행에는 문제 없음 (나갔다 오면 이어서 못 볼 뿐)
  }
}

export function clearJobId(contractId: string) {
  try {
    sessionStorage.removeItem(key(contractId))
  } catch {
    // 무시
  }
}

// 분석 작업 API
// POST /api/analysis/contracts/{contract_id}/jobs       분석 시작 → { job_id, status: 'QUEUED' }
// GET  /api/analysis/contracts/{contract_id}/jobs/{id}  진행 상태 (QUEUED → RUNNING(단계) → SUCCEEDED·FAILED)
// 실제로 부르면 Gemini 사용량이 쓰입니다. 화면에서 부를지는 src/analysis/runner.ts 의 ANALYSIS_LIVE 로 정합니다.

import type { AnalysisJobResponse, StartAnalysisRequest, StartAnalysisResponse } from '../types/api'
import { api, ApiError } from './client'

const base = (contractId: string) => `/api/analysis/contracts/${encodeURIComponent(contractId)}/jobs`

export function startAnalysis(contractId: string, body: StartAnalysisRequest) {
  return api<StartAnalysisResponse>(base(contractId), { method: 'POST', body })
}

export function getAnalysisJob(contractId: string, jobId: string) {
  return api<AnalysisJobResponse>(`${base(contractId)}/${encodeURIComponent(jobId)}`)
}

/** 분석 시작 요청이 거부됐을 때 보여줄 문구 (줄바꿈으로 한 줄씩) */
export function startErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return '분석을 시작하지 못했어요.\n인터넷 연결을 확인하고 다시 시도해 주세요.'
  switch (e.code) {
    case 'ANALYSIS_CONFLICT':
      return '이 계약서는 이미 분석 중이에요.\n잠시 후 새로고침해 주세요.'
    case 'ANALYSIS_INPUT_UNAVAILABLE':
      return '분석할 계약서 내용이 없어요.\n계약서를 다시 올려 주세요.'
    case 'PERSONAL_DATA_DETECTED':
      return '개인정보로 보이는 글자가 남아 있어 분석할 수 없어요.\n계약서를 다시 올려 개인정보를 가려 주세요.'
    case 'ANALYSIS_INPUT_LIMIT':
      return '계약서가 너무 길거나 조항이 너무 많아요.\n필요 없는 부분을 지우고 다시 올려 주세요.'
    case 'INVALID_INPUT':
      return '입력한 조건의 형식이 올바르지 않아요.\n날짜와 숫자를 확인해 주세요.'
    case 'RATE_LIMITED':
      return '분석 요청이 너무 잦아요.\n1분쯤 뒤에 다시 시도해 주세요.'
    case 'ANALYSIS_UNAVAILABLE':
      return '분석 기능이 아직 준비되지 않았어요.\n잠시 후 다시 시도해 주세요.'
    case 'AUTHENTICATION_REQUIRED':
      return '로그인이 풀렸어요.\n다시 로그인한 뒤 시도해 주세요.'
  }
  return '분석을 시작하지 못했어요.\n잠시 후 다시 시도해 주세요.'
}

/** 분석이 실패(FAILED)했을 때 error_code별 문구와 다시 시도할 수 있는지. 기준: analysis_jobs.py run_job */
export function jobFailure(code: string | null): { message: string; retry: boolean } {
  switch (code) {
    case 'ANALYSIS_INPUT_LIMIT':
      return { message: '계약서가 너무 길거나 조항이 많아 분석하지 못했어요.\n필요 없는 부분을 지우고 다시 올려 주세요.', retry: false }
    case 'LLM_UNAVAILABLE':
      return { message: 'AI 분석 서버가 잠시 응답하지 않아요.\n잠시 후 다시 시도해 주세요.', retry: true }
    case 'ANALYSIS_STALE_INPUT':
      return { message: '분석하는 동안 계약서 내용이 바뀌었어요.\n다시 시작해 주세요.', retry: true }
    case 'ANALYSIS_INTERRUPTED':
      return { message: '분석이 중간에 멈췄어요.\n다시 시도해 주세요.', retry: true }
  }
  return { message: '분석하지 못했어요.\n잠시 후 다시 시도해 주세요.', retry: true }
}

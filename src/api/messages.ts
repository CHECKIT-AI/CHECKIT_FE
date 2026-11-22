// 화면에 보여줄 오류 문구를 한곳에서 만듭니다.
//
// 문구 규칙
// - 두 줄로 씁니다: 1줄 "무슨 일이 있었는지" / 2줄 "어떻게 하면 되는지". 줄바꿈은 \n (화면은 white-space: pre-line)
// - 끝맺음은 "~했어요 / ~해 주세요"로 맞춥니다.
// - 같은 상황은 어느 화면에서나 같은 말로: 네트워크·요청 과다·로그인 만료·보안 확인·서버 문제
// - 화면마다 다른 건 "무엇을 못 했는지"(저장/삭제/분석…)와 그 기능에만 있는 오류 코드뿐입니다.

import { ApiError } from './client'

/** 상황별 둘째 줄(어떻게 하면 되는지) */
export const NEXT = {
  retry: '잠시 후 다시 시도해 주세요.',
  network: '인터넷 연결을 확인하고 다시 시도해 주세요.',
  wait: '1분쯤 뒤에 다시 시도해 주세요.',
  relogin: '다시 로그인한 뒤 시도해 주세요.',
  refresh: '페이지를 새로고침한 뒤 다시 시도해 주세요.',
} as const

/** 어느 화면에서나 같은 공통 상황 */
export const COMMON = {
  network: (action: string) => `${action} 못했어요.\n${NEXT.network}`,
  rateLimited: `요청이 너무 잦아요.\n${NEXT.wait}`,
  expired: `로그인이 만료됐어요.\n${NEXT.relogin}`,
  csrf: `보안 확인에 실패했어요.\n${NEXT.refresh}`,
  server: `서버가 잠시 응답하지 않아요.\n${NEXT.retry}`,
  unreachable: `서버에 연결하지 못했어요.\n${NEXT.retry}`,
  failed: (action: string) => `${action} 못했어요.\n${NEXT.retry}`,
} as const

/**
 * 오류를 화면 문구로 바꿉니다.
 * @param action  "저장하지", "삭제하지"처럼 "~ 못했어요" 앞에 올 말
 * @param byCode  그 기능에만 있는 오류 코드별 문구 (공통 처리보다 먼저 봅니다)
 */
export function errorMessage(err: unknown, action: string, byCode: Record<string, string> = {}): string {
  if (!(err instanceof ApiError)) return COMMON.network(action)
  if (byCode[err.code]) return byCode[err.code]
  if (err.code === 'RATE_LIMITED' || err.status === 429) return COMMON.rateLimited
  if (err.code === 'AUTHENTICATION_REQUIRED' || err.status === 401) return COMMON.expired
  if (err.code === 'CSRF_FAILED') return COMMON.csrf
  // 프록시 오류(백엔드가 꺼져 있음 등)는 JSON이 아니라 UNKNOWN으로 옵니다.
  if (err.code === 'UNKNOWN' && err.status >= 500) return COMMON.unreachable
  if (err.status >= 500 || err.retryable) return COMMON.server
  return COMMON.failed(action)
}

// 이메일 로그인·가입 API (CHECKIT_BE app/auth.py)
// POST /api/auth/login                          이메일 로그인 → { user, csrf_token }
// POST /api/auth/signup                         가입 접수(202) → 인증 메일 발송. 메일 인증 후 따로 로그인
// POST /api/auth/email-verification/resend      인증 메일 다시 보내기(202). 계정이 있든 없든 같은 응답
// POST /api/auth/email-verification/confirm     메일 링크의 토큰으로 가입 확정. 자동 로그인하지 않음

import type { AcceptedResponse, EmailLoginResponse, SignupRequest, VerifyEmailResponse } from '../types/api'
import { api, ApiError } from './client'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export function emailLogin(email: string, password: string) {
  return api<EmailLoginResponse>('/api/auth/login', { method: 'POST', body: { email, password } })
}

export function signup(body: SignupRequest) {
  return api<AcceptedResponse>('/api/auth/signup', { method: 'POST', body })
}

export function resendVerification(email: string) {
  return api<AcceptedResponse>('/api/auth/email-verification/resend', { method: 'POST', body: { email } })
}

export function confirmEmail(token: string) {
  return api<VerifyEmailResponse>('/api/auth/email-verification/confirm', { method: 'POST', body: { token } })
}

/** 백엔드와 같은 이메일 형식 검사 (보내기 전에 미리 안내) */
export function looksLikeEmail(value: string) {
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(value.trim().toLowerCase())
}

/** 공통 오류 문구. 줄바꿈(\n)으로 한 줄씩 보여줍니다. */
function commonMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return '서버에 연결하지 못했어요.\n인터넷 연결을 확인하고 다시 시도해 주세요.'
  if (err.code === 'RATE_LIMITED') return '요청이 너무 많아요.\n잠시 후 다시 시도해 주세요.'
  if (err.code === 'EMAIL_NOT_CONFIGURED') return '지금은 이메일 가입을 쓸 수 없어요.\n카카오나 Google로 시작해 주세요.'
  if (err.code === 'DATABASE_UNAVAILABLE' || err.status >= 500)
    return '서버에 일시적인 문제가 있어요.\n잠시 후 다시 시도해 주세요.'
  return null
}

export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CREDENTIALS') return '이메일 또는 비밀번호가 맞지 않아요.\n다시 확인해 주세요.'
    if (err.code === 'EMAIL_VERIFICATION_REQUIRED')
      return '아직 이메일 인증을 하지 않았어요.\n받은 메일의 링크를 눌러 인증을 마쳐 주세요.'
    if (err.status === 422) return '이메일과 비밀번호 형식을 확인해 주세요.'
  }
  return commonMessage(err) ?? '로그인하지 못했어요.\n잠시 후 다시 시도해 주세요.'
}

export function signupErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'PASSWORD_POLICY') return `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해 주세요.`
    if (err.status === 422) return '이메일과 비밀번호 형식을 확인해 주세요.'
  }
  return commonMessage(err) ?? '가입하지 못했어요.\n잠시 후 다시 시도해 주세요.'
}

export function verifyErrorMessage(err: unknown): string {
  if (err instanceof ApiError && (err.code === 'INVALID_VERIFICATION_TOKEN' || err.status === 400 || err.status === 422))
    return '인증 링크가 만료됐거나 이미 사용한 링크예요.\n로그인 화면에서 인증 메일을 다시 받아 주세요.'
  return commonMessage(err) ?? '인증하지 못했어요.\n잠시 후 다시 시도해 주세요.'
}

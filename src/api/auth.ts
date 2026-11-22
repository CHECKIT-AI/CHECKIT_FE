// 이메일 로그인·가입 API (CHECKIT_BE app/auth.py)
// POST /api/auth/login                          이메일 로그인 → { user, csrf_token }
// POST /api/auth/signup                         가입 접수(202) → 인증 메일 발송. 메일 인증 후 따로 로그인
// POST /api/auth/email-verification/resend      인증 메일 다시 보내기(202). 계정이 있든 없든 같은 응답
// POST /api/auth/email-verification/confirm     메일 링크의 토큰으로 가입 확정. 자동 로그인하지 않음

import type { AcceptedResponse, EmailLoginResponse, SignupRequest, VerifyEmailResponse } from '../types/api'
import { api, ApiError } from './client'
import { errorMessage } from './messages'

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

/** 이메일 가입·인증에 공통인 코드별 문구 */
const EMAIL_CODES = {
  EMAIL_NOT_CONFIGURED: '지금은 이메일 가입을 쓸 수 없어요.\n카카오나 Google로 시작해 주세요.',
}

export function loginErrorMessage(err: unknown): string {
  // 로그인 요청의 401은 '만료'가 아니라 이메일·비밀번호가 틀린 경우입니다.
  if (err instanceof ApiError && err.status === 401)
    return '이메일 또는 비밀번호가 맞지 않아요.\n다시 확인해 주세요.'
  return errorMessage(err, '로그인하지', {
    EMAIL_VERIFICATION_REQUIRED: '아직 이메일 인증을 하지 않았어요.\n받은 메일의 링크를 눌러 인증을 마쳐 주세요.',
    INVALID_INPUT: '이메일과 비밀번호 형식이 올바르지 않아요.\n다시 확인해 주세요.',
  })
}

export function signupErrorMessage(err: unknown): string {
  return errorMessage(err, '가입하지', {
    ...EMAIL_CODES,
    PASSWORD_POLICY: `비밀번호가 너무 짧아요.\n${PASSWORD_MIN}자 이상으로 정해 주세요.`,
    INVALID_INPUT: '이메일과 비밀번호 형식이 올바르지 않아요.\n다시 확인해 주세요.',
  })
}

export function resendErrorMessage(err: unknown): string {
  return errorMessage(err, '인증 메일을 보내지', EMAIL_CODES)
}

export function verifyErrorMessage(err: unknown): string {
  const expired = '인증 링크가 만료됐거나 이미 사용한 링크예요.\n로그인 화면에서 인증 메일을 다시 받아 주세요.'
  return errorMessage(err, '인증하지', { INVALID_VERIFICATION_TOKEN: expired, INVALID_INPUT: expired })
}

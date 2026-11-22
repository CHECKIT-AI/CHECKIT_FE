import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { COMMON, NEXT } from '../api/messages'
import { safeReturnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import './LoginPage.css'

// 백엔드 소셜 로그인 콜백이 이 페이지로 돌려보냅니다.
// 예) /auth/complete#oauth_status=success&return_path=%2F
//     /auth/complete#oauth_status=error&error_code=OAUTH_DENIED

const ERROR_MESSAGES: Record<string, string> = {
  OAUTH_DENIED: '로그인을 취소했어요.\n다시 로그인하려면 아래 버튼을 눌러 주세요.',
  INVALID_OAUTH_STATE: '로그인 요청이 만료됐어요.\n처음부터 다시 로그인해 주세요.',
  OAUTH_CODE_INVALID: '소셜 계정 정보를 확인하지 못했어요.\n처음부터 다시 로그인해 주세요.',
  OAUTH_EXCHANGE_FAILED: '소셜 계정 정보를 확인하지 못했어요.\n처음부터 다시 로그인해 주세요.',
  OAUTH_IDENTITY_INVALID: '소셜 계정 정보를 확인하지 못했어요.\n처음부터 다시 로그인해 주세요.',
  OAUTH_PROVIDER_UNAVAILABLE: `로그인 서비스에 연결하지 못했어요.\n${NEXT.retry}`,
  ACCOUNT_INACTIVE: '로그인할 수 없는 계정이에요.\n다른 방법으로 로그인해 주세요.',
  DATABASE_UNAVAILABLE: COMMON.server,
}

function readResult() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  if (params.get('oauth_status') === 'success') {
    return { error: null, returnPath: safeReturnPath(params.get('return_path')) }
  }
  const code = params.get('error_code') ?? ''
  return { error: ERROR_MESSAGES[code] ?? COMMON.failed('로그인하지'), returnPath: '/' }
}

function AuthCompletePage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [result] = useState(readResult)
  const [error, setError] = useState<string | null>(result.error)
  const handled = useRef(false)

  useEffect(() => {
    if (result.error || handled.current) return // StrictMode 개발 모드의 중복 실행 방지
    handled.current = true

    refresh().then((me) => {
      if (me) navigate(result.returnPath, { replace: true })
      else setError(`로그인 정보를 확인하지 못했어요.\n${NEXT.retry}`)
    })
  }, [refresh, navigate, result])

  return (
    <section className="wrap">
      <div className="login-card">
        {error ? (
          <>
            <div>
              <h1>로그인하지 못했어요</h1>
              <p className="login-card__sub login-card__sub--lines">{error}</p>
            </div>
            <Link to="/login" replace className="btn btn-primary btn-social">
              다시 로그인하기
            </Link>
          </>
        ) : (
          <div>
            <h1>로그인하는 중…</h1>
            <p className="login-card__sub">잠시만 기다려 주세요.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default AuthCompletePage

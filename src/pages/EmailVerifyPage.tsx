import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { confirmEmail, verifyErrorMessage } from '../api/auth'
import './LoginPage.css'

// 가입 인증 메일의 링크가 이 페이지로 옵니다. 예) /auth/verify#token=43자
// 백엔드 설정 CHECKIT_VERIFICATION_PAGE_URL 을 이 주소로 맞춰야 합니다.
// 토큰은 주소 # 뒤에 있어 서버 기록에 남지 않고, 읽은 뒤 주소에서도 바로 지웁니다.

const TOKEN_LENGTH = 43

function readToken(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
  return token && token.length === TOKEN_LENGTH ? token : null
}

type State = { status: 'checking' } | { status: 'done' } | { status: 'error'; message: string }

function EmailVerifyPage() {
  const [token] = useState(readToken)
  const [state, setState] = useState<State>(() =>
    token
      ? { status: 'checking' }
      : { status: 'error', message: '인증 링크가 올바르지 않아요.\n메일의 링크를 다시 눌러 주세요.' },
  )
  const handled = useRef(false)

  useEffect(() => {
    // 토큰이 주소창·방문 기록에 남지 않게 지웁니다.
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname)
    if (!token || handled.current) return // StrictMode 개발 모드의 중복 실행 방지 (토큰은 한 번만 쓸 수 있음)
    handled.current = true
    confirmEmail(token)
      .then(() => setState({ status: 'done' }))
      .catch((err) => setState({ status: 'error', message: verifyErrorMessage(err) }))
  }, [token])

  return (
    <section className="wrap">
      <div className="login-card">
        {state.status === 'checking' && (
          <div>
            <h1>이메일을 인증하는 중…</h1>
            <p className="login-card__sub">잠시만 기다려 주세요.</p>
          </div>
        )}
        {state.status === 'done' && (
          <>
            <div>
              <h1>가입이 끝났어요</h1>
              <p className="login-card__sub">이메일 인증을 마쳤어요. 가입한 이메일과 비밀번호로 로그인해 주세요.</p>
            </div>
            <Link to="/login" replace className="btn btn-primary btn-social">
              로그인하기
            </Link>
          </>
        )}
        {state.status === 'error' && (
          <>
            <div>
              <h1>인증하지 못했어요</h1>
              <p className="login-card__sub login-card__sub--lines">{state.message}</p>
            </div>
            <Link to="/login" replace className="btn btn-primary btn-social">
              로그인 화면으로
            </Link>
          </>
        )}
      </div>
    </section>
  )
}

export default EmailVerifyPage

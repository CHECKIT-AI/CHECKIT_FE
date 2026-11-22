import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  loginErrorMessage,
  looksLikeEmail,
  resendErrorMessage,
  resendVerification,
  signup,
  signupErrorMessage,
} from '../api/auth'
import { api, ApiError } from '../api/client'
import { errorMessage } from '../api/messages'
import { safeReturnPath } from '../auth/returnPath'
import type { OAuthStartResponse } from '../types/api'
import { useAuth } from '../auth/useAuth'
import { AuthLoading } from '../components/AuthGate'
import { GoogleIcon, KakaoIcon } from '../components/icons'
import './LoginPage.css'

type LoginReason = 'upload' | 'analyze' | 'reports' | 'expired'
type LoginLocationState = { reason?: LoginReason; returnTo?: string } | null
type SocialProvider = 'kakao' | 'google'
/** login: 이메일 로그인 / signup: 가입 / sent: 인증 메일을 보낸 뒤 */
type Mode = 'login' | 'signup' | 'sent'

const SUBTITLE: Record<LoginReason | 'default', string> = {
  upload: '계약서를 올리려면 먼저 로그인해 주세요. 로그인 후 바로 파일을 선택할 수 있어요.',
  analyze: '계약서 점검은 로그인 후 이용할 수 있어요. 로그인하면 점검 결과가 내 리포트에 저장돼요.',
  reports: '로그인하면 점검한 계약서를 모아 볼 수 있어요.',
  expired: '로그인이 만료됐어요. 다시 로그인하면 보던 화면으로 돌아가요.',
  default: '로그인하면 계약서를 점검하고, 점검 리포트를 언제든 다시 볼 수 있어요.',
}

function startErrorMessage(err: unknown) {
  return errorMessage(err, '로그인을 시작하지', {
    OAUTH_NOT_CONFIGURED: '지금은 소셜 로그인을 쓸 수 없어요.\n이메일로 로그인하거나 잠시 후 다시 시도해 주세요.',
  })
}

function LoginPage() {
  const { user, loading, loginWithEmail } = useAuth()
  const navigate = useNavigate()
  const state = useLocation().state as LoginLocationState
  const returnTo = safeReturnPath(state?.returnTo)
  const subtitle = SUBTITLE[state?.reason ?? 'default']
  const [pending, setPending] = useState<SocialProvider | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  /** 미인증 계정으로 로그인하려 했을 때 인증 메일 다시 보내기를 보여줌 */
  const [needsVerify, setNeedsVerify] = useState(false)
  const [resent, setResent] = useState(false)

  // 이미 로그인했는지 확인이 끝나기 전에는 로그인 화면을 잠깐 보여주지 않습니다.
  if (loading) return <AuthLoading />
  if (user) return <Navigate to={returnTo} replace />

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNeedsVerify(false)
    setResent(false)
    setPassword('')
    setPassword2('')
  }

  const startLogin = async (provider: SocialProvider) => {
    setPending(provider)
    setError(null)
    try {
      const { authorization_url } = await api<OAuthStartResponse>(
        `/api/auth/oauth/${provider}/start`,
        { method: 'POST', body: { return_path: returnTo } },
      )
      // 카카오·구글 로그인 화면으로 이동합니다. 완료 후 /auth/complete 로 돌아옵니다.
      window.location.assign(authorization_url)
    } catch (err) {
      setError(startErrorMessage(err))
      setPending(null)
    }
  }

  /** 보내기 전에 화면에서 먼저 확인합니다. 문제가 없으면 null */
  const checkForm = (): string | null => {
    if (!looksLikeEmail(email)) return '이메일 주소를 확인해 주세요.'
    if (!password) return '비밀번호를 입력해 주세요.'
    if (mode === 'signup') {
      if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해 주세요.`
      if (password !== password2) return '비밀번호 확인이 일치하지 않아요.'
    }
    return null
  }

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault()
    const problem = checkForm()
    if (problem) {
      setError(problem)
      return
    }
    setPending('email')
    setError(null)
    setNeedsVerify(false)
    try {
      if (mode === 'login') {
        await loginWithEmail(email.trim(), password)
        navigate(returnTo, { replace: true })
        return
      }
      await signup({ email: email.trim(), password })
      setPassword('')
      setPassword2('')
      setMode('sent')
    } catch (err) {
      if (mode === 'login') {
        setError(loginErrorMessage(err))
        setNeedsVerify(err instanceof ApiError && err.code === 'EMAIL_VERIFICATION_REQUIRED')
      } else {
        setError(signupErrorMessage(err))
      }
    } finally {
      setPending(null)
    }
  }

  const resend = async () => {
    setPending('email')
    setError(null)
    try {
      await resendVerification(email.trim())
      setResent(true)
    } catch (err) {
      setError(resendErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  if (mode === 'sent') {
    return (
      <section className="wrap">
        <div className="login-card">
          <div>
            <h1>메일을 확인해 주세요</h1>
            <p className="login-card__sub">
              <b>{email.trim()}</b>(으)로 인증 메일을 보냈어요.
              <br />
              메일의 링크를 누르면 가입이 끝나요. 링크는 24시간 동안 쓸 수 있어요.
            </p>
          </div>
          <p className="login-card__hint">
            메일이 안 보이면 스팸함도 확인해 주세요. 이미 가입한 주소라면 메일이 가지 않을 수 있어요.
          </p>
          {resent && (
            <p className="login-card__ok" role="status">
              인증 메일을 다시 보냈어요.
            </p>
          )}
          {error && (
            <p className="login-card__error" role="alert">
              {error}
            </p>
          )}
          <div className="login-card__row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={pending !== null}>
              {pending === 'email' ? '보내는 중…' : '인증 메일 다시 받기'}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => switchMode('login')}>
              로그인하러 가기
            </button>
          </div>
        </div>
      </section>
    )
  }

  const isSignup = mode === 'signup'

  return (
    <section className="wrap">
      <div className="login-card">
        <div>
          <h1>{isSignup ? '이메일로 가입' : '로그인'}</h1>
          <p className={`login-card__sub${state?.reason === 'expired' && !isSignup ? ' is-expired' : ''}`}>
            {isSignup ? '가입하면 인증 메일을 보내드려요. 메일 인증을 마친 뒤 로그인할 수 있어요.' : subtitle}
          </p>
        </div>

        {!isSignup && (
          <>
            <div className="login-card__social">
              <button
                type="button"
                className="btn btn-social btn-kakao"
                onClick={() => startLogin('kakao')}
                disabled={pending !== null}
              >
                <KakaoIcon size={20} />
                {pending === 'kakao' ? '카카오로 이동하는 중…' : '카카오로 시작하기'}
              </button>
              <button
                type="button"
                className="btn btn-social btn-google"
                onClick={() => startLogin('google')}
                disabled={pending !== null}
              >
                <GoogleIcon size={20} />
                {pending === 'google' ? 'Google로 이동하는 중…' : 'Google로 시작하기'}
              </button>
            </div>
            <div className="login-card__or">
              <span>또는 이메일로</span>
            </div>
          </>
        )}

        <form className="login-form" onSubmit={submitEmail} noValidate>
          <label className="login-form__field">
            <span>이메일</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label className="login-form__field">
            <span>비밀번호</span>
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isSignup && <small>{PASSWORD_MIN}자 이상으로 정해 주세요.</small>}
          </label>
          {isSignup && (
            <label className="login-form__field">
              <span>비밀번호 확인</span>
              <input
                type="password"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </label>
          )}

          {error && (
            <p className="login-card__error" role="alert">
              {error}
            </p>
          )}
          {needsVerify && (
            <div className="login-card__row">
              {resent ? (
                <span className="login-card__ok" role="status">
                  인증 메일을 다시 보냈어요.
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={pending !== null}>
                  인증 메일 다시 받기
                </button>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-social" disabled={pending !== null}>
            {pending === 'email'
              ? isSignup
                ? '가입하는 중…'
                : '로그인하는 중…'
              : isSignup
                ? '가입하고 인증 메일 받기'
                : '이메일로 로그인'}
          </button>
        </form>

        <p className="login-card__switch">
          {isSignup ? (
            <>
              이미 가입했나요?{' '}
              <button type="button" onClick={() => switchMode('login')}>
                로그인
              </button>
            </>
          ) : (
            <>
              이메일 계정이 없나요?{' '}
              <button type="button" onClick={() => switchMode('signup')}>
                이메일로 가입하기
              </button>
            </>
          )}
        </p>
      </div>
    </section>
  )
}

export default LoginPage

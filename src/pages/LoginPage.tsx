import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api, ApiError } from '../api/client'
import { safeReturnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import { GoogleIcon, KakaoIcon } from '../components/icons'
import './LoginPage.css'

type LoginLocationState = { reason?: 'upload' | 'analyze' | 'reports'; returnTo?: string } | null
type SocialProvider = 'kakao' | 'google'

const SUBTITLE = {
  upload: '계약서를 올리려면 먼저 로그인해 주세요. 로그인 후 바로 파일을 선택할 수 있어요.',
  analyze: '계약서 점검은 로그인 후 이용할 수 있어요. 로그인하면 점검 결과가 내 리포트에 저장돼요.',
  reports: '로그인하면 점검한 계약서를 모아 볼 수 있어요.',
  default: '로그인하면 계약서를 점검하고, 점검 리포트를 언제든 다시 볼 수 있어요.',
}

function startErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED') return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
    if (err.code === 'OAUTH_NOT_CONFIGURED' || err.status === 503)
      return '지금은 소셜 로그인을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.'
  }
  return '로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function LoginPage() {
  const { user } = useAuth()
  const state = useLocation().state as LoginLocationState
  const returnTo = safeReturnPath(state?.returnTo)
  const subtitle = SUBTITLE[state?.reason ?? 'default']
  const [pending, setPending] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={returnTo} replace />

  const startLogin = async (provider: SocialProvider) => {
    setPending(provider)
    setError(null)
    try {
      const { authorization_url } = await api<{ authorization_url: string }>(
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

  return (
    <section className="wrap">
      <div className="login-card">
        <div>
          <h1>로그인</h1>
          <p className="login-card__sub">{subtitle}</p>
        </div>

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

        {error && (
          <p className="login-card__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

export default LoginPage

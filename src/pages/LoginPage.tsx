import { useLocation } from 'react-router'
import { GoogleIcon, KakaoIcon } from '../components/icons'
import './LoginPage.css'

type LoginLocationState = { reason?: 'upload' | 'analyze' | 'reports'; returnTo?: string } | null

const SUBTITLE = {
  upload: '계약서를 올리려면 먼저 로그인해 주세요. 로그인 후 바로 파일을 선택할 수 있어요.',
  analyze: '계약서 점검은 로그인 후 이용할 수 있어요. 로그인하면 점검 결과가 내 리포트에 저장돼요.',
  reports: '로그인하면 점검한 계약서를 모아 볼 수 있어요.',
  default: '로그인하면 계약서를 점검하고, 점검 리포트를 언제든 다시 볼 수 있어요.',
}

function LoginPage() {
  const state = useLocation().state as LoginLocationState
  // TODO: 소셜 로그인 시작 API의 return_path로 state?.returnTo 전달
  const subtitle = SUBTITLE[state?.reason ?? 'default']

  return (
    <section className="wrap">
      <div className="login-card">
        <div>
          <h1>로그인</h1>
          <p className="login-card__sub">{subtitle}</p>
        </div>

        <div className="login-card__social">
          <button type="button" className="btn btn-social btn-kakao">
            <KakaoIcon size={20} />
            카카오로 시작하기
          </button>
          <button type="button" className="btn btn-social btn-google">
            <GoogleIcon size={20} />
            Google로 시작하기
          </button>
        </div>
      </div>
    </section>
  )
}

export default LoginPage

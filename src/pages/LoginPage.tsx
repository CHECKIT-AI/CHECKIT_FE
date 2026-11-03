import { GoogleIcon, KakaoIcon } from '../components/icons'
import './LoginPage.css'

function LoginPage() {
  return (
    <section className="wrap">
      <div className="login-card">
        <div>
          <h1>로그인</h1>
          <p className="login-card__sub">
            로그인하면 점검 리포트를 저장하고 언제든 다시 볼 수 있어요.
          </p>
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

import { Link, NavLink, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { DocCheckIcon, GoogleIcon, KakaoIcon } from './icons'
import './Header.css'

const PROVIDER_LABEL = { GOOGLE: 'Google 계정', KAKAO: '카카오 계정', EMAIL: '이메일 계정' } as const

function Header() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      navigate('/')
    }
  }

  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link className="logo" to="/" aria-label="CHECKIT 홈">
          <span className="logo__mark">
            <DocCheckIcon size={19} />
          </span>
          CHECKIT
        </Link>

        <nav className="menu" aria-label="주 메뉴">
          <NavLink to="/" end>
            계약서 점검
          </NavLink>
          <NavLink to="/reports">내 리포트</NavLink>
        </nav>

        <div className="auth">
          {loading ? null : user ? (
            <>
              <span className="auth__account">
                {user.provider === 'GOOGLE' && <GoogleIcon size={18} />}
                {user.provider === 'KAKAO' && <KakaoIcon size={18} />}
                {PROVIDER_LABEL[user.provider] ?? '로그인됨'}
              </span>
              <button type="button" className="btn-mini" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-login">
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header

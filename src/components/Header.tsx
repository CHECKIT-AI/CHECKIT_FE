import { DocCheckIcon } from './icons'
import './Header.css'

function Header() {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <a className="logo" href="/" aria-label="CHECKIT 홈">
          <span className="logo__mark">
            <DocCheckIcon size={19} />
          </span>
          CHECKIT
        </a>

        <nav className="menu" aria-label="주 메뉴">
          <a href="/" aria-current="page">
            계약서 점검
          </a>
          <a href="/">내 리포트</a>
        </nav>

        <div className="auth">
          <button type="button" className="btn-login">
            로그인
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header

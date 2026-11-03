import { Link, NavLink } from 'react-router'
import { DocCheckIcon } from './icons'
import './Header.css'

function Header() {
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
          <Link to="/login" className="btn-login">
            로그인
          </Link>
        </div>
      </div>
    </header>
  )
}

export default Header

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import './AuthGate.css'

/** 이 시간보다 빨리 끝나면 아무것도 보여주지 않아 화면이 깜빡이지 않게 합니다. */
const SHOW_AFTER_MS = 300
/** 이 시간이 지나도 끝나지 않으면 '늦어지고 있어요' 안내를 덧붙입니다. */
const SLOW_AFTER_MS = 5000

/** 로그인 상태를 확인하는 동안 페이지 대신 보여줍니다. */
export function AuthLoading() {
  const [phase, setPhase] = useState<'hidden' | 'shown' | 'slow'>('hidden')

  useEffect(() => {
    const show = setTimeout(() => setPhase('shown'), SHOW_AFTER_MS)
    const slow = setTimeout(() => setPhase('slow'), SLOW_AFTER_MS)
    return () => {
      clearTimeout(show)
      clearTimeout(slow)
    }
  }, [])

  if (phase === 'hidden') return <section className="wrap auth-loading" aria-busy="true" />

  return (
    <section className="wrap auth-loading" aria-busy="true">
      <div className="auth-loading__box" role="status">
        <span className="auth-loading__spinner" aria-hidden="true" />
        <p className="auth-loading__title">로그인 상태를 확인하고 있어요</p>
        {phase === 'slow' && (
          <p className="auth-loading__sub">
            서버 응답이 늦어지고 있어요.
            <br />
            조금만 더 기다려 주세요.
          </p>
        )}
      </div>
    </section>
  )
}

/** 쓰던 중 로그인이 만료됐을 때 화면 위에 띄우는 안내 */
export function ExpiredBanner() {
  const { expired, user } = useAuth()
  const { pathname, search } = useLocation()
  if (!expired || user || pathname === '/login' || pathname.startsWith('/auth/')) return null

  // 글자 확인 화면은 고친 내용이 메모리에만 있어, 다시 로그인하면 사라진다는 점을 알려줍니다.
  const onReview = pathname === '/review'
  return (
    <div className="expired" role="alert">
      <div className="wrap expired__inner">
        <span>
          <b>로그인이 만료됐어요.</b> 다시 로그인해 주세요.
          {onReview && ' 확인 중이던 내용은 다시 올려야 해요.'}
        </span>
        <Link
          to="/login"
          state={{ reason: 'expired', returnTo: onReview ? '/' : pathname + search }}
          className="btn btn-primary btn-sm"
        >
          다시 로그인
        </Link>
      </div>
    </div>
  )
}

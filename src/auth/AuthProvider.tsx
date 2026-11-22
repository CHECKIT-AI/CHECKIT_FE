import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { emailLogin } from '../api/auth'
import { api, ApiError, resetCsrf, setUnauthorizedHandler } from '../api/client'
import type { MeResponse } from '../types/api'
import { AuthContext, type User } from './authContext'

async function fetchMe(): Promise<User | null> {
  try {
    const data = await api<MeResponse>('/api/auth/me')
    return data.user
  } catch (err) {
    // 미로그인은 401. 그 밖의 오류도 비로그인으로 처리합니다.
    if (!(err instanceof ApiError && err.status === 401)) console.warn('로그인 상태 확인 실패', err)
    return null
  }
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const userRef = useRef<User | null>(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  const signedIn = useCallback((me: User | null) => {
    setUser(me)
    if (me) setExpired(false)
  }, [])

  const refresh = useCallback(async () => {
    resetCsrf()
    const me = await fetchMe()
    signedIn(me)
    setLoading(false)
    return me
  }, [signedIn])

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      resetCsrf()
      const { user: me } = await emailLogin(email, password) // 새 CSRF 토큰은 api()가 저장
      signedIn(me)
      return me
    },
    [signedIn],
  )

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      resetCsrf()
      setUser(null)
      setExpired(false)
    }
  }, [])

  // 쓰던 중 401을 받으면 로그인이 만료된 것으로 봅니다. (로그인한 상태였을 때만)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!userRef.current) return
      resetCsrf()
      setUser(null)
      setExpired(true)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMe().then((me) => {
      if (cancelled) return
      setUser(me)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, expired, refresh, loginWithEmail, logout }),
    [user, loading, expired, refresh, loginWithEmail, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider

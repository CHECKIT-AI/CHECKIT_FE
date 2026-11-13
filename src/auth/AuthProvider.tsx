import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, resetCsrf } from '../api/client'
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

  const refresh = useCallback(async () => {
    resetCsrf()
    const me = await fetchMe()
    setUser(me)
    setLoading(false)
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      resetCsrf()
      setUser(null)
    }
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

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider

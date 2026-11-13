import { createContext } from 'react'
import type { User } from '../types/api'

export type { Provider, User } from '../types/api'

export type AuthState = {
  /** 로그인한 사용자. 비로그인이면 null */
  user: User | null
  /** 첫 로그인 상태 확인(/api/auth/me) 중이면 true */
  loading: boolean
  /** 로그인 상태를 다시 확인합니다. */
  refresh: () => Promise<User | null>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

// 로그인 상태를 한 곳에서 제공합니다.
// TODO: API 연결 시 GET /api/auth/me 결과로 대체 (미로그인 401 → user: null)

export type User = {
  id: string
  provider: 'EMAIL' | 'KAKAO' | 'GOOGLE'
}

export function useAuth(): { user: User | null } {
  return { user: null }
}

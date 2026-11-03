// 백엔드 API 공통 클라이언트
// - 개발 서버의 /api 프록시를 거쳐 같은 출처로 호출합니다(쿠키 인증).
// - 변경 요청(POST 등)에는 X-CSRF-Token 헤더를 붙입니다.
//   토큰은 로그인 상태와 묶여 있어, 403 CSRF_FAILED면 새로 받아 한 번 재시도합니다.

export class ApiError extends Error {
  status: number
  code: string
  retryable: boolean

  constructor(status: number, code: string, message: string, retryable = false) {
    super(message)
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

let csrfToken: string | null = null

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = await res.json()
    const err = data?.error
    if (err?.code) {
      return new ApiError(res.status, err.code, err.message ?? '', Boolean(err.retryable))
    }
  } catch {
    // JSON이 아닌 응답 (프록시 오류 등)
  }
  return new ApiError(res.status, 'UNKNOWN', '서버에 연결할 수 없어요.')
}

async function refreshCsrf(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'include' })
  if (!res.ok) throw await toApiError(res)
  const data: { csrf_token: string } = await res.json()
  csrfToken = data.csrf_token
  return csrfToken
}

/** 로그인·로그아웃처럼 세션이 바뀐 뒤 호출합니다. */
export function resetCsrf() {
  csrfToken = null
}

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const needsCsrf = method !== 'GET'

  const send = async () => {
    const headers: Record<string, string> = {}
    if (needsCsrf) headers['X-CSRF-Token'] = csrfToken ?? (await refreshCsrf())
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    })
  }

  let res = await send()
  if (needsCsrf && res.status === 403) {
    const err = await toApiError(res.clone())
    if (err.code === 'CSRF_FAILED') {
      csrfToken = null
      res = await send()
    }
  }
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T

  const data = await res.json()
  // 로그인 등 일부 응답은 새 CSRF 토큰을 함께 줍니다.
  if (typeof data?.csrf_token === 'string') csrfToken = data.csrf_token
  return data as T
}

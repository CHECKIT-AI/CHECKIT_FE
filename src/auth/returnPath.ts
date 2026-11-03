/** 서비스 내부 상대 경로만 허용합니다(외부 주소로의 이동 방지). */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  return value
}

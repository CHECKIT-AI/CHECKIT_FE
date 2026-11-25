// 분석 조건(기준 날짜 등)을 계약서 내용에서 미리 채웁니다.
// 백엔드는 기준 날짜(effective_date)의 연도로 최저임금을 비교하고, 그 날짜에 시행 중인 법령만 근거로 씁니다.
// 날짜가 없거나 2026년이 아니면 일부 판단이 '확인 필요'로 보류됩니다. (CHECKIT_BE app/analysis_rules.py)

export const SUPPORTED_YEAR = 2026

/**
 * 법령 자료(CHECKIT_DATA employment_basic_v004)의 근로기준법 시행일.
 * 백엔드는 근거 법령의 시행일이 기준 날짜보다 늦으면 근거를 버리고 판단을 보류합니다.
 * 자료에는 조문마다가 아니라 법령 개정일로 일괄 저장돼 있어, 이보다 이른 기준 날짜는 대부분 보류됩니다.
 * TODO: 법령 자료의 조문별 시행일이 바로잡히면 이 값과 경고를 없앱니다.
 */
export const LAW_DATA_DATE = '2026-10-08'

/** 오늘 날짜 'YYYY-MM-DD' (사용자 컴퓨터 기준) */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const DATE_RE = /(20\d{2})\s*(?:년|[.\-/])\s*(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*일?/g
/** 근로를 시작하는 날을 나타내는 말 */
const START_WORDS = /근로\s*개시|근로\s*시작|근무\s*시작|입사|시작일|계약\s*기간|근로\s*계약\s*기간/
/** 계약을 쓴 날을 나타내는 말 */
const SIGN_WORDS = /작성|체결|계약일|서명/

export type DateGuess = {
  /** 'YYYY-MM-DD' */
  value: string
  /** 날짜를 찾은 줄 (화면에 근거로 보여줌) */
  line: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 계약서에서 기준 날짜를 고릅니다.
 * 근로 시작일(근로개시일·계약기간 ~부터) > 작성일 > 처음 나온 날짜 순으로 고릅니다.
 */
export function guessEffectiveDate(text: string): DateGuess | null {
  let best: (DateGuess & { score: number; at: number }) | null = null
  for (const m of text.matchAll(DATE_RE)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const date = new Date(y, mo - 1, d)
    if (date.getMonth() !== mo - 1 || date.getDate() !== d) continue // 없는 날짜
    const at = m.index ?? 0
    const lineStart = text.lastIndexOf('\n', at - 1) + 1
    const lineEnd = text.indexOf('\n', at)
    const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim()
    const before = text.slice(lineStart, at)
    const after = text.slice(at + m[0].length, at + m[0].length + 4)
    const score = START_WORDS.test(before) || /^\s*부터/.test(after) ? 2 : SIGN_WORDS.test(line) ? 1 : 0
    if (!best || score > best.score) best = { value: `${y}-${pad(mo)}-${pad(d)}`, line, score, at }
  }
  return best ? { value: best.value, line: best.line } : null
}

// 백엔드 분석 결과(CheckItem·Citation)를 리포트 화면용으로 바꾸는 함수 모음
// 결과 구조가 확정되면 주로 이 파일을 고칩니다.

import type { CheckCategory, CheckItem, CheckStatus, Citation, TextPageRange } from '../types/api'

export type Tone = 'red' | 'amber' | 'blue' | 'green' | 'gray'

/** 화면 묶음 */
export type GroupKey = 'LEGAL_RISK' | 'DISADVANTAGE' | 'MISSING' | 'PRESENT'

export const GROUPS: { key: GroupKey; label: string; tone: Tone; empty: string }[] = [
  { key: 'LEGAL_RISK', label: '위험 조항', tone: 'red', empty: '발견된 위험 조항이 없어요.' },
  { key: 'DISADVANTAGE', label: '불리한 조건', tone: 'blue', empty: '발견된 불리한 조건이 없어요.' },
  { key: 'MISSING', label: '필수 기재사항 확인', tone: 'amber', empty: '확인할 필수 기재사항이 없어요.' },
  { key: 'PRESENT', label: '계약서에 적혀 있음', tone: 'green', empty: '' },
]

export const CATEGORY_LABEL: Record<CheckCategory, string> = {
  LEGAL_RISK: '위험 조항',
  DISADVANTAGE: '불리한 조건',
  MISSING: '필수 기재사항',
}

export const STATUS_META: Record<CheckStatus, { label: string; tone: Tone }> = {
  CAUTION: { label: '주의', tone: 'red' },
  MISSING_SUSPECTED: { label: '누락 의심', tone: 'amber' },
  NEEDS_CONFIRMATION: { label: '확인 필요', tone: 'gray' },
  PRESENT: { label: '있음', tone: 'green' },
}

/** 백엔드 규칙 코드(check_code) → 화면 제목. 기준: CHECKIT_BE app/analysis_rules.py */
const CHECK_TITLE: Record<string, string> = {
  MISSING_WAGE_COMPONENTS: '임금 구성 항목',
  MISSING_WAGE_CALCULATION: '임금 계산 방법',
  MISSING_WAGE_PAYMENT: '임금 지급 방법',
  MISSING_SCHEDULED_HOURS: '소정근로시간',
  MISSING_HOLIDAY: '휴일',
  MISSING_ANNUAL_LEAVE: '연차 유급휴가',
  MISSING_WORKPLACE: '근무 장소',
  MISSING_DUTIES: '종사할 업무',
  PRESET_PENALTY: '위약금·손해배상 예정',
  MINIMUM_WAGE: '최저임금 미달 가능성',
  MINIMUM_WAGE_MONTHLY: '월급 기준 최저임금 미달 가능성',
  OVERTIME_PREMIUM: '가산수당 배제',
  INSUFFICIENT_BREAK: '휴게시간 부족',
  UNILATERAL_CHANGE: '일방적인 근로조건 변경',
  BROAD_LIABILITY: '과도한 손해 책임',
  POST_EMPLOYMENT_RESTRICTION: '퇴사 후 취업 제한',
}

export function categoryOf(item: CheckItem): CheckCategory {
  const c = item.rule_candidate?.category
  return c === 'LEGAL_RISK' || c === 'DISADVANTAGE' || c === 'MISSING' ? c : 'LEGAL_RISK'
}

/** Gemini가 규칙 목록에 없는 문제를 새로 찾은 항목인지 */
export function isDiscovered(item: CheckItem) {
  return item.rule_candidate?.source === 'GEMINI' || item.check_code.startsWith('DISCOVERED_')
}

/**
 * 필수 기재사항이 계약서에 적혀 있는지.
 * 백엔드(2026-11-14 e21057d)는 문구를 찾아도 내용이 충분한지는 단정하지 않아
 * status를 NEEDS_CONFIRMATION, document_presence를 PRESENT로 보냅니다. 예전 결과는 status가 PRESENT입니다.
 */
export function isWritten(item: CheckItem) {
  if (item.status === 'PRESENT') return true
  return categoryOf(item) === 'MISSING' && item.document_presence === 'PRESENT' && item.status === 'NEEDS_CONFIRMATION'
}

export function groupOf(item: CheckItem): GroupKey {
  return isWritten(item) ? 'PRESENT' : categoryOf(item)
}

/** 화면에 표시할 상태 태그. 적혀 있는 필수 기재사항은 '확인 필요' 대신 '적혀 있음'으로 보여줍니다. */
export function statusMetaOf(item: CheckItem): { label: string; tone: Tone } {
  return isWritten(item) ? { label: '적혀 있음', tone: 'green' } : STATUS_META[item.status]
}

export function titleOf(item: CheckItem) {
  const known = CHECK_TITLE[item.check_code]
  if (known) return known
  const info = item.required_information[0] ?? item.rule_candidate?.required_information?.[0]
  if (isDiscovered(item)) {
    const topic = item.labels[0] ?? info
    return topic ? `${topic} 관련 확인 사항` : '추가로 발견된 확인 사항'
  }
  return info ?? item.labels[0] ?? '점검 항목'
}

/** 같은 법령 조문(chunk_id)이 여러 번 인용되므로 항목별로 한 번씩만 남깁니다. */
export function citationsFor(citations: Citation[], itemId: string) {
  const seen = new Set<string>()
  return citations.filter((c) => {
    if (c.check_item_id !== itemId || seen.has(c.chunk_id)) return false
    seen.add(c.chunk_id)
    return true
  })
}

/** 원문에서 인용 문구 위치를 찾습니다. 백엔드가 글자 위치를 주지 않아 문자열로 찾습니다. */
export function findQuote(content: string, quote: string | null): { start: number; end: number } | null {
  if (!quote) return null
  const exact = content.indexOf(quote)
  if (exact >= 0) return { start: exact, end: exact + quote.length }
  // 줄바꿈·공백 차이가 있을 수 있어 앞부분으로 한 번 더 찾습니다.
  const head = quote.trim().slice(0, 20)
  const at = head ? content.indexOf(head) : -1
  return at >= 0 ? { start: at, end: Math.min(content.length, at + quote.trim().length) } : null
}

/** text.blocks가 페이지 범위({page,start,end})면 그대로, 아니면 전체를 1쪽으로 봅니다. */
export function pageRanges(content: string, blocks: unknown[]): TextPageRange[] {
  const ranges = blocks.filter(
    (b): b is TextPageRange =>
      typeof b === 'object' && b !== null && 'page' in b && 'start' in b && 'end' in b,
  )
  return ranges.length ? ranges : [{ page: 1, start: 0, end: content.length }]
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

export function formatDateTime(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(iso)} ${hh}:${mm}`
}

/** 화면 상단·내 리포트 카드에서 쓰는 묶음별 개수 */
export function groupCounts(items: CheckItem[]): Record<GroupKey, number> {
  const counts: Record<GroupKey, number> = { LEGAL_RISK: 0, DISADVANTAGE: 0, MISSING: 0, PRESENT: 0 }
  for (const it of items) counts[groupOf(it)] += 1
  return counts
}

/* ───────── 판단 보류 문구 ───────── */

/**
 * 백엔드가 Gemini 판단을 막을 때 설명 앞에 붙이거나 덮어쓰는 고정 문구.
 * 기준: CHECKIT_BE app/analysis_jobs.py, app/analysis_llm.py (2026-11-13)
 * TODO: 백엔드에 보류 이유 코드(예: hold_reason)가 생기면 문구 대신 코드로 판단합니다.
 */
const HOLD_PHRASES = [
  '적용 시점과 법령 근거를 검증할 수 없어 판단을 보류합니다.',
  '법령 인용을 검증할 수 없어 추가 판단을 보류합니다.',
  '법령 인용을 검증할 수 없어 판단을 보류합니다.',
]

export type Explanation = {
  /** 백엔드가 판단을 보류했는지 */
  held: boolean
  /** 화면에 보여줄 설명. 보류 문구는 빼고, 남는 설명이 없으면 규칙의 설명으로 채웁니다. */
  text: string
}

function stripHold(raw: string) {
  let text = raw
  let held = false
  for (const phrase of HOLD_PHRASES) {
    if (text.includes(phrase)) {
      held = true
      text = text.split(phrase).join(' ')
    }
  }
  return { held, text: text.replace(/\s+/g, ' ').trim() }
}

export function explanationOf(item: CheckItem): Explanation {
  const own = stripHold(item.explanation)
  if (own.text || !own.held) return own
  // 보류 문구만 있으면 규칙이 처음 만든 설명(무엇을 확인해야 하는지)을 보여줍니다.
  return { held: true, text: stripHold(item.rule_candidate?.explanation ?? '').text }
}

/** 이 길이를 넘는 인용 문구는 접어서 보여줍니다. */
export const LONG_QUOTE = 120

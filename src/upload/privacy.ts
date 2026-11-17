// 확인한 계약서 텍스트에서 개인정보를 찾아 가립니다. 브라우저 안에서만 처리합니다.
//
// - 백엔드(CHECKIT_BE app/privacy.py)는 주민등록번호·휴대전화·이메일이 남아 있으면 저장을 거부(422)합니다.
//   이 셋은 '꼭 가려야 하는 정보'로, 백엔드보다 넓게 찾고 사용자가 풀 수 없게 합니다.
// - 이름·주소·계좌번호 등은 백엔드가 검사하지 않으므로 여기서 찾습니다. 규칙 기반이라 놓칠 수 있어
//   사용자가 마지막에 직접 확인하고 더 가릴 수 있게 합니다.
// - 금액·날짜·근무시간은 점검에 필요하므로 가리지 않습니다. (생년월일만 예외)
// - 주소는 근로자 본인 주소의 상세 부분만 가립니다. (시·도, 시·군·구는 남김. 근무장소·사업주 주소는 그대로)

export type MaskKind = 'RRN' | 'PHONE' | 'EMAIL' | 'ACCOUNT' | 'BIZ' | 'NAME' | 'ADDRESS' | 'BIRTH' | 'MANUAL'

export const MASK_LABEL: Record<MaskKind, string> = {
  RRN: '주민등록번호',
  PHONE: '전화번호',
  EMAIL: '이메일',
  ACCOUNT: '계좌번호',
  BIZ: '사업자등록번호',
  NAME: '이름',
  ADDRESS: '상세주소',
  BIRTH: '생년월일',
  MANUAL: '가림',
}

/** 백엔드가 거부하는 정보. 화면에서 가림을 풀 수 없습니다. */
export const REQUIRED_KINDS: readonly MaskKind[] = ['RRN', 'PHONE', 'EMAIL']

/** 백엔드가 받는 전체 글자 수(페이지를 줄바꿈으로 이은 길이). app/analysis.py MAX_DOCUMENT_LENGTH */
export const MAX_DOCUMENT_CHARS = 30000

export type PageText = { page: number; text: string }

export type Mask = {
  id: string
  page: number
  /** page 텍스트 기준 글자 위치 [start, end) */
  start: number
  end: number
  kind: MaskKind
  /** 지금 가리고 있는지 (자동으로 찾은 것을 사용자가 풀 수 있음) */
  on: boolean
  /** 자동으로 찾았는지, 사용자가 직접 가렸는지 */
  auto: boolean
}

export const maskToken = (kind: MaskKind) => `[${MASK_LABEL[kind]}]`

/* ───────── 찾기 규칙 ───────── */

type Rule = {
  kind: MaskKind
  re: RegExp
  /** 이 그룹만 가립니다. 없으면 전체 */
  group?: number
  /** 찾은 글자(value)와 위치(text, start)를 보고 가릴지 정합니다. */
  accept?: (value: string, text: string, start: number) => boolean
}

const digits = (s: string) => s.replace(/\D/g, '').length

/** 이름 자리에 잘못 걸리기 쉬운 낱말 */
const NAME_STOP = [
  '서명', '날인', '인', '주소', '연락처', '전화', '휴대', '생년월일', '성명', '이름', '근로자', '사업주', '사용자',
  '대표', '귀하', '본인', '없음', '기재', '작성', '확인', '서명란', '주민', '사업장', '상호', '회사',
]
const looksLikeName = (s: string) => {
  const v = s.replace(/\s/g, '')
  return v.length >= 2 && v.length <= 4 && !NAME_STOP.some((w) => v.startsWith(w))
}

/* ── 주소 ── */

const SIDO = [
  '서울특별시', '서울시', '서울', '부산광역시', '부산시', '부산', '대구광역시', '대구시', '대구', '인천광역시', '인천시', '인천',
  '광주광역시', '광주시', '광주', '대전광역시', '대전시', '대전', '울산광역시', '울산시', '울산', '세종특별자치시', '세종시', '세종',
  '경기도', '경기', '강원특별자치도', '강원도', '강원', '충청북도', '충북', '충청남도', '충남', '전북특별자치도', '전라북도', '전북',
  '전라남도', '전남', '경상북도', '경북', '경상남도', '경남', '제주특별자치도', '제주도', '제주',
].join('|')
/** 번지·건물번호 (날짜·금액·시간 숫자는 제외) */
const NUM = String.raw`\d+(?:-\d+)?(?![0-9]*\s*(?:년|월|일|시|분|원|만|개월|명|%))`
/** 동·호·층, 건물 이름, (연희동) 같은 참고항목 */
const UNIT = String.raw`(?:\s*,?\s*(?:[가-힣A-Za-z0-9]+(?:아파트|빌라|빌딩|타워|맨션|오피스텔|하이츠|주택|상가))?\s*(?:[A-Za-z]?\d+\s*(?:동|호|층)\s*)+)?(?:\s*\([가-힣0-9,\s]{1,20}\))?`
/** 상세 주소: 도로명(…로 12, …로 12길 34) 또는 지번(…동/리 123-4) + 동·호·층 */
const DETAIL = String.raw`(?:[가-힣0-9·]+(?:로|길)(?:\s*\d+(?:번)?길)?\s*${NUM}|[가-힣0-9]+(?:동|리|가)\s*(?:산\s*)?${NUM}(?:\s*번지)?)${UNIT}`
const ADDRESS_WITH_SIDO = new RegExp(String.raw`(?<![가-힣])(?:${SIDO})(?:\s*[가-힣]{1,5}(?:시|군|구)){0,2}\s*(${DETAIL})`, 'g')
const ADDRESS_WITH_GU = new RegExp(String.raw`(?<![가-힣])[가-힣]{1,5}(?:구|군)\s+(${DETAIL})`, 'g')

/** 같은 줄에 이 말이 있으면 근무장소·사업장 주소로 봅니다. */
const WORKPLACE = /근무\s*장소|근무지|취업\s*장소|근로\s*장소|사업장|소재지|본점|사무소/
/** 사업주 쪽 표시: '(사업주)', '사용자:', '회사 주소' 등 */
const EMPLOYER_MARK =
  /^\s*[([〔<]?\s*(?:사업주|사용자|고용주|갑|회사|사업체|대표자|대표)\s*[)\]〕>]?(?![가-힣])|(?:사업주|사용자|회사|대표자)\s*(?:의\s*)?(?:주소|소재지)/
/** 근로자 쪽 표시: '(근로자)', '을:', '근로자 주소' 등 */
const EMPLOYEE_MARK = /^\s*[([〔<]?\s*(?:근로자|을|피고용인)\s*[)\]〕>]?(?![가-힣])|근로자\s*(?:의\s*)?(?:주소|거주지)/

/**
 * 근로자 본인 주소인지. 근무장소·사업주 주소면 false.
 * 같은 줄 앞부분부터 위로 5줄까지 가장 가까운 '(사업주)'·'(근로자)' 표시를 봅니다.
 * 알 수 없으면 true(가림)로 둡니다. 사용자가 눌러서 풀 수 있습니다.
 */
function isMyAddress(_value: string, text: string, start: number) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  if (WORKPLACE.test(text.slice(lineStart, start))) return false
  const lines = text.slice(0, start).split('\n').slice(-6).reverse()
  for (const line of lines) {
    if (EMPLOYEE_MARK.test(line)) return true
    if (EMPLOYER_MARK.test(line)) return false
  }
  return true
}

// 순서가 중요합니다. 앞 규칙이 찾은 자리와 겹치면 뒤 규칙은 건너뜁니다.
const RULES: Rule[] = [
  // 주민등록번호·외국인등록번호 (뒷자리를 * 등으로 일부 가린 것도 생년월일이 드러나므로 가림)
  { kind: 'RRN', re: /(?<![0-9])\d{6}\s*-?\s*[1-8](?:\d{6}|[*xX●○]{6})(?![0-9])/g },
  // 휴대전화 (백엔드 규칙보다 넓게)
  { kind: 'PHONE', re: /(?<![0-9])01[016789]\s*[-.]?\s*\d{3,4}\s*[-.]?\s*\d{4}(?![0-9])/g },
  // 일반전화·인터넷전화 (금액과 헷갈리지 않게 구분 기호가 있는 것만)
  { kind: 'PHONE', re: /(?<![0-9])(?:0(?:2|[3-6][1-5])|070)\s*[-.)]\s*\d{3,4}\s*[-.]\s*\d{4}(?![0-9])/g },
  { kind: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'BIZ', re: /(?<![0-9-])\d{3}-\d{2}-\d{5}(?![0-9-])/g },
  // 계좌번호: '계좌·통장' 뒤의 숫자
  {
    kind: 'ACCOUNT',
    re: /(?:계좌(?:번호)?|통장(?:번호)?)\s*[:：]?\s*(?:[가-힣A-Za-z]{1,10}\s*)?([0-9][0-9\- ]{6,}[0-9])/g,
    group: 1,
    accept: (s) => digits(s) >= 8,
  },
  // 계좌번호: 하이픈으로 나뉜 긴 숫자 (날짜 2026-12-01 같은 짧은 것은 제외)
  { kind: 'ACCOUNT', re: /(?<![0-9-])\d{2,6}(?:-\d{2,7}){2,3}(?![0-9-])/g, accept: (s) => digits(s) >= 10 },
  { kind: 'BIRTH', re: /(?:생년월일|생일)\s*[:：]?\s*(\d{2,4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?|\d{6}(?![0-9]))/g, group: 1 },
  // 주소: 시·도로 시작하는 주소 → 시·군·구 뒤 상세 주소만
  { kind: 'ADDRESS', re: ADDRESS_WITH_SIDO, group: 1, accept: isMyAddress },
  // 주소: 시·도 없이 '○○구 ○○로 12' → 상세 주소만
  { kind: 'ADDRESS', re: ADDRESS_WITH_GU, group: 1, accept: isMyAddress },
  // 주소: 형식은 달라도 '주소:' 이름표가 붙은 근로자 주소는 통째로
  {
    kind: 'ADDRESS',
    re: /(?:현\s*)?(?:주\s*소|거\s*주\s*지)\s*[:：]\s*([^\n]+?)(?=\s*(?:\(|연락처|전화|휴대|☎|TEL|Tel|$))/gm,
    group: 1,
    accept: (v, text, start) => v.trim().length >= 4 && isMyAddress(v, text, start),
  },
  // 이름: '성명:', '이름 홍길동'
  {
    kind: 'NAME',
    re: /(?:성\s*명|이\s*름)\s*[:：]?\s*([가-힣](?:\s?[가-힣]){1,3})(?![가-힣])/g,
    group: 1,
    accept: looksLikeName,
  },
  // 이름: '근로자: 홍길동', '대표자: 홍길동' (콜론이 있을 때만)
  {
    kind: 'NAME',
    re: /(?:근로자|사업주|사용자|고용주|대표자|대표이사|대\s*표|갑|을)\s*(?:\(\s*[갑을]\s*\))?\s*[:：]\s*([가-힣](?:\s?[가-힣]){1,3})(?![가-힣])/g,
    group: 1,
    accept: looksLikeName,
  },
  // 이름: '홍길동(이하 "근로자")'
  {
    kind: 'NAME',
    re: /([가-힣]{2,4})\s*\(\s*이하\s*["“”'‘’「]?\s*(?:근로자|을)/g,
    group: 1,
    accept: looksLikeName,
  },
]

let nextId = 1
const newId = () => `m${nextId++}`

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end

/** 자동으로 개인정보를 찾습니다. */
export function detectMasks(pages: PageText[]): Mask[] {
  const found: Mask[] = []
  for (const { page, text } of pages) {
    const taken: Mask[] = []
    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        const value = rule.group ? m[rule.group] : m[0]
        if (value == null || m.index == null) continue
        const offset = rule.group ? m[0].indexOf(value) : 0
        let start = m.index + offset
        let end = start + value.length
        // 앞뒤 공백은 가리지 않습니다.
        while (start < end && /\s/.test(text[start])) start++
        while (end > start && /\s/.test(text[end - 1])) end--
        if (start >= end || (rule.accept && !rule.accept(text.slice(start, end), text, start))) continue
        const mask: Mask = { id: newId(), page, start, end, kind: rule.kind, on: true, auto: true }
        if (taken.some((t) => overlaps(t, mask))) continue
        taken.push(mask)
      }
    }
    found.push(...taken)
  }

  // 찾은 이름이 다른 곳(서명란 등)에 또 나오면 함께 가립니다.
  const names = new Set(
    found.filter((m) => m.kind === 'NAME').map((m) => pageOf(pages, m.page).slice(m.start, m.end)),
  )
  for (const name of names) found.push(...findAll(pages, name, 'NAME', true, found))
  return sortMasks(found)
}

const pageOf = (pages: PageText[], page: number) => pages.find((p) => p.page === page)?.text ?? ''

/** 모든 페이지에서 같은 글자를 찾아 가림 목록을 만듭니다. 이미 가린 자리와 겹치면 건너뜁니다. */
export function findAll(pages: PageText[], word: string, kind: MaskKind, auto: boolean, existing: Mask[]): Mask[] {
  const w = word.trim()
  if (w.length < 2) return []
  const out: Mask[] = []
  for (const { page, text } of pages) {
    let at = text.indexOf(w)
    while (at >= 0) {
      const mask: Mask = { id: newId(), page, start: at, end: at + w.length, kind, on: true, auto }
      if (![...existing, ...out].some((t) => t.page === page && overlaps(t, mask))) out.push(mask)
      at = text.indexOf(w, at + w.length)
    }
  }
  return out
}

/** 사용자가 고른 범위를 가립니다. 겹치는 가림은 하나로 합칩니다. */
export function addManualMask(masks: Mask[], page: number, start: number, end: number): Mask[] {
  const hit = masks.filter((m) => m.page === page && overlaps(m, { start, end }))
  // 꼭 가려야 하는 정보와 겹치면 그 가림은 그대로 두고 범위만 넓힙니다.
  const s = Math.min(start, ...hit.map((m) => m.start))
  const e = Math.max(end, ...hit.map((m) => m.end))
  const required = hit.find((m) => REQUIRED_KINDS.includes(m.kind))
  const merged: Mask = {
    id: newId(),
    page,
    start: s,
    end: e,
    kind: required ? required.kind : hit.length === 1 && hit[0].start === s && hit[0].end === e ? hit[0].kind : 'MANUAL',
    on: true,
    auto: false,
  }
  return sortMasks([...masks.filter((m) => !hit.includes(m)), merged])
}

export function sortMasks(masks: Mask[]) {
  return [...masks].sort((a, b) => a.page - b.page || a.start - b.start)
}

/** 가림을 적용한 페이지 텍스트 */
export function applyMasks(pages: PageText[], masks: Mask[]): PageText[] {
  return pages.map(({ page, text }) => {
    const mine = masks.filter((m) => m.page === page && m.on).sort((a, b) => a.start - b.start)
    let out = ''
    let at = 0
    for (const m of mine) {
      if (m.start < at) continue
      out += text.slice(at, m.start) + maskToken(m.kind)
      at = m.end
    }
    return { page, text: (out + text.slice(at)).trim() }
  })
}

/**
 * 백엔드 app/privacy.py 의 DIRECT_IDENTIFIER와 같은 검사.
 * JS의 \b는 영문·숫자 기준이라 파이썬(한글도 글자로 봄)보다 넓게 걸립니다. 넓게 걸리는 쪽이 안전합니다.
 */
const DIRECT_IDENTIFIER =
  /\b\d{6}\s*[-]?\s*[1-8]\d{6}\b|\b01[016789]\s*[-.]?\s*\d{3,4}\s*[-.]?\s*\d{4}\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/

export function hasDirectIdentifier(text: string) {
  return DIRECT_IDENTIFIER.test(text)
}

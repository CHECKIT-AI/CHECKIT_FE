// 화면 확인용 예시 점검 결과입니다. API 연결 시 GET /api/contracts/{id} 응답으로 대체합니다.
import type { LawCitation, Report } from '../types/report'

const lawUrl = (law: string, article: string) =>
  'https://www.law.go.kr/' + encodeURI(`법령/${law}/${article}`)

const LAWS = {
  p17: {
    law_name: '근로기준법',
    article_number: '제17조',
    article_title: '근로조건의 명시',
    content:
      '사용자는 근로계약을 체결할 때에 근로자에게 임금, 소정근로시간, 휴일, 연차 유급휴가, 그 밖에 대통령령으로 정하는 근로조건을 명시하여야 한다. (요지)',
    source_url: lawUrl('근로기준법', '제17조'),
  },
  d8: {
    law_name: '근로기준법 시행령',
    article_number: '제8조',
    article_title: '명시하여야 할 근로조건',
    content: '취업의 장소와 종사하여야 할 업무에 관한 사항 등을 명시하여야 한다. (요지)',
    source_url: lawUrl('근로기준법시행령', '제8조'),
  },
  p20: {
    law_name: '근로기준법',
    article_number: '제20조',
    article_title: '위약 예정의 금지',
    content: '사용자는 근로계약 불이행에 대한 위약금 또는 손해배상액을 예정하는 계약을 체결하지 못한다.',
    source_url: lawUrl('근로기준법', '제20조'),
  },
  p43: {
    law_name: '근로기준법',
    article_number: '제43조',
    article_title: '임금 지급',
    content:
      '임금은 통화로 직접 근로자에게 그 전액을 지급하여야 한다. 다만, 법령 또는 단체협약에 특별한 규정이 있는 경우에는 임금의 일부를 공제할 수 있다. (요지)',
    source_url: lawUrl('근로기준법', '제43조'),
  },
} satisfies Record<string, LawCitation>

export const SAMPLE_REPORT: Report = {
  id: 'sample-1',
  title: 'OO카페 근로계약서',
  checked_at: '2026-11-01T14:05:00',
  clauses: [
    { clause_id: 'c0', number: null, title: '', text: '근 로 계 약 서\n사업주 OO카페(대표 김OO)와 근로자는 다음과 같이 근로계약을 체결한다.' },
    { clause_id: 'c1', number: '제1조', title: '계약기간', text: '계약기간은 2026년 11월 1일부터 2027년 4월 30일까지로 한다.' },
    { clause_id: 'c2', number: '제2조', title: '근무 장소 및 업무', text: '근무 장소는 OO카페 OO점으로 하며, 음료 제조 및 매장 관리 업무를 수행한다.' },
    { clause_id: 'c3', number: '제3조', title: '임금', text: '시급은 10,500원으로 하며, 매월 10일 근로자 명의의 계좌로 지급한다.' },
    { clause_id: 'c4', number: '제4조', title: '근무시간', text: '근무시간은 주 4일, 18:00~22:00로 하며 휴게시간은 30분으로 한다. 업무 상황에 따라 근무시간이 변경될 수 있다.' },
    { clause_id: 'c5', number: '제5조', title: '연차유급휴가', text: '연차유급휴가는 관련 법령에 따른다.' },
    { clause_id: 'c6', number: '제6조', title: '임금 공제', text: '근로자의 실수로 발생한 매장 손실은 다음 달 임금에서 공제한다.' },
    { clause_id: 'c7', number: '제7조', title: '손해배상', text: '근로자가 계약기간 중 퇴사할 경우 위약금 50만 원을 지급한다.' },
    { clause_id: 'c8', number: '제8조', title: '기타', text: '이 계약에 정하지 않은 사항은 근로기준법에 따른다.' },
  ],
  items: [
    {
      id: 'r1',
      kind: 'RISK',
      severity: 'VIOLATION',
      category: '위약금',
      title: '퇴사 시 위약금을 미리 정한 조항',
      clause_id: 'c7',
      explanation:
        '일을 그만둘 때 낼 돈을 미리 정해두는 조항이에요. 근로계약을 지키지 않았을 때의 위약금이나 손해배상액을 미리 정하는 계약은 법으로 금지돼 있어요.',
      citation: LAWS.p20,
      requirements: ['근로계약 불이행(계약기간 중 퇴사)에 관한 약정', '금액을 미리 정함'],
      question: '중도 퇴사 위약금 조항은 빼 주실 수 있나요?',
    },
    {
      id: 'r2',
      kind: 'RISK',
      severity: 'UNFAVORABLE',
      category: '임금',
      title: '손실을 임금에서 공제하는 조항',
      clause_id: 'c6',
      explanation:
        '임금은 원칙적으로 전액을 지급해야 해요. 법령이나 단체협약에 근거 없이 매장 손실을 일방적으로 임금에서 빼는 조항은 근로자에게 불리할 수 있어요.',
      citation: LAWS.p43,
      requirements: ['임금에서 일부를 공제함', '법령·단체협약상 근거가 계약서에 없음'],
      question: '매장 손실을 임금에서 빼는 기준과 근거가 무엇인가요?',
    },
    {
      id: 'r3',
      kind: 'RISK',
      severity: 'UNCLEAR',
      category: '근로시간',
      title: '근무시간 변경 기준이 없는 조항',
      clause_id: 'c4',
      explanation:
        '위법이라고 단정할 수는 없지만, 근무시간이 언제·얼마나 바뀔 수 있는지와 미리 알려주는 방법이 정해져 있지 않아요.',
      citation: null,
      question: '근무시간이 바뀌면 며칠 전에, 어떻게 알려주시나요?',
    },
    {
      id: 'q1',
      kind: 'REQUIRED',
      status: 'PRESENT',
      title: '임금',
      clause_id: 'c3',
      explanation: '제3조에서 임금 관련 내용을 확인했어요.',
      citation: LAWS.p17,
    },
    {
      id: 'q2',
      kind: 'REQUIRED',
      status: 'PRESENT',
      title: '소정근로시간',
      clause_id: 'c4',
      explanation: '제4조에서 소정근로시간 관련 내용을 확인했어요.',
      citation: LAWS.p17,
    },
    {
      id: 'q3',
      kind: 'REQUIRED',
      status: 'MISSING_SUSPECTED',
      title: '휴일',
      clause_id: null,
      explanation:
        '휴일 관련 조항을 계약서 전체에서 찾지 못했어요. 계약서에 꼭 적어야 하는 근로조건이에요. 다른 표현으로 적혀 있는지 원문을 한 번 더 확인해 보세요.',
      citation: LAWS.p17,
      question: '휴일 관련 내용을 계약서에 적어 주실 수 있나요?',
    },
    {
      id: 'q4',
      kind: 'REQUIRED',
      status: 'NEEDS_CONFIRMATION',
      title: '연차유급휴가',
      clause_id: 'c5',
      explanation:
        '연차유급휴가 조항은 있지만 "관련 법령에 따른다"고만 적혀 있어요. 실제로 언제부터, 며칠을 받을 수 있는지 확인해 보세요.',
      citation: LAWS.p17,
      question: '연차휴가는 언제부터, 어떻게 사용할 수 있나요?',
    },
    {
      id: 'q5',
      kind: 'REQUIRED',
      status: 'PRESENT',
      title: '근무 장소 · 업무 내용',
      clause_id: 'c2',
      explanation: '제2조에서 근무 장소 · 업무 내용 관련 내용을 확인했어요.',
      citation: LAWS.d8,
    },
  ],
}

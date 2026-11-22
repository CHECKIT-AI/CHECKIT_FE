// 계약서 API
import type {
  ContractDetailResponse,
  ContractListResponse,
  CreateContractRequest,
  CreateContractResponse,
} from '../types/api'
import { api, ApiError } from './client'

/** 내 계약서 목록 — GET /api/contracts (최신순은 화면에서 정렬) */
export function listContracts({ limit = 100, offset = 0 } = {}) {
  return api<ContractListResponse>(`/api/contracts?limit=${limit}&offset=${offset}`)
}

/** 계약서 상세(원문·현재 분석 결과) — GET /api/contracts/{contract_id}. 남의 계약서·없는 계약서는 404 */
export function getContract(contractId: string) {
  return api<ContractDetailResponse>(`/api/contracts/${encodeURIComponent(contractId)}`)
}

/**
 * 내 계약서 기록 삭제 — DELETE /api/contracts/{contract_id}
 * 계약서·확정 텍스트·분석 작업·결과가 영구 삭제되어 복구할 수 없습니다.
 * 반드시 사용자에게 확인을 받은 뒤 호출합니다. 이미 삭제됐으면 404 CONTRACT_NOT_FOUND.
 */
export function deleteContract(contractId: string) {
  return api<void>(`/api/contracts/${encodeURIComponent(contractId)}`, { method: 'DELETE' })
}

/**
 * 화면에서 쓰는 삭제. 예시 리포트(sample-*)는 서버에 없으므로 API를 부르지 않고,
 * 이미 지워진 기록(404)은 삭제된 것으로 봅니다.
 */
export async function removeContract(contractId: string) {
  if (contractId.startsWith('sample-')) return
  try {
    await deleteContract(contractId)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return
    throw err
  }
}

/** 삭제 실패를 사용자에게 보여줄 문구로 바꿉니다. */
export function deleteErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED') return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
    if (err.status === 401) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.'
  }
  return '삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 확인·개인정보 가리기를 마친 텍스트 저장 — POST /api/contracts
 * 공용 DB에 계약서 기록이 생깁니다. 원본 파일은 보내지 않습니다.
 */
export function createContract(body: CreateContractRequest) {
  return api<CreateContractResponse>('/api/contracts', { method: 'POST', body })
}

/** 저장 실패를 사용자에게 보여줄 문구로 바꿉니다. 줄바꿈(\n)으로 한 줄씩 보여줍니다. */
export function saveErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return '저장하지 못했어요.\n인터넷 연결을 확인하고 다시 시도해 주세요.'
  switch (e.code) {
    case 'PERSONAL_DATA_DETECTED':
      return '주민등록번호·휴대전화 번호·이메일로 보이는 글자가 남아 있어요.\n미리보기에서 찾아 드래그해서 가려 주세요.'
    case 'ANALYSIS_INPUT_LIMIT':
      return '계약서가 너무 길거나 조항이 너무 많아요.\n글자 확인 단계로 돌아가 점검에 필요 없는 부분을 지워 주세요.'
    case 'INVALID_INPUT':
      return '보낼 내용의 형식이 올바르지 않아요.\n글자 확인 단계로 돌아가 빈 페이지가 없는지 확인해 주세요.'
    case 'REQUEST_TOO_LARGE':
      return '계약서 내용이 너무 커요.\n점검에 필요 없는 부분을 지우고 다시 시도해 주세요.'
    case 'RATE_LIMITED':
      return '저장 요청이 너무 잦아요.\n1분쯤 뒤에 다시 시도해 주세요.'
    case 'AUTHENTICATION_REQUIRED':
      return '로그인이 풀렸어요.\n다시 로그인한 뒤 저장해 주세요.'
    case 'CSRF_FAILED':
      return '보안 확인에 실패했어요.\n잠시 후 다시 시도해 주세요.'
  }
  if (e.status === 503 || e.retryable) return '서버가 잠시 응답하지 않아요.\n잠시 후 다시 시도해 주세요.'
  return '저장하지 못했어요.\n잠시 후 다시 시도해 주세요.'
}

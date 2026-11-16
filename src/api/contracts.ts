// 계약서 API
import type { ContractDetailResponse, ContractListResponse } from '../types/api'
import { api } from './client'

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

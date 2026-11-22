import { useState } from 'react'
import { useNavigate } from 'react-router'
import { clearJobId } from '../analysis/runner'
import { deleteErrorMessage, removeContract } from '../api/contracts'
import ConfirmDialog from './ConfirmDialog'

type Props = {
  contractId: string
  /** 확인 창에 보여줄 이름 (예: 근로계약서) */
  title: string
}

/**
 * 리포트 상세 화면의 [삭제] 버튼.
 * 확인 창에서 한 번 더 확인받은 뒤 영구 삭제하고, 내 리포트 목록으로 돌아갑니다.
 */
function DeleteReportButton({ contractId, title }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setError(null)
  }

  const confirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await removeContract(contractId)
    } catch (err) {
      setError(deleteErrorMessage(err))
      setDeleting(false)
      return
    }
    clearJobId(contractId)
    navigate('/reports', { replace: true, state: { deleted: contractId } })
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        삭제
      </button>
      {open && (
        <ConfirmDialog
          title="리포트를 삭제할까요?"
          confirmLabel="삭제"
          pendingLabel="삭제하는 중…"
          pending={deleting}
          error={error}
          danger
          onConfirm={confirm}
          onCancel={close}
        >
          <p>
            {title} 원문과 점검 결과가 <strong>영구 삭제</strong>돼요.
          </p>
          <p>삭제하면 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

export default DeleteReportButton

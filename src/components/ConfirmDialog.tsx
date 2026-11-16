import { useEffect, useRef, type ReactNode } from 'react'
import './ConfirmDialog.css'

type Props = {
  title: string
  children: ReactNode
  confirmLabel: string
  /** 처리 중이면 버튼을 막고 문구를 바꿉니다. */
  pending?: boolean
  pendingLabel?: string
  error?: string | null
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 되돌릴 수 없는 작업 전에 띄우는 확인 창 (브라우저 confirm 대신 사용) */
function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pending = false,
  pendingLabel,
  error,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // 실수로 누르지 않도록 처음 열릴 때 '취소'에 포커스합니다.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Esc로 닫습니다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  return (
    <div className="dialog-backdrop" onClick={() => !pending && onCancel()}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <div id="dialog-desc" className="dialog__body">
          {children}
        </div>
        {error && (
          <p className="dialog__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={pending}>
            취소
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog

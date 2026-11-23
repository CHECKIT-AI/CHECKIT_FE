import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  maxLength: number
  /** 입력칸 아래 안내·확인 표시 */
  children?: ReactNode
}

/** 비밀번호 입력칸: 보기/숨기기 버튼, Caps Lock 안내 */
function PasswordField({ label, value, onChange, autoComplete, maxLength, children }: Props) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'))

  return (
    <div className="login-form__field">
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button
          type="button"
          className="pw__toggle"
          aria-label={shown ? `${label} 숨기기` : `${label} 보기`}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>
      {capsLock && <small className="pw__caps">Caps Lock이 켜져 있어요.</small>}
      {children}
    </div>
  )
}

export default PasswordField

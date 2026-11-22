import { useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { CheckIcon, LockIcon, UploadIcon } from '../components/icons'
import { setPendingUpload } from '../upload/draft'
import { MAX_PAGES, validateFiles } from '../upload/ocr'
import './HomePage.css'

const POINTS = ['누락과 위법을 구분한 판정', '검증된 법령 근거', '원문 문장 연결']

const STEPS = [
  { title: '계약서 업로드', desc: '글자를 읽어오고, 잘못 읽었을 수 있는 부분은 직접 확인해요.' },
  { title: '자동 점검', desc: '조항을 나눠 필수 기재사항과 대조하고, 위험 조항을 찾아요.' },
  { title: '근거 확인', desc: '관련 법령의 적용 요건을 대조해 검증된 근거만 보여드려요.' },
  { title: '확인할 사항 정리', desc: '서명 전에 물어볼 내용을 질문 목록으로 정리해요.' },
]

/** 로그인 확인이 끝나기 전에 눌렀을 때 (확인이 끝나면 저절로 사라짐) */
const CHECKING = '로그인 상태를 확인하고 있어요.\n잠시 후 다시 시도해 주세요.'

function HomePage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // 소셜 로그인은 외부 사이트를 거쳐 돌아오므로 고른 파일이 사라집니다.
  // 그래서 파일을 고르기 전에 로그인 여부를 먼저 확인합니다.
  const goLogin = () => navigate('/login', { state: { reason: 'upload', returnTo: '/' } })

  const accept = (files: FileList | null) => {
    if (!files?.length) return
    const result = validateFiles(files)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setPendingUpload(result)
    navigate('/review')
  }

  const handleDropClick = (e: MouseEvent<HTMLLabelElement>) => {
    if (loading) {
      e.preventDefault()
      setError(CHECKING)
      return
    }
    if (!user) {
      e.preventDefault() // 파일 선택창을 열지 않음
      goLogin()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    accept(e.target.files)
    e.target.value = '' // 같은 파일을 다시 골라도 동작하도록
  }

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault() // 브라우저가 파일을 직접 여는 것을 막음
    setDragging(true)
  }

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    if (loading) {
      setError(CHECKING)
      return
    }
    if (!user) {
      goLogin()
      return
    }
    accept(e.dataTransfer.files)
  }

  return (
    <section className="wrap">
      <div className="hero">
        <div className="hero__text">
          <span className="badge">사회초년생을 위한 근로계약서 점검</span>
          <h1 className="headline">
            서명하기 전에,
            <br />
            빠진 조항과 위험 조항을
            <br />
            근거와 함께 확인하세요
          </h1>
          <p className="lead">
            근로계약서를 올리면 법정 필수 기재사항이 빠졌는지, 문제가 될 수 있는 조항은 없는지
            점검하고, 법령 근거와 원문 위치를 함께 보여드려요.
          </p>
          <ul className="points">
            {POINTS.map((point) => (
              <li key={point}>
                <CheckIcon size={17} className="points__icon" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="upload-card">
          <div>
            <h2>계약서 올리기</h2>
            <p className="upload-card__sub">
              PDF 한 개 또는 계약서 사진(JPG·PNG·HEIC) 최대 {MAX_PAGES}장을 올려 주세요.
            </p>
          </div>

          <label
            className={dragging ? 'drop drop--over' : 'drop'}
            htmlFor="contract-file"
            onClick={handleDropClick}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <span className="drop__icon">
              <UploadIcon size={22} />
            </span>
            <span>
              <strong>파일을 끌어오거나 클릭해서 선택</strong>
              <small>사진이 여러 장이면 한 번에 골라 주세요. 파일 이름 순서대로 페이지가 정해져요.</small>
            </span>
            <input
              id="contract-file"
              type="file"
              className="sr-only"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              multiple
              onChange={handleChange}
            />
          </label>

          {error && !(error === CHECKING && !loading) && (
            <p className="upload-error" role="alert">
              {error}
            </p>
          )}

          <p className="privacy">
            <LockIcon size={16} className="privacy__icon" />
            글자는 이 브라우저 안에서 읽어요. 원본 파일은 서버로 보내지 않고, 개인정보를 가린
            텍스트만 점검에 사용해요.
          </p>
        </div>
      </div>

      <h2 className="section-title">이렇게 점검해요</h2>
      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="steps__no">STEP {i + 1}</span>
            <span className="steps__title">{step.title}</span>
            <span className="steps__desc">{step.desc}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default HomePage

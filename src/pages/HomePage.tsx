import type { DragEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { CheckIcon, LockIcon, UploadIcon } from '../components/icons'
import './HomePage.css'

const POINTS = ['누락과 위법을 구분한 판정', '검증된 법령 근거', '원문 문장 연결']

const STEPS = [
  { title: '계약서 업로드', desc: '텍스트를 추출하고, 인식이 어려운 부분은 다시 요청해요.' },
  { title: '자동 점검', desc: '조항을 나눠 필수 기재사항과 대조하고, 위험 조항을 찾아요.' },
  { title: '근거 확인', desc: '관련 법령의 적용 요건을 대조해 검증된 근거만 보여드려요.' },
  { title: '확인할 사항 정리', desc: '서명 전에 물어볼 내용을 질문 목록으로 정리해요.' },
]

function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 소셜 로그인은 외부 사이트를 거쳐 돌아오므로 고른 파일이 사라집니다.
  // 그래서 파일을 고르기 전에 로그인 여부를 먼저 확인합니다.
  const goLogin = (reason: 'upload' | 'analyze') =>
    navigate('/login', { state: { reason, returnTo: '/' } })

  const handleDropClick = (e: MouseEvent<HTMLLabelElement>) => {
    if (!user) {
      e.preventDefault() // 파일 선택창을 열지 않음
      goLogin('upload')
    }
  }

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault() // 브라우저가 파일을 직접 여는 것을 막음
  }

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    if (!user) {
      goLogin('upload')
      return
    }
    // TODO: 드롭한 파일 처리
  }

  const handleStart = () => {
    if (!user) {
      goLogin('analyze')
      return
    }
    // TODO: 업로드·분석 API 연결
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
            <p className="upload-card__sub">텍스트 파일을 올리거나, 계약서 내용을 붙여넣으세요.</p>
          </div>

          <label
            className="drop"
            htmlFor="contract-file"
            onClick={handleDropClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <span className="drop__icon">
              <UploadIcon size={22} />
            </span>
            <span>
              <strong>파일을 끌어오거나 클릭해서 선택</strong>
              <small>텍스트·PDF·Word는 바로 불러오고, 사진·스캔본은 글자 인식 후 확인해요</small>
            </span>
            <input
              id="contract-file"
              type="file"
              className="sr-only"
              accept=".txt,.pdf,.docx,.jpg,.jpeg,.png"
            />
          </label>

          <label htmlFor="contract-text" className="sr-only">
            계약서 내용
          </label>
          <textarea
            id="contract-text"
            className="contract-text"
            placeholder="여기에 근로계약서 내용을 붙여넣거나, 아래 '샘플 계약서'를 눌러보세요."
          />

          <div className="upload-card__actions">
            <button type="button" className="btn btn-ghost">
              샘플 계약서
            </button>
            <button type="button" className="btn btn-ghost">
              사진 계약서로 체험
            </button>
            <button
              type="button"
              className="btn btn-primary upload-card__start"
              onClick={handleStart}
            >
              점검 시작하기
            </button>
          </div>

          <p className="privacy">
            <LockIcon size={16} className="privacy__icon" />
            개인정보는 가린 뒤 분석해요.
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

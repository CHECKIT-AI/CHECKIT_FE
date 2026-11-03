# CheckIt Frontend

React + TypeScript + Vite 기반 근로계약서 점검 서비스 CHECKIT의 프론트엔드입니다.

## 최근 변경 요약 (2026-11-03)

- **기본 세팅:** React 19 + TypeScript + Vite 8로 프로젝트를 구성했습니다. 개발 서버는 `5173` 포트, `/api` 요청은 백엔드(`http://localhost:8000`)로 프록시합니다.
- **홈 화면:** 디자인 목업(`mvp.html`)의 홈 화면을 컴포넌트로 옮겼습니다. 헤더·히어로·계약서 올리기 카드·점검 4단계 안내·푸터로 구성됩니다.
- **로그인 화면:** `/login`에 카카오·구글 소셜 로그인 버튼 화면을 추가했습니다. 목업의 "간편 로그인" 버튼 하나를 백엔드가 지원하는 두 제공자로 나눴습니다.
- **라우팅:** `react-router`로 `/`(홈), `/login`(로그인)을 연결했습니다. 헤더 메뉴는 현재 화면을 강조합니다.
- **서비스명:** 목업에서 섞여 있던 "첫계약"·"체킷" 표기를 **CHECKIT**으로 통일했습니다.

현재 완료 범위는 **화면(UI)만**입니다. 버튼·파일 선택·입력창은 표시만 되고 동작하지 않으며, **백엔드 API는 아직 하나도 연결하지 않았습니다.** 빌드(`npm run build`)와 lint(`npm run lint`) 통과를 확인했습니다.

## 실행

Node.js 20.19 이상(권장: 22 이상)이 필요합니다. `package.json`이 있는 `CHECKIT_FE` 폴더에서 실행합니다.

```bash
npm install
npm run dev
```

[http://localhost:5173](http://localhost:5173)에서 열립니다. 종료는 `Ctrl+C`.

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint 검사 |

## 화면

| 경로 | 화면 | 상태 |
| --- | --- | --- |
| `/` | 홈 — 서비스 소개, 계약서 올리기 카드, 점검 4단계 안내 | UI만 구현 |
| `/login` | 로그인 — 카카오·구글로 시작하기 | UI만 구현 |

목업 대비 변경 사항:

- 개인정보 안내에서 "이 시연 페이지는 입력한 내용을 어디에도 저장하거나 전송하지 않아요" 문장을 뺐습니다. 실제 서비스는 서버로 전송하므로 사실과 맞지 않습니다.
- 로그인 화면의 시연용 안내("아무 이메일과 4자 이상 비밀번호로 로그인돼요")를 뺐습니다.
- 목업에서 주석 처리된 이메일·비밀번호 입력은 넣지 않았습니다. 백엔드에는 이메일 회원가입·로그인 API가 있으므로 필요하면 추가합니다.
- 헤더의 "내 리포트" 메뉴는 화면이 없어 아직 이동하지 않습니다.

## 백엔드 연동 준비

백엔드 인증 쿠키가 `SameSite=Lax`이고 POST 요청의 Origin으로 CSRF를 검사하므로, 브라우저는 **상대 경로 `/api`**를 호출하고 개발 서버가 백엔드로 전달하는 방식을 사용합니다([백엔드 팀 접속 안내](../CHECKIT_BE/docs/team-server-access.md) 참고).

- 프록시는 Origin을 바꾸지 않고(`changeOrigin: false`), `/api` 경로도 제거하지 않습니다. 설정은 [`vite.config.ts`](vite.config.ts)에 있습니다.
- 백엔드 `.env`의 `CHECKIT_ALLOWED_ORIGINS`에 프론트 주소를 추가하고 백엔드를 재시작해야 POST 요청이 통과합니다.

  ```dotenv
  CHECKIT_ALLOWED_ORIGINS=["http://localhost:8000","http://localhost:5173"]
  ```

- `localhost`와 `127.0.0.1`을 섞어 쓰면 쿠키가 공유되지 않습니다. 백엔드 소셜 로그인 콜백 기본값이 `localhost`이므로 **`localhost`로 통일**합니다.
- 다른 백엔드 주소(예: 팀 공유 서버)를 쓰려면 `.env.example`을 `.env`로 복사하고 `CHECKIT_API_PROXY_TARGET`을 바꿉니다. `.env`는 GitHub에 올리지 않습니다.

API 연동 시 fetch에 `credentials: "include"`를 사용하고, POST 요청에는 `GET /api/auth/csrf`로 받은 최신 토큰을 `X-CSRF-Token` 헤더로 전달합니다. 백엔드 API 목록과 응답 형식은 [백엔드 README](../CHECKIT_BE/README.md)와 [프론트 API 설계](../CHECKIT_BE/docs/frontend-api-guide.md)를 참고하세요.

## 구현 상태

- **완료:** 프로젝트 기본 세팅, `/api` 프록시, 홈·로그인 화면 UI, 라우팅
- **예정:** API 연결(CSRF·비회원 세션·소셜 로그인), 계약서 업로드·점검 진행·점검 리포트·OCR 인식 결과 확인·내 리포트 화면

백엔드도 아직 업로드·OCR·분석 API가 없으므로, 점검 흐름 화면은 백엔드 구현에 맞춰 연결합니다.

## 파일 구조

```text
CHECKIT_FE/
├── index.html              # HTML 진입점·폰트(IBM Plex Sans KR)
├── vite.config.ts          # 개발 서버 포트·/api 프록시
├── .env.example            # 프록시 대상 백엔드 주소 양식
├── src/
│   ├── main.tsx            # React 시작점·라우터
│   ├── App.tsx             # 공통 레이아웃·라우트
│   ├── index.css           # 색상 변수·공통 스타일·버튼
│   ├── components/
│   │   ├── Header.tsx/.css # 로고·메뉴·로그인 버튼
│   │   ├── Footer.tsx/.css # 법률 자문 아님 안내
│   │   └── icons.tsx       # SVG 아이콘(카카오·구글 포함)
│   └── pages/
│       ├── HomePage.tsx/.css
│       └── LoginPage.tsx/.css
└── package.json
```

스타일은 별도 UI 라이브러리 없이 컴포넌트별 CSS 파일로 관리합니다. 색상·여백 값은 목업의 CSS 변수(`--accent`, `--ink` 등)를 그대로 사용합니다.

## 참고

- 카카오·구글 버튼은 실제 서비스 공개 전에 각 제공자의 로그인 버튼 디자인 가이드를 확인합니다.

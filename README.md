# CheckIt Frontend

React + TypeScript + Vite 기반 근로계약서 점검 서비스 CHECKIT의 프론트엔드입니다.

## 최근 변경 요약 (2026-11-03)

- **기본 세팅:** React 19 + TypeScript + Vite 8로 프로젝트를 구성했습니다. 개발 서버는 `5173` 포트, `/api` 요청은 백엔드(`http://localhost:8000`)로 프록시합니다.
- **홈 화면:** 디자인 목업(`mvp.html`)의 홈 화면을 컴포넌트로 옮겼습니다. 헤더·히어로·계약서 올리기 카드·점검 4단계 안내·푸터로 구성됩니다.
- **로그인 화면:** `/login`에 카카오·구글 소셜 로그인 버튼 화면을 추가했습니다. 목업의 "간편 로그인" 버튼 하나를 백엔드가 지원하는 두 제공자로 나눴습니다.
- **내 리포트 화면:** `/reports`에 요약 통계 3개와 리포트 카드 목록을 추가했습니다. 지금은 예시 데이터(`src/mocks/reports.ts`)로 표시합니다.
- **소셜 로그인 연결:** 카카오·구글 버튼이 백엔드 `POST /api/auth/oauth/{provider}/start`를 호출해 로그인 화면으로 이동하고, 완료 후 `/auth/complete`에서 결과를 처리합니다. 로그인 상태는 `GET /api/auth/me`로 확인하며, 헤더에 계정 종류와 로그아웃 버튼을 표시합니다. 공통 API 클라이언트(`src/api/client.ts`)가 쿠키·CSRF 토큰·오류 형식을 처리합니다.
- **인식 결과 확인 화면:** `/review`에 OCR 결과를 줄별로 확인·수정하는 화면을 추가했습니다. 인식 신뢰도에 따라 정상/확인 필요(노랑)/인식 실패(빨강)로 표시하고, "맞아요"·직접 수정·전체 직접 입력 모드, 확인 진행률, 미확인 줄 안내를 지원합니다. 백엔드 설계의 `ExtractionOutput`·`TextBlock` 형식(`src/types/extraction.ts`)으로 만든 예시 데이터를 사용합니다. 홈의 "사진 계약서로 체험"으로 들어갑니다.
- **점검 리포트 화면:** `/reports/:id`에 분석이 끝났다고 가정한 결과 화면을 추가했습니다. 판정별 개수, 위험 조항·필수 기재사항 목록, 항목 상세(계약서 문장·설명·근거 법령·적용 요건·확인 질문), 원본 계약서의 조항 강조, 서명 전 확인 질문 목록을 보여줍니다. 인식 결과 확인의 "확인 완료 후 점검하기"와 내 리포트의 "리포트 보기"로 들어갑니다. 예시 데이터(`src/mocks/report.ts`)를 사용합니다.
- **로그인 필수:** 비로그인 상태에서 파일 올리기 영역을 누르거나 파일을 끌어다 놓으면, 파일을 고르기 전에 로그인 화면으로 이동합니다(소셜 로그인은 외부 사이트를 거쳐 돌아오므로 고른 파일이 사라지기 때문). "점검 시작하기"도 같은 방식으로 로그인 화면으로 이동하고, 내 리포트는 "로그인이 필요해요" 화면을 보여줍니다. 로그인 상태는 `useAuth()`로 어디서나 확인합니다.
- **라우팅:** `react-router`로 `/`(홈), `/login`(로그인), `/reports`(내 리포트)를 연결했습니다. 헤더 메뉴는 현재 화면을 강조합니다.
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
| `/auth/complete` | 소셜 로그인 완료 처리 — 성공 시 원래 화면으로 이동, 실패 시 사유 안내 | API 연결 |
| `/review` | 인식 결과 확인 — 원본·줄별 인식 결과·신뢰도·수정 도구 | UI·화면 내 동작 구현, 예시 데이터 표시 |
| `/reports/:id` | 점검 리포트 — 항목 목록·상세·근거 법령·원본 강조·확인 질문 | UI·화면 내 동작 구현, 예시 데이터 표시 |
| `/reports` | 내 리포트 — 요약 통계, 리포트 카드(판정별 개수·리포트 보기·삭제) | UI만 구현, 예시 데이터 표시 |

목업 대비 변경 사항:

- 개인정보 안내에서 "이 시연 페이지는 입력한 내용을 어디에도 저장하거나 전송하지 않아요" 문장을 뺐습니다. 실제 서비스는 서버로 전송하므로 사실과 맞지 않습니다.
- 로그인 화면의 시연용 안내("아무 이메일과 4자 이상 비밀번호로 로그인돼요")를 뺐습니다.
- 목업에서 주석 처리된 이메일·비밀번호 입력은 넣지 않았습니다. 백엔드에는 이메일 회원가입·로그인 API가 있으므로 필요하면 추가합니다.
- 내 리포트는 비로그인이면 "로그인이 필요해요", 로그인 후 기록이 없으면 "아직 점검한 계약서가 없어요", 기록이 있으면 목록을 보여줍니다. 목록은 아직 예시 데이터입니다.

## 백엔드 연동 준비

백엔드 인증 쿠키가 `SameSite=Lax`이고 POST 요청의 Origin으로 CSRF를 검사하므로, 브라우저는 **상대 경로 `/api`**를 호출하고 개발 서버가 백엔드로 전달하는 방식을 사용합니다([백엔드 팀 접속 안내](../CHECKIT_BE/docs/team-server-access.md) 참고).

- 프록시는 Origin을 바꾸지 않고(`changeOrigin: false`), `/api` 경로도 제거하지 않습니다. 설정은 [`vite.config.ts`](vite.config.ts)에 있습니다.
- 백엔드 `.env`의 `CHECKIT_ALLOWED_ORIGINS`에 프론트 주소를 추가하고 백엔드를 재시작해야 POST 요청이 통과합니다.

  ```dotenv
  CHECKIT_ALLOWED_ORIGINS=["http://localhost:8000","http://localhost:5173"]
  CHECKIT_OAUTH_FRONTEND_COMPLETE_URL=http://localhost:5173/auth/complete
  ```

- 소셜 로그인 완료 후 백엔드가 `CHECKIT_OAUTH_FRONTEND_COMPLETE_URL`(`/auth/complete`)로 돌려보냅니다. 로컬 백엔드는 `CHECKIT_ENVIRONMENT=development`, `CHECKIT_COOKIE_SECURE=false`로 실행합니다(production은 https 주소만 허용).

- `localhost`와 `127.0.0.1`을 섞어 쓰면 쿠키가 공유되지 않습니다. 백엔드 소셜 로그인 콜백 기본값이 `localhost`이므로 **`localhost`로 통일**합니다.
- 다른 백엔드 주소(예: 팀 공유 서버)를 쓰려면 `.env.example`을 `.env`로 복사하고 `CHECKIT_API_PROXY_TARGET`을 바꿉니다. `.env`는 GitHub에 올리지 않습니다.

API 연동 시 fetch에 `credentials: "include"`를 사용하고, POST 요청에는 `GET /api/auth/csrf`로 받은 최신 토큰을 `X-CSRF-Token` 헤더로 전달합니다. 백엔드 API 목록과 응답 형식은 [백엔드 README](../CHECKIT_BE/README.md)와 [프론트 API 설계](../CHECKIT_BE/docs/frontend-api-guide.md)를 참고하세요.

## 구현 상태

- **완료:** 프로젝트 기본 세팅, `/api` 프록시, 홈·로그인·내 리포트 화면 UI, 라우팅, 공통 API 클라이언트, 카카오·구글 로그인·로그아웃·로그인 상태 확인
- **예정:** 내 리포트 목록 API 연결, 계약서 업로드·점검 진행 화면, 인식 결과 확인·점검 리포트 화면의 API 연결(원본 이미지·영역 강조 포함)

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
│   ├── api/
│   │   └── client.ts       # 공통 API 클라이언트 (쿠키·CSRF·오류)
│   ├── auth/
│   │   ├── AuthProvider.tsx # /api/auth/me 로 로그인 상태 관리, 로그아웃
│   │   ├── authContext.ts
│   │   ├── useAuth.ts
│   │   └── returnPath.ts   # 로그인 후 이동 경로 검증
│   ├── mocks/
│   │   ├── reports.ts      # 화면 확인용 예시 리포트 데이터
│   │   ├── extraction.ts   # 화면 확인용 예시 OCR 결과
│   │   └── report.ts       # 화면 확인용 예시 점검 결과
│   ├── types/
│   │   ├── extraction.ts   # OCR 결과 형식 (백엔드 설계 문서 기준)
│   │   └── report.ts       # 점검 리포트 형식 (백엔드 미정 필드 표시)
│   └── pages/
│       ├── AuthCompletePage.tsx  # 소셜 로그인 완료 처리
│       ├── HomePage.tsx/.css
│       ├── LoginPage.tsx/.css
│       ├── MyReportsPage.tsx/.css
│       ├── ReportPage.tsx/.css     # 점검 리포트
│       └── ReviewPage.tsx/.css     # 인식 결과 확인
└── package.json
```

스타일은 별도 UI 라이브러리 없이 컴포넌트별 CSS 파일로 관리합니다. 색상·여백 값은 목업의 CSS 변수(`--accent`, `--ink` 등)를 그대로 사용합니다.

## 참고

- 카카오·구글 버튼은 실제 서비스 공개 전에 각 제공자의 로그인 버튼 디자인 가이드를 확인합니다.

# CheckIt Frontend

근로계약서 점검 서비스 **CHECKIT**의 프론트엔드입니다. React 19 + TypeScript + Vite 8로 만들었고, 별도 UI 라이브러리 없이 컴포넌트별 CSS를 씁니다.

## 빠른 시작

필요한 것: Node.js 20.19 이상(권장 22 이상), PaddleOCR 모델을 만들 때만 Python 3.9~3.12(권장 3.11)

```bash
npm install
bash scripts/paddle-models.sh   # 처음 한 번: 글자 인식 모델 만들기 (아래 '글자 인식' 참고)
npm run dev
```

[http://localhost:5173](http://localhost:5173)에서 열립니다. 로그인과 API를 쓰려면 백엔드(`CHECKIT_BE`)도 `localhost:8000`에서 실행 중이어야 합니다([백엔드 연동](#백엔드-연동) 참고).

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 (5173 포트, `/api`는 백엔드로 프록시) |
| `npm run build` | 타입 검사 후 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint 검사 |
| `bash scripts/paddle-models.sh` | PaddleOCR 모델을 브라우저용(ONNX)으로 만들어 `public/models/paddle/`에 저장 |

## 화면

| 경로 | 화면 | 상태 |
| --- | --- | --- |
| `/` | 홈: 서비스 소개, 계약서 올리기(PDF 1개 또는 JPG·PNG·HEIC 최대 10장) | 동작 |
| `/login` | 로그인: 카카오·구글 | API 연결 |
| `/auth/complete` | 소셜 로그인 완료 처리 | API 연결 |
| `/review` | ① 읽어온 글자 확인: 원본과 줄 단위로 비교·수정<br>② 개인정보 가리기·동의 | 동작 (저장 연결 전) |
| `/reports` | 내 리포트: 목록·결과 요약·삭제 | API 연결 |
| `/reports/:id` | 점검 리포트: 항목·근거 법령·원문 강조 | API 연결 |

로그인은 필수입니다. 비로그인 상태에서 파일 올리기를 누르면 파일을 고르기 전에 로그인 화면으로 보냅니다. 소셜 로그인은 외부 사이트를 거쳐 돌아오므로 고른 파일이 사라지기 때문입니다.

## 점검 흐름

```text
계약서 올리기 → 글자 읽기(브라우저) → 원본과 비교·수정 → 개인정보 가리기·동의 → 저장 → 분석 → 리포트
     ✅               ✅                    ✅                     ✅              예정    예정    ✅
```

- **원본 파일은 서버로 보내지 않습니다.** 브라우저에서 글자를 읽고, 사용자가 확인하고 개인정보를 가린 텍스트만 `POST /api/contracts`로 저장합니다(연결 예정).
- 확인 화면은 한 줄씩 보여주고, 줄을 누르면 원본에서 위치를 강조합니다. 흐리게 읽힌 줄은 노란색으로 표시하고 [맞아요]로 확인하거나 고쳐야 페이지 확인을 마칠 수 있습니다. 페이지 인식 신뢰도가 85% 미만이면 다시 찍어 달라고 안내합니다.
- 글자 확인과 개인정보 가리기는 같은 화면(`/review`)의 두 단계라서, 오가도 고친 내용과 가림이 그대로 남습니다.
- 고른 파일과 확인 중인 내용은 메모리에만 있어 새로고침하면 사라집니다(새로고침 전에 경고).

## 글자 인식 (OCR)

| 파일 | 읽는 방법 |
| --- | --- |
| PDF | 글자가 들어 있는 페이지는 그 글자를 그대로 씁니다(pdf.js). 글자가 없는 스캔 페이지만 OCR |
| JPG·PNG | 모든 장을 OCR. 파일 이름 순서(1, 2, 10 순)가 페이지 순서 |
| HEIC·HEIF (아이폰 사진) | 브라우저에서 JPG로 바꾼 뒤 OCR. 확장자가 .jpg·.png여도 파일 앞부분으로 HEIC를 알아냄 |

HEIC 변환은 [heic-to](https://github.com/hoppergee/heic-to)를 씁니다(약 3MB, HEIC를 올렸을 때만 불러옴, `src/upload/heic.ts`).

OCR은 **PaddleOCR을 ONNX로 바꿔 브라우저에서 실행**합니다([onnxruntime-web](https://onnxruntime.ai/docs/tutorials/web/), Web Worker).

- 모델: 글자 영역 찾기 `PP-OCRv6_medium_det`, 한국어 인식 `korean_PP-OCRv5_mobile_rec`
- 실행: WebGPU가 되면 그래픽 카드, 안 되면 CPU(WebAssembly)로 자동 전환. 비교하려면 브라우저 콘솔에서 `localStorage.setItem('checkit.paddleBackend', 'wasm')` 또는 `'webgpu'`
- 단계별 걸린 시간은 브라우저 콘솔의 `[PaddleOCR]` 로그로 확인합니다.
- 처리 순서는 `src/upload/paddle/worker.ts` 맨 위 주석에 있습니다. 전처리·후처리 값은 PaddleX OCR 파이프라인 기본값과 같습니다.

### 모델 파일 준비

모델 파일(약 75MB)은 용량 때문에 **git에 올리지 않습니다**(`public/models/`는 `.gitignore`). 처음 한 번 아래를 실행하세요.

```bash
bash scripts/paddle-models.sh
```

- 임시 Python 가상환경에 PaddleOCR을 설치하고, 모델을 받아(`~/.paddlex/official_models`) ONNX로 바꿉니다. 결과: `public/models/paddle/det.onnx`, `rec.onnx`, `korean_dict.json`
- 기본으로 `python3.11`을 씁니다. 다른 Python을 쓰려면 `PYTHON=python3.12 bash scripts/paddle-models.sh`
- 모델이 없으면 글자가 들어 있는 PDF만 읽히고, 사진·스캔본은 "글자 인식 모델을 불러오지 못했어요" 오류가 납니다.
- **배포할 때는 모델 파일을 둘 곳(정적 파일 서버, CDN 등)을 따로 정해야 합니다.** 경로는 `worker.ts`의 `MODEL_BASE`입니다.

### 외부에서 받는 파일

계약서 내용은 보내지 않고, 실행에 필요한 파일만 jsDelivr에서 받습니다.

- pdf.js 문자표(CMap)·표준 글꼴: 한글 PDF의 글자가 빠지지 않게 하는 데 필요합니다.
- onnxruntime-web 실행 파일(wasm)

## 개인정보 가리기

글자 확인을 마치면 같은 화면에서 개인정보를 가립니다. **모두 브라우저 안에서 처리**하고, 규칙(정규식) 기반입니다(`src/upload/privacy.ts`).

| 종류 | 찾는 기준 | 비고 |
| --- | --- | --- |
| 주민등록번호 | 6자리-1~8로 시작하는 7자리 (뒷자리 일부 가림 포함) | **꼭 가려야 함** |
| 휴대전화 | 010·011·016~019 번호 | **꼭 가려야 함** |
| 이메일 | `글자@도메인` | **꼭 가려야 함** |
| 일반전화 | 02·031~065·070, 구분 기호가 있는 것 | |
| 이름 | "성명·이름" 뒤, "근로자:·대표자:" 같은 이름표 뒤, `홍길동(이하 "근로자")` | 찾은 이름이 다른 곳에 또 나오면 함께 가림 |
| 상세 주소 | 시·도 + 시·군·구 + 도로명·지번 + 동·호·층 형식 | **근로자 본인 주소의 상세 부분만** 가림(시·도, 시·군·구는 남김). 근무장소·사업주 주소는 그대로 |
| 계좌번호·사업자등록번호·생년월일 | "계좌·생년월일" 이름표 뒤, 하이픈으로 나뉜 긴 숫자, `3-2-5`자리 | |

- **금액·날짜·근무시간은 점검에 필요해서 가리지 않습니다.** 근무장소도 필수 기재사항이라 남깁니다.
- "꼭 가려야 함" 3가지는 백엔드(`CHECKIT_BE app/privacy.py`)가 발견하면 저장을 거부(`422 PERSONAL_DATA_DETECTED`)하는 정보입니다. 화면에서 풀 수 없고, 보내기 직전에 백엔드와 같은 검사를 한 번 더 합니다.
- 가린 부분은 `[이름]`, `[상세주소]`처럼 바꿔서 보냅니다. 사용자는 검은 칸을 눌러 풀거나, 드래그해서 더 가리거나, "같은 글자 모두 가리기"를 쓸 수 있습니다.
- 보내기 전에 **종류별 확인 목록**(이름·연락처·주민등록번호·상세 주소·계좌번호)과 **Gemini 전송 안내**를 모두 체크해야 다음으로 넘어갑니다. 가림을 풀면 그 종류는 다시 체크해야 합니다.
- 규칙 기반이라 이름표 없이 문장 속에 나오는 이름·주소는 놓칠 수 있습니다. 그래서 마지막 확인을 사용자에게 받습니다.
- 페이지를 이은 전체 길이는 백엔드 한도(30,000자)를 넘지 않게 검사합니다.

## 리포트 표시

분석 결과(`current_result.items`)를 화면용으로 바꾸는 규칙은 `src/report/view.ts`에 있습니다.

- 묶음: **위험 조항**(LEGAL_RISK) · **불리한 조건**(DISADVANTAGE) · **필수 기재사항 확인**(MISSING) · **계약서에 적혀 있음**
- 백엔드는 2026-11-17(`adb88d9`)부터 **필수 기재사항 8개를 항상** 결과에 넣고, 기재 여부를 `document_presence`로 줍니다.

| 기재 여부 | 화면 |
| --- | --- |
| `PRESENT` | "계약서에 적혀 있음" 묶음, 태그 **적혀 있음** |
| `ABSENT` | "필수 기재사항 확인" 묶음, 태그 **누락 의심** (법령 근거를 검증 못 했으면 **확인 필요** + 판단 보류 안내) |
| `UNCLEAR` | "필수 기재사항 확인" 묶음, 태그 **불명확** + 부속합의서 같은 별도 서면도 확인하라는 안내 |

- 백엔드가 Gemini 판단을 막을 때 쓰는 고정 문구(예: "법령 인용을 검증할 수 없어 판단을 보류합니다.")는 그대로 보여주지 않고 "판단을 보류했어요" 안내로 바꿉니다. 백엔드에 보류 이유 코드가 생기면 문구 대신 코드로 판단하도록 바꿉니다.

## 백엔드 연동

백엔드 인증 쿠키가 `SameSite=Lax`이고 POST 요청의 Origin으로 CSRF를 검사하므로, 브라우저는 **상대 경로 `/api`**를 호출하고 개발 서버가 백엔드로 전달합니다([백엔드 팀 접속 안내](../CHECKIT_BE/docs/team-server-access.md)).

- 프록시는 Origin을 바꾸지 않고(`changeOrigin: false`) `/api` 경로도 그대로 둡니다([`vite.config.ts`](vite.config.ts)).
- `vite.config.ts`의 `optimizeDeps.include`에는 파일을 올릴 때 처음 불러오는 라이브러리(pdf.js·onnxruntime-web·heic-to)를 넣어 둡니다. 빠지면 개발 서버가 도중에 다시 묶으면서 페이지를 새로고침해 고른 파일이 사라집니다.
- 백엔드 `.env`에 프론트 주소를 넣고 백엔드를 재시작해야 POST 요청과 소셜 로그인이 동작합니다.

  ```dotenv
  CHECKIT_ALLOWED_ORIGINS=["http://localhost:8000","http://localhost:5173"]
  CHECKIT_OAUTH_FRONTEND_COMPLETE_URL=http://localhost:5173/auth/complete
  ```

- 로컬 백엔드는 `CHECKIT_ENVIRONMENT=development`, `CHECKIT_COOKIE_SECURE=false`로 실행합니다.
- `localhost`와 `127.0.0.1`을 섞어 쓰면 쿠키가 공유되지 않습니다. **`localhost`로 통일**합니다.
- 다른 백엔드 주소(예: 팀 공유 서버)를 쓰려면 `.env.example`을 `.env`로 복사하고 `CHECKIT_API_PROXY_TARGET`을 바꿉니다. `.env`는 올리지 않습니다.

API 호출은 `src/api/client.ts`가 처리합니다(쿠키 포함, POST·DELETE에 `X-CSRF-Token`, 오류 형식 변환). 요청·응답 타입은 `src/types/api.ts`에 모았고, 기준은 [백엔드 API 문서](../CHECKIT_BE/docs/api-reference.md)입니다.

| API | 쓰는 곳 |
| --- | --- |
| `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/oauth/{provider}/start` | 로그인 |
| `GET /api/contracts` | 내 리포트 목록 (카드의 결과 개수는 계약서별 상세를 한 번 더 불러와 채움) |
| `GET /api/contracts/{id}` | 리포트 상세 |
| `DELETE /api/contracts/{id}` | 리포트 삭제 |

> **분석 결과 구조는 아직 확정되지 않았습니다**(백엔드 "Gemini 출력 결과 초안" 기준). 바뀌면 `src/types/api.ts`와 `src/report/view.ts`를 주로 고칩니다. Gemini 무료 사용량 때문에 개발 중에는 실제 분석(`POST /api/analysis/.../jobs`)을 돌리지 않고 예시 데이터로 화면을 확인합니다.

## 개발용 예시 데이터

개발 서버(`npm run dev`)에서는 내 리포트 목록 아래에 **예시 리포트 2개**가 나옵니다. `/reports/sample-1`(카페), `/reports/sample-2`(편의점)로 리포트 화면을 확인할 수 있습니다. 내용은 화면 확인용으로 만든 것이고 형식만 백엔드 결과와 같습니다(`src/mocks/analysis.ts`). 프로덕션 빌드에는 나오지 않습니다.

## 파일 구조

```text
CHECKIT_FE/
├── index.html                 # HTML 진입점·폰트(IBM Plex Sans KR)
├── vite.config.ts             # 개발 서버 포트·/api 프록시·Worker 빌드 형식
├── .env.example               # 프록시 대상 백엔드 주소 양식
├── scripts/
│   └── paddle-models.sh       # PaddleOCR 모델 → ONNX 변환
├── public/models/paddle/      # 모델 파일 (git 제외, 위 스크립트로 생성)
└── src/
    ├── main.tsx · App.tsx     # 시작점·라우트
    ├── index.css              # 색상 변수·공통 스타일·버튼
    ├── api/
    │   ├── client.ts          # 공통 API 클라이언트 (쿠키·CSRF·오류)
    │   └── contracts.ts       # 계약서 목록·상세·삭제
    ├── auth/                  # 로그인 상태(useAuth), 로그인 후 이동 경로 검증
    ├── types/api.ts           # 백엔드 요청·응답 타입
    ├── upload/
    │   ├── ocr.ts             # 파일 검사, PDF 글자 꺼내기, OCR 호출, 진행률
    │   ├── draft.ts           # 홈에서 고른 파일·가린 텍스트를 다음 단계로 넘김
    │   ├── errors.ts          # 사용자에게 보여줄 오류(OcrError)
    │   ├── heic.ts            # HEIC 판별·JPG 변환
    │   ├── privacy.ts         # 개인정보 찾기·가리기, 백엔드와 같은 검사
    │   └── paddle/
    │       ├── worker.ts      # PaddleOCR 실행 (Web Worker)
    │       ├── client.ts      # Worker 호출, 글자 영역을 줄로 묶기
    │       └── protocol.ts    # 화면 ↔ Worker 메시지 형식
    ├── report/
    │   ├── view.ts            # 분석 결과 → 화면용 변환 (묶음·제목·판단 보류 문구 등)
    │   └── list.ts            # 내 리포트 카드용 변환
    ├── mocks/                 # 개발용 예시 리포트
    ├── components/            # Header, Footer, ConfirmDialog, 아이콘
    └── pages/                 # 화면별 컴포넌트·CSS (ReviewPage: 글자 확인, PrivacyStep: 개인정보 가리기)
```

## 사용한 외부 라이브러리·모델

| 이름 | 용도 | 라이선스 |
| --- | --- | --- |
| pdfjs-dist 4.10.38 | PDF 글자 꺼내기·미리보기 | Apache-2.0 |
| onnxruntime-web 1.31.1 | PaddleOCR 모델 실행 | MIT |
| PaddleOCR 모델 (`PP-OCRv6_medium_det`, `korean_PP-OCRv5_mobile_rec`) | 글자 영역 찾기·한국어 인식 | Apache-2.0 |
| heic-to 1.6.7 | HEIC → JPG 변환 | **LGPL-3.0** (별도 파일로 분리해 불러옴. 서비스 공개 전 고지 방법 확인 필요) |

## 남은 작업

- 계약서 저장(`POST /api/contracts`) 연결
- 분석 조건 입력·분석 진행 화면(`POST/GET /api/analysis/contracts/{id}/jobs`)
- 로그인 만료(401) 처리, 로그인 확인 중 "불러오는 중" 표시
- 확인 화면: 다른 파일로 갈 때 경고, 파일 오류일 때 [다시 읽기] 숨기기
- 배포 시 PaddleOCR 모델 파일 호스팅
- 서비스 공개 전 확인: Gemini 이용 조건과 전송 동의 문구, heic-to(LGPL-3.0) 고지, 카카오·구글 버튼 디자인 가이드

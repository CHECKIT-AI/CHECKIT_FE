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
| `/login` | 로그인: 카카오·구글·이메일, 이메일 가입 | API 연결 (이메일 가입은 메일 설정 필요) |
| `/auth/complete` | 소셜 로그인 완료 처리 | API 연결 |
| `/auth/verify` | 가입 인증 메일의 링크로 이메일 인증 | API 연결 (메일 설정 필요) |
| `/review` | ① 읽어온 글자 확인: 원본과 줄 단위로 비교·수정<br>② 개인정보 가리기·동의 → 저장 | API 연결 |
| `/reports` | 내 리포트: 목록·결과 요약·삭제 | API 연결 (실제 삭제 확인) |
| `/reports/:id` | 점검 리포트: 항목·근거 법령·원문 강조, 삭제<br>결과가 없으면 분석 시작·조건 입력·진행 화면 | API 연결 (분석: Gemini 실제 연결) |

로그인은 필수입니다. 비로그인 상태에서 파일 올리기를 누르면 파일을 고르기 전에 로그인 화면으로 보냅니다. 소셜 로그인은 외부 사이트를 거쳐 돌아오므로 고른 파일이 사라지기 때문입니다. 자세한 동작은 [로그인](#로그인)을 참고하세요.

## 점검 흐름

```text
계약서 올리기 → 글자 읽기(브라우저) → 원본과 비교·수정 → 개인정보 가리기·동의 → 저장 → 분석(Gemini) → 리포트
     ✅               ✅                    ✅                     ✅              ✅        ✅         ✅
```

- **원본 파일은 서버로 보내지 않습니다.** 브라우저에서 글자를 읽고, 사용자가 확인하고 개인정보를 가린 텍스트만 `POST /api/contracts`로 저장합니다.
- 확인 화면은 한 줄씩 보여주고, 줄을 누르면 원본에서 위치를 강조합니다. 흐리게 읽힌 줄은 노란색으로 표시하고 [맞아요]로 확인하거나 고쳐야 페이지 확인을 마칠 수 있습니다. 페이지 인식 신뢰도가 85% 미만이면 다시 찍어 달라고 안내합니다.
- 글자 확인과 개인정보 가리기는 같은 화면(`/review`)의 두 단계라서, 오가도 고친 내용과 가림이 그대로 남습니다.
- 고른 파일과 확인 중인 내용은 메모리에만 있어 새로고침하면 사라집니다(새로고침 전에 경고).
- 저장하면 리포트 화면으로 가고, 결과가 없으므로 분석 시작 화면이 나옵니다. [점검 시작]을 누르면 백엔드가 분류 → 법령 검색 → Gemini 판단을 거쳐 결과를 저장합니다([분석 시작·진행](#분석-시작진행) 참고).
- 2026-11-25 가상 계약서와 실제 계약서로 업로드부터 리포트까지 끝까지 동작하는 것을 확인했습니다.

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

PDF 글자를 꺼낼 때 두 가지를 바로잡습니다(`src/upload/ocr.ts`의 `pdfLines`·`joinWrapped`). 백엔드는 AI가 인용한 문구가 원문에 **글자 그대로** 있는지 검사하므로, 원문이 어긋나면 분석이 실패합니다.

- **띄어쓰기**: 크롬 등으로 만든 PDF는 띄어쓰기를 제어 문자(`\u0001`)로 저장하기도 합니다. 그대로 두면 띄어쓰기가 모두 사라져서 띄어쓰기로 바꿉니다.
- **자동 줄바꿈**: 폭이 모자라 넘어간 줄("…사업주에⏎게 배상한다")은 다시 한 줄로 잇습니다. 다음 줄의 첫 낱말이 앞 줄 끝에 들어갈 자리가 없고, 같은 왼쪽에서 바로 아래에 이어지며, 새 조항 번호("8.", "제3조", "(근로자)" 등)로 시작하지 않을 때만 잇습니다. PDF에는 줄 끝 띄어쓰기 정보가 없어 띄어쓰기 한 칸으로 잇습니다.
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

## 저장과 삭제

### 저장 (`POST /api/contracts`)

개인정보 가리기에서 확인 목록과 Gemini 전송 안내를 모두 체크하고 **[다음: 저장하고 점검 준비]**를 누르면 저장합니다.

- 보내는 것: 가린 페이지별 텍스트, 파일 종류(`PDF`·`IMAGES`), 동의 2개(`privacy_confirmed`, `gemini_notice_acknowledged`). **원본 파일은 보내지 않습니다.**
- 성공하면 해당 리포트(`/reports/{id}`)로 이동하고 "계약서를 저장했어요"를 보여줍니다. 뒤로 가기로 확인 화면에 돌아오지 않게 해서 같은 계약서가 두 번 저장되지 않게 합니다.
- 저장하는 동안 버튼을 막고, 실패하면 화면(가림·체크)을 그대로 두고 안내합니다(`src/api/contracts.ts`의 `saveErrorMessage`).

| 백엔드 오류 | 안내 |
| --- | --- |
| `422 PERSONAL_DATA_DETECTED` | 주민등록번호·휴대전화·이메일로 보이는 글자가 남아 있으니 가려 달라 |
| `422 ANALYSIS_INPUT_LIMIT` | 너무 길거나 조항이 많으니 필요 없는 부분을 지워 달라 |
| `422 INVALID_INPUT`, `413` | 형식 오류·너무 큼 |
| `429 RATE_LIMITED` | 저장 요청이 너무 잦으니(분당 10회) 잠시 뒤 다시 |
| `401` | 로그인이 풀렸으니 다시 로그인 |
| `503`, 연결 실패 | 잠시 후 다시 |

저장하면 **팀 공용 Supabase DB**에 아래 3개 행이 생깁니다(`CHECKIT_BE app/contracts.py`).

| 테이블 (`checkit` 스키마) | 내용 |
| --- | --- |
| `contracts` | 계약서 1건 (사용자 ID, 종류, PDF·사진 여부, 만든 시각) |
| `file_generations` | 입력 묶음 기록 |
| `text_revisions` | 가린 계약서 텍스트 전체(`content`), 페이지 범위, 확인 시각 |

### 삭제 (`DELETE /api/contracts/{id}`)

- 내 리포트 목록 카드의 **삭제** → 확인 창(**영구 삭제**, 처음 초점은 [취소]) → 삭제하면 카드가 목록에서 빠집니다.
- 리포트 상세 화면(결과 화면·분석 시작 화면) 오른쪽 위에도 **삭제**가 있습니다. 삭제하면 내 리포트 목록으로 돌아가 "리포트를 삭제했어요"를 보여줍니다. 분석이 진행 중일 때는 버튼을 숨깁니다.
- 두 화면 모두 `src/api/contracts.ts`의 `removeContract`를 씁니다(예시 리포트는 API를 부르지 않음).
- 백엔드는 내 계약서만 지우고, 표시만 남기는 게 아니라 **행과 텍스트·분석 결과를 완전히 지웁니다.** 이미 지워진 계약서(404)는 지워진 것으로 처리합니다.
- 2026-11-18 실제 계약서로 저장 → 목록 표시 → 삭제 → DB에서 사라진 것까지 확인했습니다.

### Supabase 대시보드에서 보기

- **Table Editor**에서 왼쪽 위 스키마를 `public`에서 **`checkit`**으로 바꾸면 `contracts`, `text_revisions` 등이 보입니다.
- 내 구글 계정의 계약서와 저장된 텍스트만 보려면 **SQL Editor**에서 조회합니다(읽기만 함).

  ```sql
  select c.id, c.input_kind, c.created_at, t.content
  from checkit.contracts c
  join checkit.auth_identities i on i.user_id = c.user_id and i.provider = 'GOOGLE'
  left join checkit.text_revisions t on t.contract_id = c.id
  order by c.created_at desc;
  ```

- 공용 DB이므로 대시보드에서는 보기만 하고, 테스트 계약서는 앱의 내 리포트에서 삭제합니다.

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
- **AI가 추가로 찾은 항목**(`DISCOVERED_*`)은 백엔드가 이름을 주지 않아, 설명에 나온 쟁점 낱말로 제목을 붙입니다(`DISCOVERED_TOPICS`). 예: "위약금·손해배상 예정", "수습기간 임금 감액", "임금에서 공제", "퇴직금 포기·분할 지급", "해고 예고·서면 통지". 맞는 낱말이 없으면 조항 머리("8. 위약금:" → "위약금 조항")를 씁니다.
- **최저임금 미달 항목**(`MINIMUM_WAGE`, "기준액보다 낮습니다")이 보류되면 "AI가 최저임금 고시 원문으로 확인하지는 못했어요. 다만 계약서의 시급이 해당 연도 최저임금 기준액보다 낮게 적혀 있어요."로 안내합니다(`isBelowMinimumWage`). 임금 조항의 법령 검색 상위 5개에 '2026년 적용 최저임금 고시'가 들어오지 않아 AI가 근거를 붙이지 못하는 경우입니다.

## 분석 시작·진행

결과가 없는 리포트(`/reports/:id`)에서 분석을 시작하고 진행 상태를 보여줍니다. 화면은 `src/pages/AnalysisPanel.tsx`입니다.

```text
[점검 시작하기] → 조건 입력 → 진행(대기 → 조항 나누기·분류 → 관련 법령 찾기 → AI 판단 → 결과 정리) → 리포트
                                                                  └ 실패하면 이유와 [다시 시도]
```

- **조건 입력**: 기준 날짜, 상시 근로자 수, 주 소정근로시간, 근무 형태.
  - **기준 날짜는 오늘로 채웁니다.** 계약서에서 찾은 근로 시작일(`src/analysis/context.ts`)은 참고로만 보여줍니다. 기준 날짜가 없으면 백엔드가 근거 법령을 하나도 확인하지 못해 모든 항목이 보류됩니다.
  - 법령 자료의 근로기준법 시행일이 조문마다가 아니라 **개정일(2026-10-08)로 일괄 저장**돼 있어, 이보다 이른 날짜면 근로기준법 근거가 모두 버려집니다. 이때 경고합니다(`LAW_DATA_DATE`).
  - 백엔드는 2026년 기준만 최저임금·법령 시점을 확인하므로 다른 연도면 경고합니다.
  - 상시 근로자 수가 비면 5인 이상 사업장 규정(가산수당 등) 판단이 "확인 필요"로 나올 수 있습니다. 시연 때는 근로자 수 6, 주 40시간을 넣습니다.
- **진행 상태**: `GET .../jobs/{job_id}`를 2초마다 확인합니다. 화면을 나갔다 와도 이어서 보이도록 job_id를 탭(sessionStorage)에 기억합니다. 백엔드에 "진행 중인 작업 조회" API가 없어서입니다.
- **실패**: `error_code`별로 문구와 다시 시도 가능 여부를 정합니다(`src/api/analysis.ts`의 `jobFailure`). `ANALYSIS_INPUT_LIMIT`는 다시 시도할 수 없습니다.
- **걸리는 시간**: 짧은 계약서는 2~3분, 긴 계약서는 5분 넘게 걸립니다. 백엔드를 켠 뒤 첫 분석은 법령 검색 모델을 메모리에 올리느라 1~2분 더 걸립니다.

### 분석이 실패하는 경우 ("AI 분석 서버가 잠시 응답하지 않아요")

백엔드 로그(`Gemini …`)로 원인을 구분합니다.

| 로그 | 원인 | 대처 |
| --- | --- | --- |
| `http_status=503` | Gemini 서버에 요청이 몰림. 최신 모델일수록 자주 생깁니다 | 잠시 뒤 다시 시도. 계속되면 백엔드 `.env`의 `CHECKIT_GEMINI_MODEL`을 다른 모델로 |
| `reason=INVALID_DOCUMENT_EVIDENCE` | 필수 기재사항 8개 중 하나라도 AI 인용이 원문과 글자 그대로 맞지 않으면 백엔드가 응답 전체를 버립니다. 2번 연속이면 실패 | 다시 시도하면 통과하는 경우가 많습니다. 근본 해결은 백엔드 수정 |
| `Gemini read timeout` | `CHECKIT_GEMINI_TIMEOUT_SECONDS`(기본 60초) 안에 답이 없음. 백엔드가 요청을 반으로 나눠 다시 보내고, 두 번 나눠도 안 되면 실패 | `.env`에서 150초 정도로 늘림(최대 180) |

### 실제 분석 스위치 (`ANALYSIS_LIVE`)

`src/analysis/runner.ts`의 **`ANALYSIS_LIVE = true`**입니다(2026-11-25부터). 실제 계약서에서 [점검 시작]을 누르면 `POST /api/analysis/contracts/{id}/jobs`를 부르고 **Gemini 사용량이 쓰입니다.**

| 계약서 | 동작 | Gemini |
| --- | --- | --- |
| 예시 계약서 `sample-3` | 브라우저 안의 예시 실행기가 백엔드와 같은 형식으로 약 13초 동안 단계를 흉내 내고 예시 결과를 보여줌 | 안 씀 |
| 실제 계약서 | 백엔드 분석 실행 | **씀** |

`false`로 바꾸면 실제 계약서는 요청을 보내지 않고 "실제 분석은 아직 연결 준비 중이에요"만 보여줍니다.

### 분석용 백엔드 준비 (로컬)

분석은 백엔드에 **조항 분류 모델, 법령 검색(RAG), Gemini 키**가 모두 있어야 동작합니다(`app/analysis_jobs.py`). 하나라도 없으면 503 `ANALYSIS_UNAVAILABLE`입니다. 백엔드 코드는 그대로 두고 실행 환경만 준비합니다.

1. **Python 3.11 가상환경** (백엔드 기본 `.venv`와 별도). 2026-11 기준 Python 3.14에는 `onnxruntime`(chromadb가 씀)이 없고, macOS 13에는 `torch 2.14.1`이 없어 버전 두 개만 바꿨습니다.

   ```bash
   python3.11 -m venv ../.venv-ai
   # 백엔드 requirements.txt + requirements-rag.txt + requirements-classifier.txt 에서
   # torch==2.14.1 → torch==2.11.0, numpy==2.5.4 → numpy<2.4 로 바꾼 목록으로 설치
   ../.venv-ai/bin/python -m pip install -r <바꾼 목록>
   ```

2. **법령 인덱스 파일** (git에 없음, 팀원에게 받기). `CHECKIT_DATA`의 같은 위치에 넣습니다.

   ```text
   CHECKIT_DATA/storage/rag/employment_basic_v004/        index_manifest.json, chroma/, bm25/
   CHECKIT_DATA/data/rag/processed/employment_basic_v004/ chunks.jsonl 등
   ```

   검색 코드가 시작할 때 `chunks.jsonl` 해시와 `index_manifest.json`, chroma 문서 수(503), tokenizer 코드가 맞는지 검사하므로 **두 폴더를 같은 컴퓨터에서 함께** 받아야 합니다.

3. **백엔드 `.env`** (비밀값은 각자 넣기, 올리지 않음)

   ```dotenv
   CHECKIT_CLASSIFIER_ENABLED=true
   CHECKIT_RAG_ENABLED=true
   CHECKIT_GEMINI_API_KEY=본인 키
   CHECKIT_GEMINI_MODEL=gemini-3.6-flash
   CHECKIT_GEMINI_TIMEOUT_SECONDS=150
   ```

   - 모델은 키로 쓸 수 있는 목록(`GET https://generativelanguage.googleapis.com/v1beta/models`) 중 일반 Flash를 씁니다. lite는 인용을 글자 그대로 옮기는 데 약하고, pro는 느리며, preview는 자주 몰립니다. 2026-11-25에는 `3.8-flash`·`3.7-flash`가 503(몰림)이었고 `3.6-flash`·`3.5-flash`가 응답했습니다. `gemini-2.5-flash`는 새 사용자에게 막혀 있습니다(404).

4. **백엔드 실행** (분석 환경의 Python으로)

   ```bash
   cd ../CHECKIT_BE
   ../.venv-ai/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

   처음 실행하면 분류 모델과 법령 검색 모델(BGE-M3, 약 2.3GB)을 Hugging Face에서 받습니다. 메모리 8GB 컴퓨터에서는 다른 앱을 닫아 두는 게 좋습니다.

## 로그인

- **방법**: 카카오·구글(소셜), 이메일. 이메일은 가입 → 인증 메일의 링크(`/auth/verify#token=…`) → 로그인 순서이고, 인증 후 자동 로그인하지 않습니다. 비밀번호는 12~128자입니다.
- 인증 안 한 계정으로 로그인하면 안내와 함께 [인증 메일 다시 받기]를 보여줍니다.
- 인증 링크의 토큰은 주소 `#` 뒤에 있어 서버 기록에 남지 않고, 화면이 읽은 뒤 주소창에서도 지웁니다. 토큰은 한 번만 쓸 수 있습니다.
- **로그인 확인 중**: 첫 로그인 확인(`/api/auth/me`)이 끝나기 전에는 페이지 대신 "로그인 상태를 확인하고 있어요"를 보여줍니다(0.3초 안에 끝나면 표시하지 않음, 5초가 넘으면 "늦어지고 있어요" 추가). `src/components/AuthGate.tsx`
- **로그인 만료**: 쓰던 중 API가 401을 주면 헤더 아래에 "로그인이 만료됐어요 [다시 로그인]"을 띄우고, 다시 로그인하면 보던 화면으로 돌아갑니다. 글자 확인 화면은 고친 내용을 바로 날리지 않고 그 자리에 둡니다. 로그인 확인·로그인 요청 자체의 401은 만료로 보지 않습니다.

## 오류 문구 규칙

화면에 보여줄 오류 문구는 `src/api/messages.ts`의 `errorMessage(err, '저장하지', { 코드별 문구 })`로 만듭니다.

- **두 줄**: 1줄 무슨 일이 있었는지 / 2줄 어떻게 하면 되는지. 줄바꿈 `\n`을 쓰고 화면은 `white-space: pre-line`으로 보여줍니다.
- **공통 상황은 어디서나 같은 말**

| 상황 | 문구 |
| --- | --- |
| 네트워크 오류 | ○○하지 못했어요. / 인터넷 연결을 확인하고 다시 시도해 주세요. |
| 백엔드가 꺼져 있음(프록시 오류) | 서버에 연결하지 못했어요. / 잠시 후 다시 시도해 주세요. |
| 요청 과다(429) | 요청이 너무 잦아요. / 1분쯤 뒤에 다시 시도해 주세요. |
| 로그인 만료(401) | 로그인이 만료됐어요. / 다시 로그인한 뒤 시도해 주세요. |
| CSRF 실패 | 보안 확인에 실패했어요. / 페이지를 새로고침한 뒤 다시 시도해 주세요. |
| 서버 오류(5xx) | 서버가 잠시 응답하지 않아요. / 잠시 후 다시 시도해 주세요. |
| 그 밖의 오류 | ○○하지 못했어요. / 잠시 후 다시 시도해 주세요. |

- 기능에만 있는 오류(예: 저장의 `PERSONAL_DATA_DETECTED`)는 코드별 문구로 따로 넘기고, 공통 처리보다 먼저 적용됩니다.

## 백엔드 연동

백엔드 인증 쿠키가 `SameSite=Lax`이고 POST 요청의 Origin으로 CSRF를 검사하므로, 브라우저는 **상대 경로 `/api`**를 호출하고 개발 서버가 백엔드로 전달합니다([백엔드 팀 접속 안내](../CHECKIT_BE/docs/team-server-access.md)).

- 프록시는 Origin을 바꾸지 않고(`changeOrigin: false`) `/api` 경로도 그대로 둡니다([`vite.config.ts`](vite.config.ts)).
- `vite.config.ts`의 `optimizeDeps.include`에는 파일을 올릴 때 처음 불러오는 라이브러리(pdf.js·onnxruntime-web·heic-to)를 넣어 둡니다. 빠지면 개발 서버가 도중에 다시 묶으면서 페이지를 새로고침해 고른 파일이 사라집니다.
- 백엔드 `.env`에 프론트 주소를 넣고 백엔드를 재시작해야 POST 요청과 소셜 로그인이 동작합니다.

  ```dotenv
  CHECKIT_ALLOWED_ORIGINS=["http://localhost:8000","http://localhost:5173"]
  CHECKIT_OAUTH_FRONTEND_COMPLETE_URL=http://localhost:5173/auth/complete
  ```

- 이메일 가입·인증 메일을 쓰려면 백엔드에 메일 발송 설정(`CHECKIT_SMTP_*`)과 인증 화면 주소가 필요합니다. 없으면 가입할 때 "지금은 이메일 가입을 쓸 수 없어요"가 나옵니다. 이메일 로그인 자체는 이미 인증한 계정이면 설정 없이도 됩니다.

  ```dotenv
  CHECKIT_VERIFICATION_PAGE_URL=http://localhost:5173/auth/verify
  ```

- 로컬 백엔드는 `CHECKIT_ENVIRONMENT=development`, `CHECKIT_COOKIE_SECURE=false`로 실행합니다.
- `localhost`와 `127.0.0.1`을 섞어 쓰면 쿠키가 공유되지 않습니다. **`localhost`로 통일**합니다.
- 다른 백엔드 주소(예: 팀 공유 서버)를 쓰려면 `.env.example`을 `.env`로 복사하고 `CHECKIT_API_PROXY_TARGET`을 바꿉니다. `.env`는 올리지 않습니다.

API 호출은 `src/api/client.ts`가 처리합니다(쿠키 포함, POST·DELETE에 `X-CSRF-Token`, 오류 형식 변환). 요청·응답 타입은 `src/types/api.ts`에 모았고, 기준은 [백엔드 API 문서](../CHECKIT_BE/docs/api-reference.md)입니다.

| API | 쓰는 곳 |
| --- | --- |
| `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/oauth/{provider}/start` | 로그인 |
| `POST /api/auth/login`, `POST /api/auth/signup` | 이메일 로그인·가입 |
| `POST /api/auth/email-verification/resend`, `POST /api/auth/email-verification/confirm` | 인증 메일 다시 받기, 이메일 인증 |
| `POST /api/contracts` | 개인정보를 가린 계약서 텍스트 저장 |
| `GET /api/contracts` | 내 리포트 목록 (카드의 결과 개수는 계약서별 상세를 한 번 더 불러와 채움) |
| `GET /api/contracts/{id}` | 리포트 상세 |
| `DELETE /api/contracts/{id}` | 리포트 삭제 (목록·상세) |
| `POST /api/analysis/contracts/{id}/jobs`, `GET .../jobs/{job_id}` | 분석 시작·진행 확인 (`ANALYSIS_LIVE`가 켜져 있을 때, **Gemini 사용**) |

> **분석 결과 구조는 아직 확정되지 않았습니다**(백엔드 "Gemini 출력 결과 초안" 기준). 바뀌면 `src/types/api.ts`와 `src/report/view.ts`를 주로 고칩니다. Gemini 무료 사용량을 아끼려면 화면 확인은 예시 계약서(`sample-3`)로 합니다.
>
> **Gemini 무료 사용량으로 보낸 내용은 구글이 서비스 개선에 쓸 수 있습니다.** 우리 DB에서 삭제해도 이미 보낸 내용은 지울 수 없으니, 실제 계약서는 개인정보를 꼼꼼히 가린 뒤 점검합니다.

## 개발용 예시 데이터

개발 서버(`npm run dev`)에서는 내 리포트 목록 아래에 **예시 리포트 3개**가 나옵니다. 내용은 화면 확인용으로 만든 것이고 형식만 백엔드 결과와 같습니다(`src/mocks/analysis.ts`). 프로덕션 빌드에는 나오지 않습니다.

| 주소 | 확인할 수 있는 것 |
| --- | --- |
| `/reports/sample-1` | 결과 화면 (카페, 불명확 항목 포함) |
| `/reports/sample-2` | 결과 화면 (편의점) |
| `/reports/sample-3` | 분석 전 화면 → 조건 입력 → 진행 → 결과 (서버 호출 없음) |
| `/reports/sample-3?mock=fail` | 'AI 판단' 단계에서 실패하는 경우 |

예시 리포트를 지우면 API를 부르지 않고 화면에서만 빠집니다(새로고침하면 다시 나옴).

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
    │   ├── client.ts          # 공통 API 클라이언트 (쿠키·CSRF·오류, 401 만료 알림)
    │   ├── messages.ts        # 오류 문구 규칙 (공통 상황 문구, errorMessage)
    │   ├── auth.ts            # 이메일 로그인·가입·인증
    │   ├── contracts.ts       # 계약서 저장·목록·상세·삭제
    │   └── analysis.ts        # 분석 시작·진행 확인, 실패 문구
    ├── analysis/
    │   ├── runner.ts          # 실제/예시 분석 고르기(ANALYSIS_LIVE), 진행 중 job_id 기억
    │   └── context.ts         # 계약서에서 기준 날짜 찾기
    ├── auth/                  # 로그인 상태(useAuth: 확인 중·만료·이메일 로그인), 로그인 후 이동 경로 검증
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
    ├── components/            # Header, Footer, ConfirmDialog, DeleteReportButton,
    │                          # AuthGate(로그인 확인 중·만료 안내), 아이콘
    └── pages/                 # 화면별 컴포넌트·CSS (ReviewPage: 글자 확인, PrivacyStep: 개인정보 가리기,
                               # AnalysisPanel: 분석 시작·진행, EmailVerifyPage: 이메일 인증)
```

## 사용한 외부 라이브러리·모델

| 이름 | 용도 | 라이선스 |
| --- | --- | --- |
| pdfjs-dist 4.10.38 | PDF 글자 꺼내기·미리보기 | Apache-2.0 |
| onnxruntime-web 1.31.1 | PaddleOCR 모델 실행 | MIT |
| PaddleOCR 모델 (`PP-OCRv6_medium_det`, `korean_PP-OCRv5_mobile_rec`) | 글자 영역 찾기·한국어 인식 | Apache-2.0 |
| heic-to 1.6.7 | HEIC → JPG 변환 | **LGPL-3.0** (별도 파일로 분리해 불러옴. 서비스 공개 전 고지 방법 확인 필요) |

## 남은 작업

- 백엔드·데이터에 요청할 것
  - **인용 검사**: 필수 기재사항 하나의 인용만 틀려도 Gemini 응답 전체를 버려 분석이 실패합니다(`INVALID_DOCUMENT_EVIDENCE`). 그 항목만 '확인 필요'로 처리하거나 재시도를 늘려야 합니다. 긴 계약서일수록 자주 걸립니다.
  - **최저임금 항목 보류**: 임금 조항 검색에 '2026년 적용 최저임금 고시'가 들어오지 않아 항상 보류됩니다. `MINIMUM_WAGE` 후보에는 고시를 근거 후보로 항상 넣어야 합니다.
  - **법령 시행일**: 인덱스의 근로기준법 조문 시행일이 개정일(2026-10-08)로 일괄 저장돼 있습니다. 조문별 실제 시행일로 바로잡히면 기준 날짜를 다시 근로 시작일로 채울 수 있습니다(`LAW_DATA_DATE` 제거).
  - 로컬 메일 발송 설정, 진행 중인 분석 조회 API, 목록 응답에 결과 개수, 판단 보류·불명확 이유 코드, `/api/auth/me` 응답 속도
- 분석 진행 중 화면을 나갔다 오면 경과 시간이 0초부터 다시 세는 문제
- 헤더 링크로 글자 확인 화면을 나가면 경고 없이 고친 내용이 사라지는 문제(`BrowserRouter`라 `useBlocker`를 못 씀)
- 배포 시 PaddleOCR 모델 파일 호스팅
- 서비스 공개 전 확인: Gemini 이용 조건과 전송 동의 문구, heic-to(LGPL-3.0) 고지, 카카오·구글 버튼 디자인 가이드

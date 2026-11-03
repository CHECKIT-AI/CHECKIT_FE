# CheckIt Frontend

React + TypeScript + Vite 기반 CheckIt 프론트엔드입니다. 지금은 기본 세팅만 되어 있고, 기능은 아직 없습니다.

## 실행

Node.js 20.19 이상(권장: 22 이상)이 필요합니다.

```bash
npm install
npm run dev
```

http://localhost:5173 에서 열립니다.

## 백엔드 연동

브라우저는 **상대 경로 `/api`** 를 호출하고, 개발 서버가 백엔드(기본값 `http://localhost:8000`)로 프록시합니다.
백엔드 인증 쿠키가 `SameSite=Lax` 라서 이렇게 같은 출처로 맞추는 방식을 권장합니다
([CHECKIT_BE/docs/team-server-access.md](https://github.com/CHECKIT-AI/CHECKIT_BE/blob/develop/docs/team-server-access.md) 참고).

1. 백엔드 `.env` 의 `CHECKIT_ALLOWED_ORIGINS` 에 `http://localhost:5173` 을 추가하고 백엔드를 재시작합니다.
2. 다른 백엔드 주소를 쓰려면 `.env.example` 을 `.env` 로 복사한 뒤 `CHECKIT_API_PROXY_TARGET` 을 바꿉니다.
3. `localhost` 와 `127.0.0.1` 을 섞어 쓰면 쿠키가 공유되지 않으므로 `localhost` 로 통일합니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint 검사 |

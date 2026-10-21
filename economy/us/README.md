# USAPI — US Economic Indicators

미국 경제지표를 **등록·API 키 없이 공개된 공식 자료**로만 모아 보여 주는 정적 웹사이트입니다.
DB 없이 지표별 JSON 파일이 곧 저장소이며, GitHub Actions가 매일 갱신해 InfinityFree에 FTP로 올립니다.

- 화면: React + Vite + Recharts (`src/`)
- 수집: Node.js (`scripts/`), 설정: `config/indicators.json`, 위험 규칙: `config/risk-rules.json`
- 데이터: `public/data/` (summary → categories → series 순으로 필요한 것만 로드)
- 기록: `reports/` (제외 지표, 원천 점검, 수집·배포 로그)

## 명령

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run verify:sources` | 각 공식 원천에 무등록 접속·파싱 점검 |
| `npm run update:data` | 수집(이력 없으면 전체 구축, 있으면 최근 구간) → JSON 생성 |
| `npm run update:full` | 전체 이력 재수집 |
| `npm run generate:json` | API 호출 없이 위험 규칙 등만 다시 계산 |
| `npm test` | 위험 깃발·병합·파서 단위테스트 |
| `npm run build` | `dist/` 생성 |
| `npm run deploy:ftp` | `dist/`를 FTP 업로드 (바뀐 파일만) |

## 자동 갱신 (GitHub Actions)

저장소 루트의 `.github/workflows/economy-us-daily.yml` (실행 위치: `economy/us`)

- 매일 KST 03:17 실행, KST 06:17에 한 번 더 확인(오늘 이미 성공했으면 건너뜀)
- Actions 탭 → *economy/us — daily data update & deploy* → **Run workflow** 로 수동 실행 (전체 재수집·배포 여부 선택)
- 수집 결과는 저장소에 자동 커밋되어 다음 실행 때 이력으로 재사용
- 실행 결과 요약은 각 실행 화면의 Summary에 표시, 실패 시 GitHub가 이메일로 알림

### 필요한 설정 (최초 1회)

Settings → Secrets and variables → Actions

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `FTP_HOST` | InfinityFree FTP 호스트 (예: `ftpupload.net`) |
| Secret | `FTP_USER` | FTP 사용자명 (예: `if0_12345678`) |
| Secret | `FTP_PASSWORD` | FTP 비밀번호 (호스팅 계정 비밀번호) |
| Secret | `FTP_REMOTE_DIR` | 업로드 폴더 (예: `/htdocs`) |
| Variable (선택) | `SITE_URL` | 배포 후 확인할 사이트 주소 (예: `https://usapi.com`) |

Settings → Actions → General → Workflow permissions → **Read and write permissions**

## 위험 깃발

🟢 정상 · 🟡 주의 · 🔴 위험 · ⚪ 판단불가. 거시경제 위험도이며 매수·매도 추천이 아닙니다.
규칙은 `config/risk-rules.json`에서 수정하고 `npm run generate:json`으로 바로 반영할 수 있습니다.

## 운영 주의

- BLS 무등록 API는 하루 25회 제한 — 매일 실행은 1~2회만 사용합니다.
- 연준 Data Download Program은 퇴역이 예고되어 있습니다. 경로가 막히면 해당 지표는 이전 데이터를 유지하고 '업데이트 지연'으로 표시됩니다.
- 원천 수집이 실패해도 기존 JSON을 빈 값으로 덮어쓰지 않습니다.
- InfinityFree 무료 호스팅: 파일당 10MB 이하(현재 최대 약 0.4MB), FTP 업로드는 바뀐 파일만 전송합니다.
- GitHub는 오래 활동이 없는 저장소의 예약 실행을 멈출 수 있으나, 이 워크플로는 매일 데이터 커밋을 남깁니다.

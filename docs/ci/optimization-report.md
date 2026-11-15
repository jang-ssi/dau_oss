# CI 최적화 전후 비교 리포트

- 측정일: 2026-11-16
- 대상 PR: [#22](https://github.com/jang-ssi/dau_oss/pull/22)
- 측정 워크플로우: [Cache Benchmark](../../.github/workflows/cache-benchmark.yml)

## 1. 무엇을 바꿨나

| 항목 | 최적화 전 ([#20](https://github.com/jang-ssi/dau_oss/pull/20)) | 최적화 후 ([#22](https://github.com/jang-ssi/dau_oss/pull/22)) |
|------|------------------|------------------|
| 설치 단계 | `setup-node` + `npm ci`를 5개 Job에 복사 | Composite Action 1개(`setup-node-deps`)를 호출 |
| 테스트 Job | `ci.yml` 안에 직접 정의 | Reusable Workflow(`reusable-test.yml`)를 매트릭스로 호출 |
| 의존성 | 실행할 때마다 `npm ci` | `package-lock.json` 해시 키로 `node_modules` 캐시, 적중 시 `npm ci` 생략 |
| 매트릭스 | OS 3 × Node 2 = 6개 (전부 필수) | 5개 필수 + Node 26 실험 1개 (`include`/`exclude`) |
| 배포 | main 푸시마다 항상 실행 | 변경 경로와 이벤트에 따라 선택 실행 |

워크플로우 YAML에서 설치 관련 줄 수는 5곳 × 4줄 = 20줄에서 호출 4곳 × 1줄로 줄었습니다.

## 2. 측정 방법

`cache-benchmark.yml`은 같은 커밋에서 OS마다 Job 두 개를 나란히 실행합니다.

- `no-cache`: 캐시를 끄고 매번 `npm ci`
- `cache`: `node_modules` 캐시 사용

비교 구간은 Composite Action이 출력하는 `install-ms`, 즉 **캐시 복원 + `npm ci`에 걸린 시간**입니다. Job 전체 시간은 러너 배정과 checkout 시간의 편차가 커서 비교 기준으로 쓰지 않았습니다.

같은 워크플로우를 세 번 실행했습니다.

| 실행 | 캐시 상태 | 링크 |
|------|-----------|------|
| 1회차 | miss (캐시 생성) | [attempt 1](https://github.com/jang-ssi/dau_oss/actions/runs/43727690510/attempts/1) |
| 2회차 | hit | [attempt 2](https://github.com/jang-ssi/dau_oss/actions/runs/43727690510/attempts/2) |
| 3회차 | hit | [attempt 3](https://github.com/jang-ssi/dau_oss/actions/runs/43727690510/attempts/3) |

## 3. 결과: 의존성 준비 시간

### 원본 측정값 (ms)

| OS | 모드 | 1회차 | 2회차 | 3회차 |
|----|------|-------|-------|-------|
| ubuntu-latest | no-cache | 1,595 | 1,295 | 2,322 |
| ubuntu-latest | cache | 2,674 (miss) | 1,275 (hit) | 897 (hit) |
| macos-latest | no-cache | 1,389 | 3,241 | 2,770 |
| macos-latest | cache | 3,371 (miss) | 1,735 (hit) | 1,275 (hit) |
| windows-latest | no-cache | 6,456 | 9,619 | 6,733 |
| windows-latest | cache | 7,043 (miss) | 2,279 (hit) | 1,285 (hit) |

### 전후 비교

- 전: `no-cache` 3회 평균
- 후: `cache` 적중 2회 평균

| OS | 캐시 전 | 캐시 후 | 단축 | 개선률 |
|----|---------|---------|------|--------|
| ubuntu-latest | 1.74s | 1.09s | 0.65s | **37.5%** |
| macos-latest | 2.47s | 1.51s | 0.96s | **39.0%** |
| windows-latest | 7.60s | 1.78s | 5.82s | **76.6%** |

개선률 = (전 − 후) ÷ 전 × 100

## 4. 결과: CI 워크플로우 전체

같은 매트릭스(7개 Job)의 Job 실행 시간 합계입니다. [CI 실행](https://github.com/jang-ssi/dau_oss/actions/runs/43727690437)을 세 번 돌렸습니다.

| 실행 | 캐시 | Job 시간 합계 |
|------|------|---------------|
| 1회차 | miss | 122s |
| 2회차 | hit | 115s |
| 3회차 | hit | 102s |

캐시 적중 평균 108.5초로, 캐시가 없던 1회차보다 **11.1%** 짧습니다. 다만 같은 Job이 실행마다 5~21초로 흔들릴 만큼 러너 편차가 커서, 이 수치는 3절의 구간 측정보다 신뢰도가 낮습니다.

## 5. 해석

- **Windows에서 효과가 가장 큽니다.** `npm ci`가 작은 파일 수천 개를 쓰는 작업이라 파일 시스템이 느린 Windows 러너에서 6~10초가 걸리고, 캐시는 이를 압축 파일 하나의 복원으로 바꿉니다.
- **캐시가 miss인 첫 실행은 오히려 느립니다.** 캐시 조회 시간이 더해져 1회차의 `cache` Job은 `no-cache`보다 0.6~2.0초 길었습니다. `package-lock.json`이 바뀐 직후 한 번은 이 비용을 냅니다.
- **절대 시간은 작습니다.** 의존성이 적은 프로젝트라 Job당 0.7~5.8초 단축입니다. 의존성이 늘수록 `npm ci` 시간은 커지고 캐시 복원 시간은 완만하게 늘기 때문에 효과는 커집니다.
- **표본이 작습니다.** OS별 2~3회 측정이라 경향을 보는 용도입니다. 정밀한 비교가 필요하면 Cache Benchmark를 `workflow_dispatch`로 여러 번 더 실행해 표본을 늘립니다.

## 6. 선택적 배포로 줄인 실행

`deploy-selective.yml`은 변경 경로를 보고 Build와 Deploy를 건너뜁니다.

| 상황 | Build | Deploy (preview) | Deploy (production) |
|------|-------|------------------|---------------------|
| PR, 앱 코드 변경 | 실행 | 실행 | 건너뜀 |
| PR, 문서·워크플로우만 변경 | 건너뜀 | 건너뜀 | 건너뜀 |
| main 푸시, 앱 코드 변경 | 실행 | 건너뜀 | 실행 |
| main 푸시, 문서만 변경 | 건너뜀 | 건너뜀 | 건너뜀 |

PR #22는 워크플로우만 바꿨기 때문에 [세 Job이 모두 건너뛰어졌고](https://github.com/jang-ssi/dau_oss/actions/runs/43727690422) 변경 감지와 요약 Job만 7초 동안 실행됐습니다.

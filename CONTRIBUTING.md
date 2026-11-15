# 기여 가이드 (CONTRIBUTING)

dau_oss에 관심을 가져 주셔서 감사합니다. 이 문서는 이슈 등록부터 PR 머지까지의 흐름을 설명합니다.
참여하는 모든 분은 [행동 강령](CODE_OF_CONDUCT.md)을 따릅니다.

## 1. 시작하기

```bash
git clone git@github.com:jang-ssi/dau_oss.git
cd dau_oss
npm ci
npm run dev
```

- Node.js 20.19 이상(권장 22 LTS)이 필요합니다.
- 자세한 환경 구성은 Wiki의 [Getting Started](https://github.com/jang-ssi/dau_oss/wiki/Getting-Started)를 참고하세요.

## 2. 브랜치 전략 (Feature Branch)

`main`은 항상 배포 가능한 상태를 유지합니다. 모든 변경은 `main`에서 분기한 짧은 수명의 브랜치에서 작업하고 PR로 머지합니다.

| 접두사 | 용도 | 예시 |
|--------|------|------|
| `feat/` | 기능 추가 | `feat/counter-reset` |
| `fix/` | 버그 수정 | `fix/burndown-date` |
| `docs/` | 문서 | `docs/adr-template` |
| `ci/` | CI/CD 워크플로우 | `ci/cache-node-modules` |
| `chore/` | 설정, 잡무 | `chore/pr-template` |
| `refactor/` | 동작 변화 없는 구조 개선 | `refactor/format-utils` |

- 브랜치 하나에는 하나의 목적만 담습니다.
- 머지된 브랜치는 삭제합니다.

## 3. 커밋 메시지 (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `type`: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `ci`, `chore`, `perf`, `build`, `revert`
- `scope`는 선택입니다. 예: `ci`, `docs`, `app`
- `subject`는 명령형 현재 시제로 50자 이내, 마침표 없이 씁니다.
- 호환성을 깨는 변경은 `type!:` 또는 footer의 `BREAKING CHANGE:`로 표시합니다.
- 이슈 연결은 footer에 `Closes #12`처럼 적습니다.

예시:

```
feat(app): 카운터 초기화 버튼 추가

Closes #12
```

## 4. Pull Request 절차

1. 이슈를 먼저 확인하거나 새로 등록합니다. (이슈 템플릿 사용)
2. 브랜치를 만들고 작업한 뒤 로컬에서 아래 검증을 통과시킵니다.
   ```bash
   npm run lint
   npm run build
   ```
3. PR 제목도 Conventional Commits 형식으로 작성합니다.
4. 리뷰어의 `[MUST]` 의견은 모두 반영하거나 합의한 뒤 머지합니다. 태그 기준은 [리뷰 가이드](docs/REVIEW_GUIDE.md)를 참고하세요.
5. 머지는 **Squash merge**를 기본으로 합니다.

## 5. 이슈 등록

- 버그: 재현 절차, 기대 결과, 실제 결과, 환경을 적어 주세요.
- 기능 제안: 해결하려는 문제와 대안을 함께 적어 주세요.
- 방향이 열려 있는 큰 제안은 이슈 대신 [Discussions](https://github.com/jang-ssi/dau_oss/discussions)에 RFC로 올려 주세요.

## 6. 라이선스

기여한 내용은 이 저장소의 [MIT License](LICENSE)로 배포되는 데 동의한 것으로 봅니다.

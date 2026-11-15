# 기술 결정 기록 (ADR)

Architecture Decision Record는 **왜 그렇게 결정했는지**를 남기는 짧은 문서입니다. 코드는 결과만 보여 주고, 버려진 대안과 당시의 제약은 보여 주지 않기 때문에 따로 기록합니다.

## 언제 쓰는가

- 되돌리기 어려운 결정 (프레임워크, 라이선스, 배포 방식)
- 팀 전체의 작업 방식에 영향을 주는 결정 (브랜치 전략, 테스트 도구)
- 여러 대안을 두고 논의가 있었던 결정

## 작성 절차

1. [template.md](template.md)를 복사해 `NNNN-kebab-case-title.md`로 저장합니다. 번호는 마지막 번호 + 1입니다.
2. 상태를 `Proposed`로 두고 PR을 엽니다. 큰 결정은 먼저 [Discussions의 RFC](../DISCUSSIONS.md)로 의견을 모읍니다.
3. 리뷰에서 합의되면 상태를 `Accepted`로 바꾸고 머지합니다.
4. 결정이 바뀌면 기존 문서는 지우지 않고 상태를 `Superseded by ADR-NNNN`으로 바꾼 뒤 새 ADR을 씁니다.

## 상태

`Proposed` → `Accepted` → (`Deprecated` | `Superseded`)

## 목록

| 번호 | 제목 | 상태 | 날짜 |
|------|------|------|------|
| [0001](0001-record-architecture-decisions.md) | ADR로 기술 결정을 기록한다 | Accepted | 2026-11-15 |
| [0002](0002-feature-branch-and-squash-merge.md) | Feature 브랜치 전략과 Squash merge를 사용한다 | Accepted | 2026-11-15 |
| [0003](0003-vitest-for-unit-tests.md) | 단위 테스트 도구로 Vitest를 사용한다 | Accepted | 2026-11-15 |

# 칸반 GitHub Project 설정 가이드

## 1. 백로그 생성 (자동)
1. Actions 탭 → **Seed Backlog** → Run workflow
2. 라벨 15개, 마일스톤 2개, 이슈 15개가 만들어집니다. 여러 번 실행해도 중복 생성되지 않습니다.

| 구분 | 내용 |
|------|------|
| `type:` | feature, bug, docs, chore |
| `priority:` | P0(즉시), P1(높음), P2(보통) |
| `area:` | frontend, backend, design |
| `sp:` | 스토리 포인트 1/2/3/5/8 |
| Sprint 1: 기본 장부 | 2026-10-19 ~ 11-01, 이슈 8개 (30pt) |
| Sprint 2: 공유·모바일 | 2026-11-02 ~ 11-15, 이슈 5개 (24pt) |
| 마일스톤 없음 | 대시보드, 엑셀 (Backlog에 둠) |

## 2. Project 만들기 (직접)
1. 저장소 상단 **Projects** → **New project** (또는 https://github.com/users/jang-ssi/projects → New project)
2. 템플릿은 **Board**를 고르고 이름은 `함께장부 스프린트 보드`로 합니다.
3. 오른쪽 위 `⋯` → **Settings** → **Status** 필드를 열고 옵션을 아래 5개로 바꿉니다.
   `Backlog` → `To Do` → `In Progress` → `Review` → `Done`
4. **Workflows**(왼쪽 메뉴)에서 아래를 켭니다.
   - *Item added to project* → Status = `Backlog`
   - *Item closed* → Status = `Done`
   - *Pull request merged* → Status = `Done`
   - *Auto-add to project*: 저장소 `jang-ssi/dau_oss`, 필터 `is:issue` 추가
5. 보드 아래 **+ Add item**에서 `#`을 입력해 이슈를 한꺼번에 추가합니다. (자동 추가를 켜 두었다면 기존 이슈는 `Add item`으로 한 번만 추가)
6. 이슈를 이렇게 배치합니다: Sprint 1 이슈 → `To Do`, 마일스톤 없는 이슈 → `Backlog`.
7. 보기 설정: Board 보기는 Status 컬럼 기준이라 Group by가 없습니다. `+ New view`로 **Table** 보기를 하나 더 만들고, 보기 이름 옆 `⌄` 메뉴의 **Group by → Milestone**을 지정한 뒤 **Milestone**, **Labels**, **Assignees** 필드를 표시하면 스프린트별로 볼 수 있습니다.
8. 저장소 **Settings → General → Features**에서 Issues가 켜져 있어야 합니다.

## 3. 스프린트 운영 규칙
- 스프린트 시작일에 `To Do`로 옮긴 이슈만 이번 스프린트 범위로 봅니다.
- 작업 시작 시 담당자(Assignee)를 지정하고 `In Progress`로 옮깁니다. (Cycle Time의 시작 기준)
- PR을 올리면 `Review`, 병합하면 `Done`이 됩니다. PR 본문에 `Closes #번호`를 쓰면 이슈도 함께 닫힙니다.
- 스프린트가 끝나면 Sprint Analytics 리포트(`docs/sprint/report.md`)로 Velocity를 확인하고 다음 스프린트 계획에 반영합니다.

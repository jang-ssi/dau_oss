# ADR-0003: 단위 테스트 도구로 Vitest를 사용한다

- 상태: Accepted
- 날짜: 2026-11-15
- 결정자: @jang-ssi

## 배경

CI에서 Lint와 Test를 자동 실행하려면 테스트 러너가 필요하다. 프로젝트는 Vite + TypeScript(ESM) 기반이다.

## 검토한 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| Jest | 자료가 가장 많음 | ESM·TypeScript 변환 설정이 따로 필요 |
| Node.js 내장 `node:test` | 의존성 없음 | TypeScript, 커버리지, watch 경험이 제한적 |
| Vitest | Vite 설정을 그대로 사용, TypeScript·ESM 기본 지원, Jest 호환 API | Vite 버전과 맞춰 올려야 함 |

## 결정

Vitest를 사용한다. 빌드 도구와 변환 파이프라인을 공유하므로 추가 설정이 거의 없다.

## 결과

- 좋아지는 점: `npm test` 한 줄로 로컬과 CI에서 같은 방식으로 실행된다.
- 감수하는 점: Vite 메이저 업그레이드 때 Vitest도 함께 확인해야 한다.
- 후속 작업: 컴포넌트 테스트가 필요해지면 jsdom 환경 추가를 별도 ADR로 검토한다.

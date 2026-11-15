export const MAX_COUNT = 999

/** 카운터를 1 올린다. 상한(MAX_COUNT)을 넘지 않는다. */
export function increment(count: number): number {
  return clampCount(count + 1)
}

/** 값을 0 이상 MAX_COUNT 이하의 정수로 맞춘다. */
export function clampCount(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(MAX_COUNT, Math.max(0, Math.trunc(value)))
}

/** 버튼에 표시할 문구를 만든다. 천 단위 구분 기호를 넣는다. */
export function formatCount(count: number): string {
  return `Count is ${clampCount(count).toLocaleString('en-US')}`
}

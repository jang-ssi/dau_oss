import { describe, expect, it } from 'vitest'
import { clampCount, formatCount, increment, MAX_COUNT } from './counter'

describe('increment', () => {
  it('1씩 증가한다', () => {
    expect(increment(0)).toBe(1)
    expect(increment(41)).toBe(42)
  })

  it('상한을 넘지 않는다', () => {
    expect(increment(MAX_COUNT)).toBe(MAX_COUNT)
  })
})

describe('clampCount', () => {
  it('음수는 0으로 맞춘다', () => {
    expect(clampCount(-5)).toBe(0)
  })

  it('소수점 이하는 버린다', () => {
    expect(clampCount(3.9)).toBe(3)
  })

  it('NaN은 0으로 처리한다', () => {
    expect(clampCount(Number.NaN)).toBe(0)
  })
})

describe('formatCount', () => {
  it('버튼 문구를 만든다', () => {
    expect(formatCount(7)).toBe('Count is 7')
  })

  it('범위를 벗어난 값은 보정해서 표시한다', () => {
    expect(formatCount(5000)).toBe(`Count is ${MAX_COUNT}`)
  })
})

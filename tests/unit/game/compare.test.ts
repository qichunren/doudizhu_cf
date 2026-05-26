import { describe, it, expect } from 'vitest'
import { CardType } from '../../../src/game/card'
import { canBeat, isBomb } from '../../../src/game/compare'

function g(cardType: CardType, rank: number, length = 1) {
  return { cards: [], cardType, rank, length }
}

describe('canBeat', () => {
  it('allows any valid card when no previous (opening play)', () => {
    expect(canBeat(g(CardType.Single, 3), null)).toBe(true)
    expect(canBeat(g(CardType.Pair, 5), null)).toBe(true)
    expect(canBeat(g(CardType.Bomb, 7), null)).toBe(true)
    expect(canBeat(g(CardType.Rocket, 17), null)).toBe(true)
    expect(canBeat(g(CardType.Straight, 7, 5), null)).toBe(true)
  })

  it('rejects Invalid card when no previous', () => {
    expect(canBeat(g(CardType.Invalid, 0), null)).toBe(false)
  })

  it('Rocket beats everything', () => {
    const rocket = g(CardType.Rocket, 17)
    expect(canBeat(rocket, g(CardType.Bomb, 7))).toBe(true)
    expect(canBeat(rocket, g(CardType.Single, 14))).toBe(true)
    expect(canBeat(rocket, g(CardType.Straight, 14, 5))).toBe(true)
  })

  it('Bomb beats non-bomb, non-rocket', () => {
    const bomb = g(CardType.Bomb, 8)
    expect(canBeat(bomb, g(CardType.Single, 14))).toBe(true)
    expect(canBeat(bomb, g(CardType.Pair, 2))).toBe(true)
    expect(canBeat(bomb, g(CardType.Straight, 14, 5))).toBe(true)
  })

  it('Bomb cannot beat Rocket', () => {
    expect(canBeat(g(CardType.Bomb, 8), g(CardType.Rocket, 17))).toBe(false)
  })

  it('higher Bomb beats lower Bomb', () => {
    expect(canBeat(g(CardType.Bomb, 9), g(CardType.Bomb, 8))).toBe(true)
    expect(canBeat(g(CardType.Bomb, 7), g(CardType.Bomb, 8))).toBe(false)
  })

  it('same rank Bomb cannot beat itself', () => {
    expect(canBeat(g(CardType.Bomb, 8), g(CardType.Bomb, 8))).toBe(false)
  })

  it('different types cannot beat (non-bomb)', () => {
    expect(canBeat(g(CardType.Single, 14), g(CardType.Pair, 2))).toBe(false)
    expect(canBeat(g(CardType.Triple, 8), g(CardType.Straight, 7, 5))).toBe(false)
  })

  it('same type, mismatched length cannot beat', () => {
    expect(canBeat(g(CardType.Straight, 10, 5), g(CardType.Straight, 9, 4))).toBe(false)
    expect(canBeat(g(CardType.DoubleStraight, 6, 3), g(CardType.DoubleStraight, 5, 2))).toBe(false)
  })

  it('same type, same length: higher rank beats lower', () => {
    expect(canBeat(g(CardType.Single, 14), g(CardType.Single, 3))).toBe(true)
    expect(canBeat(g(CardType.Single, 3), g(CardType.Single, 14))).toBe(false)
    expect(canBeat(g(CardType.Pair, 10), g(CardType.Pair, 9))).toBe(true)
    expect(canBeat(g(CardType.Straight, 10, 5), g(CardType.Straight, 7, 5))).toBe(true)
  })

  it('same type, same length, same rank cannot beat', () => {
    expect(canBeat(g(CardType.Single, 8), g(CardType.Single, 8))).toBe(false)
    expect(canBeat(g(CardType.Pair, 5), g(CardType.Pair, 5))).toBe(false)
  })
})

describe('isBomb', () => {
  it('returns true for Bomb', () => {
    expect(isBomb(CardType.Bomb)).toBe(true)
  })

  it('returns true for Rocket', () => {
    expect(isBomb(CardType.Rocket)).toBe(true)
  })

  it('returns false for non-bomb types', () => {
    expect(isBomb(CardType.Single)).toBe(false)
    expect(isBomb(CardType.Pair)).toBe(false)
    expect(isBomb(CardType.Straight)).toBe(false)
    expect(isBomb(CardType.Invalid)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { Suit, CardType } from '../../../src/game/card'
import { classifyCards } from '../../../src/game/classifier'

function c(rank: number, suit = Suit.Spade) {
  return { suit, rank }
}

describe('classifyCards', () => {
  it('returns Invalid for empty array', () => {
    const r = classifyCards([])
    expect(r.cardType).toBe(CardType.Invalid)
  })

  it('classifies Single', () => {
    const r = classifyCards([c(3)])
    expect(r.cardType).toBe(CardType.Single)
    expect(r.rank).toBe(3)
    expect(r.length).toBe(1)
  })

  it('classifies Pair', () => {
    const r = classifyCards([c(5), c(5, Suit.Heart)])
    expect(r.cardType).toBe(CardType.Pair)
    expect(r.rank).toBe(5)
  })

  it('classifies Triple', () => {
    const r = classifyCards([c(9), c(9, Suit.Heart), c(9, Suit.Club)])
    expect(r.cardType).toBe(CardType.Triple)
    expect(r.rank).toBe(9)
  })

  it('classifies TripleOne', () => {
    const r = classifyCards([c(3), c(3, Suit.Heart), c(3, Suit.Club), c(7)])
    expect(r.cardType).toBe(CardType.TripleOne)
    expect(r.rank).toBe(3)
  })

  it('classifies TriplePair', () => {
    const r = classifyCards([c(8), c(8, Suit.Heart), c(8, Suit.Club), c(4), c(4, Suit.Heart)])
    expect(r.cardType).toBe(CardType.TriplePair)
    expect(r.rank).toBe(8)
  })

  it('classifies Straight (5+ consecutive singles)', () => {
    const r = classifyCards([c(3), c(4), c(5), c(6), c(7)])
    expect(r.cardType).toBe(CardType.Straight)
    expect(r.rank).toBe(7)
    expect(r.length).toBe(5)
  })

  it('classifies longer Straight', () => {
    const r = classifyCards([c(3), c(4), c(5), c(6), c(7), c(8), c(9), c(10)])
    expect(r.cardType).toBe(CardType.Straight)
    expect(r.rank).toBe(10)
    expect(r.length).toBe(8)
  })

  it('classifies Straight up to A (14)', () => {
    const r = classifyCards([c(10), c(11), c(12), c(13), c(14)])
    expect(r.cardType).toBe(CardType.Straight)
    expect(r.rank).toBe(14)
  })

  it('rejects Straight containing 2 (rank 15)', () => {
    const r = classifyCards([c(3), c(4), c(5), c(6), c(15)])
    expect(r.cardType).toBe(CardType.Invalid)
  })

  it('rejects Straight with fewer than 5 cards', () => {
    const r = classifyCards([c(3), c(4), c(5), c(6)])
    expect(r.cardType).toBe(CardType.Invalid)
  })

  it('classifies DoubleStraight (3+ consecutive pairs)', () => {
    const r = classifyCards([c(3), c(3, Suit.Heart), c(4), c(4, Suit.Heart), c(5), c(5, Suit.Heart)])
    expect(r.cardType).toBe(CardType.DoubleStraight)
    expect(r.rank).toBe(5)
    expect(r.length).toBe(3)
  })

  it('rejects DoubleStraight with only 2 pairs', () => {
    const r = classifyCards([c(3), c(3, Suit.Heart), c(4), c(4, Suit.Heart)])
    expect(r.cardType).toBe(CardType.Invalid)
  })

  it('classifies Plane (2+ consecutive triples)', () => {
    const r = classifyCards([c(3), c(3, Suit.Heart), c(3, Suit.Club), c(4), c(4, Suit.Heart), c(4, Suit.Club)])
    expect(r.cardType).toBe(CardType.Plane)
    expect(r.rank).toBe(4)
    expect(r.length).toBe(2)
  })

  it('classifies PlaneSingle', () => {
    const r = classifyCards([
      c(5), c(5, Suit.Heart), c(5, Suit.Club),
      c(6), c(6, Suit.Heart), c(6, Suit.Club),
      c(8), c(9),
    ])
    expect(r.cardType).toBe(CardType.PlaneSingle)
    expect(r.rank).toBe(6)
    expect(r.length).toBe(2)
  })

  it('classifies PlanePair', () => {
    const r = classifyCards([
      c(5), c(5, Suit.Heart), c(5, Suit.Club),
      c(6), c(6, Suit.Heart), c(6, Suit.Club),
      c(8), c(8, Suit.Heart), c(9), c(9, Suit.Heart),
    ])
    expect(r.cardType).toBe(CardType.PlanePair)
    expect(r.rank).toBe(6)
    expect(r.length).toBe(2)
  })

  it('classifies Bomb', () => {
    const r = classifyCards([c(7), c(7, Suit.Heart), c(7, Suit.Club), c(7, Suit.Diamond)])
    expect(r.cardType).toBe(CardType.Bomb)
    expect(r.rank).toBe(7)
  })

  it('classifies Rocket (small + big joker)', () => {
    const r = classifyCards([c(16), c(17)])
    expect(r.cardType).toBe(CardType.Rocket)
    expect(r.rank).toBe(17)
  })

  it('classifies FourTwo', () => {
    const r = classifyCards([
      c(4), c(4, Suit.Heart), c(4, Suit.Club), c(4, Suit.Diamond),
      c(7), c(9),
    ])
    expect(r.cardType).toBe(CardType.FourTwo)
    expect(r.rank).toBe(4)
  })

  it('returns Invalid for unrecognized combination', () => {
    const r = classifyCards([c(3), c(4), c(5)])
    expect(r.cardType).toBe(CardType.Invalid)
  })
})

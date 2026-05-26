import { describe, it, expect } from 'vitest'
import { Suit } from '../../../src/game/card'
import { newDeck, shuffle, deal } from '../../../src/game/deck'

describe('newDeck', () => {
  it('creates 54 cards', () => {
    const deck = newDeck()
    expect(deck).toHaveLength(54)
  })

  it('contains 13 ranks × 4 suits + 2 jokers', () => {
    const deck = newDeck()
    const counts = new Map<string, number>()
    for (const c of deck) {
      const key = `${c.suit}:${c.rank}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    expect(counts.size).toBe(54)

    const suitCounts = [0, 0, 0, 0]
    for (const c of deck) {
      if (c.rank <= 15) suitCounts[c.suit]++
    }
    expect(suitCounts).toEqual([13, 13, 13, 13])
  })

  it('assigns correct suit to jokers', () => {
    const deck = newDeck()
    const xj = deck.find(c => c.rank === 16)!
    const dj = deck.find(c => c.rank === 17)!
    expect(xj.suit).toBe(Suit.Spade)
    expect(dj.suit).toBe(Suit.Diamond)
  })

  it('produces deterministic order', () => {
    const a = newDeck()
    const b = newDeck()
    expect(a).toEqual(b)
  })
})

describe('shuffle', () => {
  it('reorders elements in place', () => {
    const deck = newDeck()
    const original = [...deck]
    shuffle(deck)
    expect(deck).not.toEqual(original)
    expect(deck).toHaveLength(54)
  })

  it('preserves all 54 cards', () => {
    const deck = newDeck()
    shuffle(deck)
    const sorted = [...deck].sort((a, b) => a.rank - b.rank || a.suit - b.suit)
    const originalSorted = newDeck().sort((a, b) => a.rank - b.rank || a.suit - b.suit)
    expect(sorted).toEqual(originalSorted)
  })

  it('handles 0 and 1 element arrays', () => {
    const empty: never[] = []
    shuffle(empty)
    expect(empty).toEqual([])

    const single = [{ suit: Suit.Spade, rank: 3 }]
    shuffle(single)
    expect(single).toHaveLength(1)
  })
})

describe('deal', () => {
  it('deals 17 cards to each player and 3 bottom cards', () => {
    const deck = newDeck()
    shuffle(deck)
    const [h0, h1, h2, bottom] = deal(deck)
    expect(h0).toHaveLength(17)
    expect(h1).toHaveLength(17)
    expect(h2).toHaveLength(17)
    expect(bottom).toHaveLength(3)
  })

  it('bottom cards are the first 3 positions', () => {
    const deck = newDeck()
    const [,,, bottom] = deal(deck)
    expect(bottom[0]).toBe(deck[0])
    expect(bottom[1]).toBe(deck[1])
    expect(bottom[2]).toBe(deck[2])
  })
})

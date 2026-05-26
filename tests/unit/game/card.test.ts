import { describe, it, expect } from 'vitest'
import { Suit, CardType, cardToString, stringToCard, type Card } from '../../../src/game/card'
import { newDeck } from '../../../src/game/deck'

describe('cardToString', () => {
  it('converts regular cards with suit prefix', () => {
    expect(cardToString({ suit: Suit.Spade, rank: 3 })).toBe('S3')
    expect(cardToString({ suit: Suit.Heart, rank: 10 })).toBe('H10')
    expect(cardToString({ suit: Suit.Club, rank: 11 })).toBe('CJ')
    expect(cardToString({ suit: Suit.Diamond, rank: 14 })).toBe('DA')
  })

  it('converts 2 correctly', () => {
    expect(cardToString({ suit: Suit.Spade, rank: 15 })).toBe('S2')
  })

  it('converts small joker without suit prefix', () => {
    expect(cardToString({ suit: Suit.Spade, rank: 16 })).toBe('XJ')
  })

  it('converts big joker without suit prefix', () => {
    expect(cardToString({ suit: Suit.Diamond, rank: 17 })).toBe('BJ')
  })
})

describe('stringToCard', () => {
  it('parses regular cards', () => {
    expect(stringToCard('S3')).toEqual({ suit: Suit.Spade, rank: 3 })
    expect(stringToCard('H10')).toEqual({ suit: Suit.Heart, rank: 10 })
    expect(stringToCard('CJ')).toEqual({ suit: Suit.Club, rank: 11 })
    expect(stringToCard('DQ')).toEqual({ suit: Suit.Diamond, rank: 12 })
    expect(stringToCard('SK')).toEqual({ suit: Suit.Spade, rank: 13 })
  })

  it('parses 2 and A', () => {
    expect(stringToCard('H2')).toEqual({ suit: Suit.Heart, rank: 15 })
    expect(stringToCard('DA')).toEqual({ suit: Suit.Diamond, rank: 14 })
  })

  it('parses jokers', () => {
    expect(stringToCard('XJ')).toEqual({ suit: Suit.Spade, rank: 16 })
    expect(stringToCard('BJ')).toEqual({ suit: Suit.Diamond, rank: 17 })
  })
})

describe('round-trip: cardToString ∘ stringToCard = identity', () => {
  it('works for all 54 cards in a deck', () => {
    const deck = newDeck()
    for (const card of deck) {
      const str = cardToString(card)
      const back = stringToCard(str)
      expect(back.suit).toBe(card.suit)
      expect(back.rank).toBe(card.rank)
    }
  })
})

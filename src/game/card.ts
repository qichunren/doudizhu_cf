export enum Suit {
  Spade,
  Heart,
  Club,
  Diamond,
}

export enum CardType {
  Invalid,
  Single,
  Pair,
  Triple,
  TripleOne,
  TriplePair,
  Straight,
  DoubleStraight,
  Plane,
  PlaneSingle,
  PlanePair,
  Bomb,
  Rocket,
  FourTwo,
}

export interface Card {
  suit: Suit
  rank: number
  owner?: number
}

export interface CardGroup {
  cards: Card[]
  cardType: CardType
  rank: number
  length: number
}

export function cardToString(c: Card): string {
  if (c.rank === 16) return 'XJ'
  if (c.rank === 17) return 'BJ'
  const suitMap = ['S', 'H', 'C', 'D']
  const rankMap: Record<number, string> = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2',
  }
  return `${suitMap[c.suit]}${rankMap[c.rank]}`
}

export function stringToCard(s: string): Card {
  const suitMap: Record<string, Suit> = { S: Suit.Spade, H: Suit.Heart, C: Suit.Club, D: Suit.Diamond }
  const rankMap: Record<string, number> = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  }
  if (s === 'XJ') return { suit: Suit.Spade, rank: 16 }
  if (s === 'BJ') return { suit: Suit.Diamond, rank: 17 }
  const suit = suitMap[s[0]]
  const rankStr = s.slice(1)
  const rank = rankMap[rankStr]
  return { suit, rank }
}

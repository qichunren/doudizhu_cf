import { Suit, Card } from './card'

export function newDeck(): Card[] {
  const cards: Card[] = []
  for (let suit = Suit.Spade; suit <= Suit.Diamond; suit++) {
    for (let rank = 3; rank <= 15; rank++) {
      cards.push({ suit, rank })
    }
  }
  cards.push({ suit: Suit.Spade, rank: 16 })
  cards.push({ suit: Suit.Diamond, rank: 17 })
  return cards
}

export function shuffle(cards: Card[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
}

export function deal(cards: Card[]): [Card[], Card[], Card[], Card[]] {
  return [
    cards.slice(3, 20),
    cards.slice(20, 37),
    cards.slice(37, 54),
    cards.slice(0, 3),
  ]
}

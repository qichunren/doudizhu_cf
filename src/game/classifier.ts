import { Card, CardGroup, CardType } from './card'

function groupByRank(cards: Card[]): Map<number, Card[]> {
  const m = new Map<number, Card[]>()
  for (const c of cards) {
    const arr = m.get(c.rank) || []
    arr.push(c)
    m.set(c.rank, arr)
  }
  return m
}

export function classifyCards(cards: Card[]): CardGroup {
  const n = cards.length
  if (n === 0) return { cards, cardType: CardType.Invalid, rank: 0, length: 0 }

  const sorted = [...cards].sort((a, b) => a.rank - b.rank)
  const groups = groupByRank(sorted)
  const counts = [...groups.entries()].map(([rank, g]) => ({ rank, count: g.length }))
  counts.sort((a, b) => a.rank - b.rank)

  const isStraight = (arr: { rank: number; count: number }[]): boolean => {
    if (arr.length < 2) return false
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].rank !== arr[i - 1].rank + 1) return false
    }
    return arr[arr.length - 1].rank <= 14
  }

  const allSameCount = (c: number): boolean => counts.every((g) => g.count === c)

  // Rocket
  if (n === 2 && sorted[0].rank === 16 && sorted[1].rank === 17) {
    return { cards: sorted, cardType: CardType.Rocket, rank: 17, length: 1 }
  }

  // Bomb
  if (n === 4 && counts.length === 1 && counts[0].count === 4) {
    return { cards: sorted, cardType: CardType.Bomb, rank: counts[0].rank, length: 1 }
  }

  // Single
  if (n === 1) {
    return { cards: sorted, cardType: CardType.Single, rank: sorted[0].rank, length: 1 }
  }

  // Pair
  if (n === 2 && counts.length === 1 && counts[0].count === 2) {
    return { cards: sorted, cardType: CardType.Pair, rank: counts[0].rank, length: 1 }
  }

  // Triple
  if (n === 3 && counts.length === 1 && counts[0].count === 3) {
    return { cards: sorted, cardType: CardType.Triple, rank: counts[0].rank, length: 1 }
  }

  // Triple + 1
  if (n === 4 && counts.length === 2) {
    const triple = counts.find((g) => g.count === 3)
    if (triple) return { cards: sorted, cardType: CardType.TripleOne, rank: triple.rank, length: 1 }
  }

  // Triple + Pair
  if (n === 5 && counts.length === 2) {
    const triple = counts.find((g) => g.count === 3)
    const pair = counts.find((g) => g.count === 2)
    if (triple && pair) return { cards: sorted, cardType: CardType.TriplePair, rank: triple.rank, length: 1 }
  }

  // Straight
  if (counts.length >= 5 && allSameCount(1) && isStraight(counts)) {
    return { cards: sorted, cardType: CardType.Straight, rank: counts[counts.length - 1].rank, length: counts.length }
  }

  // Double Straight
  if (counts.length >= 3 && allSameCount(2) && isStraight(counts)) {
    return { cards: sorted, cardType: CardType.DoubleStraight, rank: counts[counts.length - 1].rank, length: counts.length }
  }

  // Plane
  if (counts.length >= 2 && allSameCount(3) && isStraight(counts)) {
    return { cards: sorted, cardType: CardType.Plane, rank: counts[counts.length - 1].rank, length: counts.length }
  }

  // Plane + Singles
  if (counts.length >= 2) {
    const triples = counts.filter((g) => g.count === 3)
    const others = counts.filter((g) => g.count !== 3)
    if (triples.length >= 2 && isStraight(triples) && others.length === triples.length && others.every((g) => g.count === 1)) {
      return { cards: sorted, cardType: CardType.PlaneSingle, rank: triples[triples.length - 1].rank, length: triples.length }
    }
  }

  // Plane + Pairs
  if (counts.length >= 2) {
    const triples = counts.filter((g) => g.count === 3)
    const others = counts.filter((g) => g.count !== 3)
    if (triples.length >= 2 && isStraight(triples) && others.length === triples.length && others.every((g) => g.count === 2)) {
      return { cards: sorted, cardType: CardType.PlanePair, rank: triples[triples.length - 1].rank, length: triples.length }
    }
  }

  // Four + 2
  if (n === 6 && counts.length === 3) {
    const four = counts.find((g) => g.count === 4)
    if (four) return { cards: sorted, cardType: CardType.FourTwo, rank: four.rank, length: 1 }
  }

  return { cards: sorted, cardType: CardType.Invalid, rank: 0, length: 0 }
}

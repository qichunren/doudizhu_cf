import { CardGroup, CardType } from './card'

export function canBeat(current: CardGroup, previous: CardGroup | null): boolean {
  if (!previous) {
    return current.cardType !== CardType.Invalid
  }
  if (current.cardType === CardType.Rocket) {
    return true
  }
  if (current.cardType === CardType.Bomb) {
    if (previous.cardType === CardType.Rocket) {
      return false
    }
    if (previous.cardType === CardType.Bomb) {
      return current.rank > previous.rank
    }
    return true
  }
  if (current.cardType !== previous.cardType) {
    return false
  }
  if (current.length !== previous.length) {
    return false
  }
  return current.rank > previous.rank
}

export function isBomb(cardType: CardType): boolean {
  return cardType === CardType.Bomb || cardType === CardType.Rocket
}

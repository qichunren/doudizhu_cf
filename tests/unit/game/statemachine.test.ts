import { describe, it, expect } from 'vitest'
import { GameState, gameStateString } from '../../../src/game/statemachine'

describe('gameStateString', () => {
  it('returns "dealing" for Dealing', () => {
    expect(gameStateString(GameState.Dealing)).toBe('dealing')
  })

  it('returns "calling" for Calling', () => {
    expect(gameStateString(GameState.Calling)).toBe('calling')
  })

  it('returns "playing" for Playing', () => {
    expect(gameStateString(GameState.Playing)).toBe('playing')
  })

  it('returns "settling" for Settling', () => {
    expect(gameStateString(GameState.Settling)).toBe('settling')
  })

  it('returns "unknown" for invalid state', () => {
    expect(gameStateString(99 as GameState)).toBe('unknown')
  })
})

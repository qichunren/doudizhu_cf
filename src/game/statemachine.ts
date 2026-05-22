export enum GameState {
  Dealing,
  Calling,
  Playing,
  Settling,
}

export function gameStateString(s: GameState): string {
  switch (s) {
    case GameState.Dealing: return 'dealing'
    case GameState.Calling: return 'calling'
    case GameState.Playing: return 'playing'
    case GameState.Settling: return 'settling'
    default: return 'unknown'
  }
}

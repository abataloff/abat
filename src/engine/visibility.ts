import { Board } from './board';

/** Returns set of "x,y" keys for cells visible to the given player (Chebyshev distance). */
export function getVisibleCells(board: Board, playerId: number, radius: number): Set<string> {
  const visible = new Set<string>();
  const stacks = board.getPlayerStacks(playerId);

  for (const { pos } of stacks) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (board.isInBounds({ x, y })) {
          visible.add(`${x},${y}`);
        }
      }
    }
  }

  return visible;
}

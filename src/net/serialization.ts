import { Board } from '../engine/board';
import { Stack } from '../engine/stack';
import { CombatResult, MovementResult } from '../engine/types';
import { getVisibleCells } from '../engine/visibility';
import { BoardSnapshot, CellSnapshot } from './protocol';

/** Serialize board for a specific player with fog of war */
export function serializeBoardForPlayer(
  board: Board,
  playerId: number,
  visionRadius: number,
): BoardSnapshot {
  const visible = getVisibleCells(board, playerId, visionRadius);
  const cells: CellSnapshot[] = [];

  for (const pos of board.getOccupiedCells()) {
    const key = `${pos.x},${pos.y}`;
    if (!visible.has(key)) continue;

    const stacks = board.getStacks(pos).filter((s) => s.alive);
    if (stacks.length === 0) continue;

    cells.push({
      x: pos.x,
      y: pos.y,
      stacks: stacks.map((s) => ({ playerId: s.playerId, units: s.units })),
    });
  }

  return {
    cells,
    visibleKeys: [...visible],
  };
}

/** Filter movements to only those visible to the player */
export function filterMovements(
  movements: MovementResult[],
  visibleKeys: Set<string>,
): MovementResult[] {
  return movements.filter(
    (m) =>
      visibleKeys.has(`${m.from.x},${m.from.y}`) ||
      visibleKeys.has(`${m.to.x},${m.to.y}`),
  );
}

/** Filter combats to only those visible to the player */
export function filterCombats(
  combats: CombatResult[],
  visibleKeys: Set<string>,
): CombatResult[] {
  return combats.filter((c) =>
    visibleKeys.has(`${c.position.x},${c.position.y}`),
  );
}

/** Deserialize board snapshot into a Board (client-side) */
export function deserializeBoard(
  snapshot: BoardSnapshot,
  cols: number,
  rows: number,
): Board {
  const board = new Board(cols, rows);
  for (const cell of snapshot.cells) {
    for (const s of cell.stacks) {
      board.addStack({ x: cell.x, y: cell.y }, new Stack(s.playerId, s.units));
    }
  }
  return board;
}

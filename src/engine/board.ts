import { Position, Direction, DIRECTION_DELTA } from './types';
import { Stack } from './stack';

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

export class Board {
  readonly cols: number;
  readonly rows: number;
  private cells = new Map<string, Stack[]>();

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
  }

  isInBounds(pos: Position): boolean {
    return pos.x >= 0 && pos.x < this.cols && pos.y >= 0 && pos.y < this.rows;
  }

  applyDirection(from: Position, dir: Direction): Position {
    const d = DIRECTION_DELTA[dir];
    return { x: from.x + d.x, y: from.y + d.y };
  }

  getStacks(pos: Position): Stack[] {
    return this.cells.get(posKey(pos)) ?? [];
  }

  getPlayerStack(pos: Position, playerId: number): Stack | undefined {
    return this.getStacks(pos).find((s) => s.playerId === playerId && s.alive);
  }

  getPlayerStacks(playerId: number): { pos: Position; stack: Stack }[] {
    const result: { pos: Position; stack: Stack }[] = [];
    for (const [key, stacks] of this.cells) {
      for (const stack of stacks) {
        if (stack.playerId === playerId && stack.alive) {
          const [x, y] = key.split(',').map(Number);
          result.push({ pos: { x, y }, stack });
        }
      }
    }
    return result;
  }

  addStack(pos: Position, stack: Stack): void {
    const key = posKey(pos);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key)!.push(stack);
  }

  removeStack(pos: Position, stack: Stack): void {
    const key = posKey(pos);
    const stacks = this.cells.get(key);
    if (!stacks) return;
    const idx = stacks.indexOf(stack);
    if (idx !== -1) stacks.splice(idx, 1);
    if (stacks.length === 0) this.cells.delete(key);
  }

  /** Merge all stacks of the same player on the same cell */
  mergeAlliedStacks(): void {
    for (const [, stacks] of this.cells) {
      const byPlayer = new Map<number, Stack[]>();
      for (const s of stacks) {
        if (!s.alive) continue;
        if (!byPlayer.has(s.playerId)) byPlayer.set(s.playerId, []);
        byPlayer.get(s.playerId)!.push(s);
      }
      for (const [, playerStacks] of byPlayer) {
        if (playerStacks.length <= 1) continue;
        const main = playerStacks[0];
        for (let i = 1; i < playerStacks.length; i++) {
          main.merge(playerStacks[i]);
        }
      }
    }
    this.cleanup();
  }

  /** Remove dead stacks and empty cells */
  cleanup(): void {
    for (const [key, stacks] of this.cells) {
      const alive = stacks.filter((s) => s.alive);
      if (alive.length === 0) {
        this.cells.delete(key);
      } else {
        this.cells.set(key, alive);
      }
    }
  }

  /** Get all occupied cell positions */
  getOccupiedCells(): Position[] {
    const result: Position[] = [];
    for (const key of this.cells.keys()) {
      const [x, y] = key.split(',').map(Number);
      result.push({ x, y });
    }
    return result;
  }

  /** Get starting corner positions for N players */
  static getStartPositions(cols: number, rows: number, playerCount: number): Position[] {
    const corners: Position[] = [
      { x: 0, y: 0 },
      { x: cols - 1, y: rows - 1 },
      { x: cols - 1, y: 0 },
      { x: 0, y: rows - 1 },
    ];
    return corners.slice(0, playerCount);
  }

  getPlayerTotalUnits(playerId: number): number {
    let total = 0;
    for (const [, stacks] of this.cells) {
      for (const s of stacks) {
        if (s.playerId === playerId && s.alive) {
          total += s.units;
        }
      }
    }
    return total;
  }
}

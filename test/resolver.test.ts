import { describe, it, expect } from 'vitest';
import { resolveTurn } from '../src/engine/resolver';
import { Board } from '../src/engine/board';
import { Stack } from '../src/engine/stack';
import { Direction, TurnOrders } from '../src/engine/types';
import { RNG } from '../src/util/random';

function makeBoard(cols: number, rows: number, stacks: { pos: { x: number; y: number }; playerId: number; units: number }[]): Board {
  const board = new Board(cols, rows);
  for (const s of stacks) {
    board.addStack(s.pos, new Stack(s.playerId, s.units));
  }
  return board;
}

describe('resolveTurn', () => {
  it('moves units to adjacent cell', () => {
    const board = makeBoard(5, 5, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 10 }]);
    const orders: TurnOrders[] = [
      { playerId: 0, moves: [{ playerId: 0, from: { x: 0, y: 0 }, unitCount: 10, direction: Direction.E }] },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.movements).toHaveLength(1);
    expect(board.getPlayerStack({ x: 1, y: 0 }, 0)?.units).toBe(10);
    expect(board.getPlayerStack({ x: 0, y: 0 }, 0)).toBeUndefined();
  });

  it('splits stack and moves in different directions', () => {
    const board = makeBoard(5, 5, [{ pos: { x: 2, y: 2 }, playerId: 0, units: 10 }]);
    const orders: TurnOrders[] = [
      {
        playerId: 0,
        moves: [
          { playerId: 0, from: { x: 2, y: 2 }, unitCount: 3, direction: Direction.N },
          { playerId: 0, from: { x: 2, y: 2 }, unitCount: 4, direction: Direction.S },
        ],
      },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.movements).toHaveLength(2);
    expect(board.getPlayerStack({ x: 2, y: 1 }, 0)?.units).toBe(3);
    expect(board.getPlayerStack({ x: 2, y: 3 }, 0)?.units).toBe(4);
    expect(board.getPlayerStack({ x: 2, y: 2 }, 0)?.units).toBe(3); // 10 - 3 - 4 = 3 remain
  });

  it('pass-through: no combat when players swap cells', () => {
    const board = makeBoard(5, 5, [
      { pos: { x: 0, y: 0 }, playerId: 0, units: 5 },
      { pos: { x: 1, y: 0 }, playerId: 1, units: 5 },
    ]);
    const orders: TurnOrders[] = [
      { playerId: 0, moves: [{ playerId: 0, from: { x: 0, y: 0 }, unitCount: 5, direction: Direction.E }] },
      { playerId: 1, moves: [{ playerId: 1, from: { x: 1, y: 0 }, unitCount: 5, direction: Direction.W }] },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.combats).toHaveLength(0);
    expect(board.getPlayerStack({ x: 1, y: 0 }, 0)?.units).toBe(5);
    expect(board.getPlayerStack({ x: 0, y: 0 }, 1)?.units).toBe(5);
  });

  it('combat occurs when moving to same cell', () => {
    const board = makeBoard(5, 5, [
      { pos: { x: 0, y: 0 }, playerId: 0, units: 10 },
      { pos: { x: 2, y: 0 }, playerId: 1, units: 7 },
    ]);
    const orders: TurnOrders[] = [
      { playerId: 0, moves: [{ playerId: 0, from: { x: 0, y: 0 }, unitCount: 10, direction: Direction.E }] },
      { playerId: 1, moves: [{ playerId: 1, from: { x: 2, y: 0 }, unitCount: 7, direction: Direction.W }] },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.combats).toHaveLength(1);
    expect(result.combats[0].winnerId).toBe(0);
    expect(result.combats[0].unitsAfter).toBe(10 - Math.floor(7 / 2)); // 7
  });

  it('rejects orders exceeding stack size', () => {
    const board = makeBoard(5, 5, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 5 }]);
    const orders: TurnOrders[] = [
      {
        playerId: 0,
        moves: [
          { playerId: 0, from: { x: 0, y: 0 }, unitCount: 3, direction: Direction.E },
          { playerId: 0, from: { x: 0, y: 0 }, unitCount: 4, direction: Direction.S },
        ],
      },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    // 3 + 4 = 7 > 5, all orders for this cell rejected
    expect(result.movements).toHaveLength(0);
    expect(board.getPlayerStack({ x: 0, y: 0 }, 0)?.units).toBe(5);
  });

  it('rejects move to out-of-bounds', () => {
    const board = makeBoard(5, 5, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 5 }]);
    const orders: TurnOrders[] = [
      { playerId: 0, moves: [{ playerId: 0, from: { x: 0, y: 0 }, unitCount: 5, direction: Direction.N }] },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.movements).toHaveLength(0);
    expect(board.getPlayerStack({ x: 0, y: 0 }, 0)?.units).toBe(5);
  });

  it('merges allied stacks on same cell', () => {
    const board = makeBoard(5, 5, [
      { pos: { x: 0, y: 0 }, playerId: 0, units: 5 },
      { pos: { x: 2, y: 0 }, playerId: 0, units: 3 },
    ]);
    const orders: TurnOrders[] = [
      {
        playerId: 0,
        moves: [
          { playerId: 0, from: { x: 0, y: 0 }, unitCount: 5, direction: Direction.E },
          { playerId: 0, from: { x: 2, y: 0 }, unitCount: 3, direction: Direction.W },
        ],
      },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(board.getPlayerStack({ x: 1, y: 0 }, 0)?.units).toBe(8);
  });

  it('detects winner when all enemy units eliminated', () => {
    const board = makeBoard(5, 5, [
      { pos: { x: 0, y: 0 }, playerId: 0, units: 10 },
      { pos: { x: 1, y: 0 }, playerId: 1, units: 2 },
    ]);
    const orders: TurnOrders[] = [
      { playerId: 0, moves: [{ playerId: 0, from: { x: 0, y: 0 }, unitCount: 10, direction: Direction.E }] },
      { playerId: 1, moves: [] },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.winnerId).toBe(0);
    expect(result.eliminations).toContain(1);
  });

  it('no winner if multiple players still alive', () => {
    const board = makeBoard(5, 5, [
      { pos: { x: 0, y: 0 }, playerId: 0, units: 10 },
      { pos: { x: 4, y: 4 }, playerId: 1, units: 10 },
    ]);
    const orders: TurnOrders[] = [
      { playerId: 0, moves: [] },
      { playerId: 1, moves: [] },
    ];
    const result = resolveTurn(board, orders, new RNG(42), 1);
    expect(result.winnerId).toBeNull();
  });
});

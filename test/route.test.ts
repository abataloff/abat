import { describe, it, expect } from 'vitest';
import { computePath, posToDirection, RouteManager } from '../src/engine/route';
import { Board } from '../src/engine/board';
import { Stack } from '../src/engine/stack';
import { Direction } from '../src/engine/types';

function makeBoard(cols: number, rows: number, stacks: { pos: { x: number; y: number }; playerId: number; units: number }[]): Board {
  const board = new Board(cols, rows);
  for (const s of stacks) {
    board.addStack(s.pos, new Stack(s.playerId, s.units));
  }
  return board;
}

describe('computePath', () => {
  const board = new Board(8, 8);

  it('horizontal path', () => {
    const path = computePath({ x: 0, y: 0 }, { x: 3, y: 0 }, board);
    expect(path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  it('vertical path', () => {
    const path = computePath({ x: 2, y: 1 }, { x: 2, y: 4 }, board);
    expect(path).toEqual([{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }]);
  });

  it('diagonal path', () => {
    const path = computePath({ x: 0, y: 0 }, { x: 3, y: 3 }, board);
    expect(path).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
  });

  it('L-shaped path (diagonal then straight)', () => {
    const path = computePath({ x: 0, y: 0 }, { x: 3, y: 1 }, board);
    // Chebyshev: diagonal first, then straight
    expect(path).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
  });

  it('same position returns empty', () => {
    const path = computePath({ x: 2, y: 2 }, { x: 2, y: 2 }, board);
    expect(path).toEqual([]);
  });

  it('adjacent cell returns single step', () => {
    const path = computePath({ x: 1, y: 1 }, { x: 2, y: 2 }, board);
    expect(path).toEqual([{ x: 2, y: 2 }]);
  });
});

describe('posToDirection', () => {
  it('returns correct directions', () => {
    expect(posToDirection({ x: 1, y: 1 }, { x: 1, y: 0 })).toBe(Direction.N);
    expect(posToDirection({ x: 1, y: 1 }, { x: 2, y: 0 })).toBe(Direction.NE);
    expect(posToDirection({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(Direction.E);
    expect(posToDirection({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(Direction.SE);
    expect(posToDirection({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe(Direction.S);
    expect(posToDirection({ x: 1, y: 1 }, { x: 0, y: 2 })).toBe(Direction.SW);
    expect(posToDirection({ x: 1, y: 1 }, { x: 0, y: 1 })).toBe(Direction.W);
    expect(posToDirection({ x: 1, y: 1 }, { x: 0, y: 0 })).toBe(Direction.NW);
  });

  it('returns null for non-adjacent cells', () => {
    expect(posToDirection({ x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(posToDirection({ x: 0, y: 0 }, { x: 0, y: 3 })).toBeNull();
  });

  it('returns null for same position', () => {
    expect(posToDirection({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('RouteManager', () => {
  describe('addRoute', () => {
    it('creates a route', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      const route = rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      expect(route).not.toBeNull();
      expect(route!.playerId).toBe(0);
      expect(route!.currentPos).toEqual({ x: 0, y: 0 });
      expect(route!.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
      expect(route!.unitCount).toBe(5);
    });

    it('replaces existing route from same position', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.addRoute(0, { x: 0, y: 0 }, { x: 0, y: 3 }, 3, board);
      expect(rm.routes).toHaveLength(1);
      expect(rm.routes[0].path[0]).toEqual({ x: 0, y: 1 });
      expect(rm.routes[0].unitCount).toBe(3);
    });

    it('returns null for same position target', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      const route = rm.addRoute(0, { x: 0, y: 0 }, { x: 0, y: 0 }, 5, board);
      expect(route).toBeNull();
    });
  });

  describe('generateOrders', () => {
    it('generates one-step move orders', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      const orders = rm.generateOrders(0);
      expect(orders).toHaveLength(1);
      expect(orders[0].from).toEqual({ x: 0, y: 0 });
      expect(orders[0].direction).toBe(Direction.E);
      expect(orders[0].unitCount).toBe(5);
    });

    it('generates orders only for specified player', () => {
      const board = makeBoard(8, 8, [
        { pos: { x: 0, y: 0 }, playerId: 0, units: 10 },
        { pos: { x: 7, y: 7 }, playerId: 1, units: 10 },
      ]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.addRoute(1, { x: 7, y: 7 }, { x: 4, y: 4 }, 3, board);
      expect(rm.generateOrders(0)).toHaveLength(1);
      expect(rm.generateOrders(1)).toHaveLength(1);
      expect(rm.generateOrders(0)[0].playerId).toBe(0);
    });
  });

  describe('advanceRoutes', () => {
    it('advances position by one step', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 1, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.advanceRoutes(board);
      expect(rm.routes).toHaveLength(1);
      expect(rm.routes[0].currentPos).toEqual({ x: 1, y: 0 });
      expect(rm.routes[0].path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }]);
    });

    it('removes route when destination reached', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 1, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 1, y: 0 }, 5, board);
      rm.advanceRoutes(board);
      expect(rm.routes).toHaveLength(0);
    });

    it('removes route when stack dies', () => {
      // No stack at the target position
      const board = makeBoard(8, 8, []);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.advanceRoutes(board);
      expect(rm.routes).toHaveLength(0);
    });

    it('removes route when stack has fewer units than route requires', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 1, y: 0 }, playerId: 0, units: 3 }]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.advanceRoutes(board);
      expect(rm.routes).toHaveLength(0);
    });
  });

  describe('removeRoute', () => {
    it('removes a specific route', () => {
      const board = makeBoard(8, 8, [
        { pos: { x: 0, y: 0 }, playerId: 0, units: 10 },
        { pos: { x: 5, y: 5 }, playerId: 0, units: 10 },
      ]);
      const rm = new RouteManager();
      const r1 = rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.addRoute(0, { x: 5, y: 5 }, { x: 7, y: 7 }, 3, board);
      rm.removeRoute(r1!.id);
      expect(rm.routes).toHaveLength(1);
      expect(rm.routes[0].currentPos).toEqual({ x: 5, y: 5 });
    });
  });

  describe('clear', () => {
    it('removes all routes', () => {
      const board = makeBoard(8, 8, [{ pos: { x: 0, y: 0 }, playerId: 0, units: 10 }]);
      const rm = new RouteManager();
      rm.addRoute(0, { x: 0, y: 0 }, { x: 3, y: 0 }, 5, board);
      rm.clear();
      expect(rm.routes).toHaveLength(0);
    });
  });
});

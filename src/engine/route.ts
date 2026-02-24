import { Position, Direction, DIRECTION_DELTA, MoveOrder } from './types';
import { Board } from './board';

export interface Route {
  id: number;
  playerId: number;
  currentPos: Position;
  path: Position[];
  unitCount: number;
}

/**
 * Compute Chebyshev straight-line path from `from` to `to`.
 * Returns array of positions EXCLUDING `from`, INCLUDING `to`.
 */
export function computePath(from: Position, to: Position, _board: Board): Position[] {
  const path: Position[] = [];
  let cx = from.x;
  let cy = from.y;

  while (cx !== to.x || cy !== to.y) {
    const dx = Math.sign(to.x - cx);
    const dy = Math.sign(to.y - cy);
    cx += dx;
    cy += dy;
    path.push({ x: cx, y: cy });
  }

  return path;
}

/**
 * Get direction between two adjacent cells (Chebyshev distance 1).
 * Returns null if cells are not adjacent.
 */
export function posToDirection(from: Position, to: Position): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return null;

  for (const [dir, delta] of Object.entries(DIRECTION_DELTA)) {
    if (delta.x === dx && delta.y === dy) return dir as Direction;
  }
  return null;
}

export class RouteManager {
  routes: Route[] = [];
  private nextId = 1;

  addRoute(playerId: number, from: Position, to: Position, unitCount: number, board: Board): Route | null {
    const path = computePath(from, to, board);
    if (path.length === 0) return null;

    // Replace existing route from the same position
    this.routes = this.routes.filter(
      (r) => !(r.playerId === playerId && r.currentPos.x === from.x && r.currentPos.y === from.y),
    );

    const route: Route = {
      id: this.nextId++,
      playerId,
      currentPos: { ...from },
      path,
      unitCount,
    };
    this.routes.push(route);
    return route;
  }

  removeRoute(routeId: number): void {
    this.routes = this.routes.filter((r) => r.id !== routeId);
  }

  getPlayerRoutes(playerId: number): Route[] {
    return this.routes.filter((r) => r.playerId === playerId);
  }

  /**
   * Generate move orders for the current turn (one step per route).
   */
  generateOrders(playerId: number): MoveOrder[] {
    const orders: MoveOrder[] = [];
    for (const route of this.routes) {
      if (route.playerId !== playerId) continue;
      if (route.path.length === 0) continue;

      const nextPos = route.path[0];
      const dir = posToDirection(route.currentPos, nextPos);
      if (!dir) continue;

      orders.push({
        playerId,
        from: { ...route.currentPos },
        unitCount: route.unitCount,
        direction: dir,
      });
    }
    return orders;
  }

  /**
   * After resolution: advance routes by one step, remove completed or dead routes.
   */
  advanceRoutes(board: Board): void {
    const toRemove: number[] = [];

    for (const route of this.routes) {
      if (route.path.length === 0) {
        toRemove.push(route.id);
        continue;
      }

      // Advance position
      const nextPos = route.path.shift()!;
      route.currentPos = nextPos;

      // Check if stack still exists at new position
      const stack = board.getPlayerStack(route.currentPos, route.playerId);
      if (!stack || stack.units < route.unitCount) {
        toRemove.push(route.id);
        continue;
      }

      // Route completed (no more path)
      if (route.path.length === 0) {
        toRemove.push(route.id);
      }
    }

    this.routes = this.routes.filter((r) => !toRemove.includes(r.id));
  }

  clear(): void {
    this.routes = [];
    this.nextId = 1;
  }
}

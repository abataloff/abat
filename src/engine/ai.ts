import { Board } from './board';
import { Direction, DIRECTION_DELTA, GameConfig, MoveOrder, NEUTRAL_PLAYER_ID, Position } from './types';
import { getVisibleCells } from './visibility';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export function generateOrders(
  board: Board,
  playerId: number,
  difficulty: AiDifficulty,
  config: GameConfig,
): MoveOrder[] {
  switch (difficulty) {
    case 'easy':
      return generateEasy(board, playerId);
    case 'medium':
      return generateMedium(board, playerId, config);
    case 'hard':
      return generateHard(board, playerId, config);
  }
}

// --- Helpers ---

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function directionToward(from: Position, to: Position, board: Board): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Clamp to -1..1
  const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  if (sx === 0 && sy === 0) return null;
  const target = { x: from.x + sx, y: from.y + sy };
  if (!board.isInBounds(target)) return null;
  // Find matching direction
  for (const [dir, delta] of Object.entries(DIRECTION_DELTA)) {
    if (delta.x === sx && delta.y === sy) return dir as Direction;
  }
  return null;
}

function directionAway(from: Position, threat: Position, board: Board): Direction | null {
  const dx = from.x - threat.x;
  const dy = from.y - threat.y;
  const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  if (sx === 0 && sy === 0) return null;
  const target = { x: from.x + sx, y: from.y + sy };
  if (!board.isInBounds(target)) return null;
  for (const [dir, delta] of Object.entries(DIRECTION_DELTA)) {
    if (delta.x === sx && delta.y === sy) return dir as Direction;
  }
  return null;
}

function randomDirection(from: Position, board: Board): Direction | null {
  const dirs = Object.keys(DIRECTION_DELTA) as Direction[];
  // Shuffle
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const dir of dirs) {
    const target = board.applyDirection(from, dir);
    if (board.isInBounds(target)) return dir;
  }
  return null;
}

function getCenter(board: Board): Position {
  return { x: Math.floor(board.cols / 2), y: Math.floor(board.rows / 2) };
}

interface EnemyInfo {
  pos: Position;
  playerId: number;
  units: number;
}

function findVisibleEnemies(board: Board, playerId: number, visibleKeys: Set<string>): EnemyInfo[] {
  const enemies: EnemyInfo[] = [];
  for (const cell of board.getOccupiedCells()) {
    const key = `${cell.x},${cell.y}`;
    if (!visibleKeys.has(key)) continue;
    for (const stack of board.getStacks(cell)) {
      if (stack.playerId !== playerId && stack.playerId !== NEUTRAL_PLAYER_ID && stack.alive) {
        enemies.push({ pos: cell, playerId: stack.playerId, units: stack.units });
      }
    }
  }
  return enemies;
}

function findVisibleNeutrals(board: Board, visibleKeys: Set<string>): EnemyInfo[] {
  const neutrals: EnemyInfo[] = [];
  for (const cell of board.getOccupiedCells()) {
    const key = `${cell.x},${cell.y}`;
    if (!visibleKeys.has(key)) continue;
    for (const stack of board.getStacks(cell)) {
      if (stack.playerId === NEUTRAL_PLAYER_ID && stack.alive) {
        neutrals.push({ pos: cell, playerId: stack.playerId, units: stack.units });
      }
    }
  }
  return neutrals;
}

function findClosestNeutral(pos: Position, neutrals: EnemyInfo[]): { neutral: EnemyInfo; dist: number } | null {
  let best: EnemyInfo | null = null;
  let bestDist = Infinity;
  for (const n of neutrals) {
    const d = distance(pos, n.pos);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best ? { neutral: best, dist: bestDist } : null;
}

// --- Easy ---

function generateEasy(board: Board, playerId: number): MoveOrder[] {
  const orders: MoveOrder[] = [];
  const stacks = board.getPlayerStacks(playerId);
  for (const { pos, stack } of stacks) {
    if (Math.random() < 0.5) continue; // 50% chance to skip
    const dir = randomDirection(pos, board);
    if (dir) {
      orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
    }
  }
  return orders;
}

// --- Medium ---

function generateMedium(board: Board, playerId: number, config: GameConfig): MoveOrder[] {
  const orders: MoveOrder[] = [];
  const stacks = board.getPlayerStacks(playerId);
  const visibleKeys = getVisibleCells(board, playerId, config.visionRadius);
  const enemies = findVisibleEnemies(board, playerId, visibleKeys);
  const neutrals = findVisibleNeutrals(board, visibleKeys);
  const center = getCenter(board);

  for (const { pos, stack } of stacks) {
    // Grab adjacent neutral first (free units)
    const nearNeutral = findClosestNeutral(pos, neutrals);
    if (nearNeutral && nearNeutral.dist <= 1) {
      const dir = directionToward(pos, nearNeutral.neutral.pos, board);
      if (dir) {
        orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
        continue;
      }
    }

    // Find closest visible enemy
    let closestEnemy: EnemyInfo | null = null;
    let closestDist = Infinity;
    for (const e of enemies) {
      const d = distance(pos, e.pos);
      if (d < closestDist) {
        closestDist = d;
        closestEnemy = e;
      }
    }

    if (closestEnemy) {
      // Don't attack if enemy is 2x stronger
      if (closestEnemy.units >= stack.units * 2) continue;
      const dir = directionToward(pos, closestEnemy.pos, board);
      if (dir) {
        orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
      }
    } else {
      // Prefer moving toward nearby neutral over center
      const target = nearNeutral ? nearNeutral.neutral.pos : center;
      if (pos.x === target.x && pos.y === target.y) continue;
      const dir = directionToward(pos, target, board);
      if (dir) {
        orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
      }
    }
  }
  return orders;
}

// --- Hard ---

function generateHard(board: Board, playerId: number, config: GameConfig): MoveOrder[] {
  const orders: MoveOrder[] = [];
  const stacks = board.getPlayerStacks(playerId);
  const visibleKeys = getVisibleCells(board, playerId, config.visionRadius);
  const enemies = findVisibleEnemies(board, playerId, visibleKeys);
  const neutrals = findVisibleNeutrals(board, visibleKeys);
  const center = getCenter(board);

  // Pre-compute closest ally for each stack
  function findClosestAlly(pos: Position, excludePos: Position): { pos: Position; units: number } | null {
    let best: { pos: Position; units: number } | null = null;
    let bestDist = Infinity;
    for (const s of stacks) {
      if (s.pos.x === excludePos.x && s.pos.y === excludePos.y) continue;
      const d = distance(pos, s.pos);
      if (d < bestDist) {
        bestDist = d;
        best = { pos: s.pos, units: s.stack.units };
      }
    }
    return best;
  }

  for (const { pos, stack } of stacks) {
    // Find closest enemy
    let closestEnemy: EnemyInfo | null = null;
    let closestDist = Infinity;
    for (const e of enemies) {
      const d = distance(pos, e.pos);
      if (d < closestDist) {
        closestDist = d;
        closestEnemy = e;
      }
    }

    // Grab adjacent neutral first (free units, unless threatened)
    const nearNeutral = findClosestNeutral(pos, neutrals);
    const threatened = closestEnemy && closestDist <= 2 && closestEnemy.units > stack.units;
    if (!threatened && nearNeutral && nearNeutral.dist <= 1) {
      const dir = directionToward(pos, nearNeutral.neutral.pos, board);
      if (dir) {
        orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
        continue;
      }
    }

    // Threat assessment: enemy nearby and stronger - retreat/merge
    if (closestEnemy && closestDist <= 2 && closestEnemy.units > stack.units) {
      const ally = findClosestAlly(pos, pos);
      if (ally) {
        // Move toward closest ally to merge
        const dir = directionToward(pos, ally.pos, board);
        if (dir) {
          orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
          continue;
        }
      }
      // No ally nearby - retreat away from enemy
      const dir = directionAway(pos, closestEnemy.pos, board);
      if (dir) {
        orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
        continue;
      }
    }

    // Attack if we have combat advantage (our units >= enemy * 1.5)
    if (closestEnemy && stack.units >= closestEnemy.units * 1.5) {
      const dir = directionToward(pos, closestEnemy.pos, board);
      if (dir) {
        orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
        continue;
      }
    }

    // If enemy visible but not strong enough to attack - move toward it cautiously (don't split)
    if (closestEnemy && closestDist <= 3) {
      // Only approach if not outnumbered
      if (stack.units >= closestEnemy.units) {
        const dir = directionToward(pos, closestEnemy.pos, board);
        if (dir) {
          orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
          continue;
        }
      }
      // Outnumbered - hold position
      continue;
    }

    // No enemies nearby: scout with small groups if large stack, otherwise move to center
    if (stack.units >= 8 && !closestEnemy) {
      // Send scout toward nearest neutral if visible
      const scoutSize = Math.max(1, Math.floor(stack.units * 0.2));
      const scoutTarget = nearNeutral ? directionToward(pos, nearNeutral.neutral.pos, board) : null;
      const scoutDir = scoutTarget ?? randomDirection(pos, board);
      if (scoutDir) {
        orders.push({ playerId, from: pos, unitCount: scoutSize, direction: scoutDir });
      }
      // Main body moves to center or nearest neutral
      const remaining = stack.units - scoutSize;
      if (remaining > 0) {
        const mainTarget = nearNeutral && !scoutTarget ? center : (nearNeutral ? nearNeutral.neutral.pos : center);
        if (!(pos.x === mainTarget.x && pos.y === mainTarget.y)) {
          const mainDir = directionToward(pos, mainTarget, board);
          if (mainDir && mainDir !== scoutDir) {
            orders.push({ playerId, from: pos, unitCount: remaining, direction: mainDir });
          }
        }
      }
      continue;
    }

    // Default: move toward nearest neutral or center
    const defaultTarget = nearNeutral ? nearNeutral.neutral.pos : center;
    if (pos.x === defaultTarget.x && pos.y === defaultTarget.y) continue;
    const dir = directionToward(pos, defaultTarget, board);
    if (dir) {
      orders.push({ playerId, from: pos, unitCount: stack.units, direction: dir });
    }
  }

  return orders;
}

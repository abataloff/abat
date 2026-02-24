import { TurnOrders, MoveOrder, TurnResult, MovementResult, CombatResult, NEUTRAL_PLAYER_ID } from './types';
import { Board } from './board';
import { Stack } from './stack';
import { resolveCombat } from './combat';
import { RNG } from '../util/random';

interface PlannedMove {
  playerId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  units: number;
  sourceStack: Stack;
}

function validateOrders(board: Board, orders: TurnOrders): MoveOrder[] {
  const valid: MoveOrder[] = [];

  // Group by source cell
  const bySource = new Map<string, MoveOrder[]>();
  for (const move of orders.moves) {
    const key = `${move.from.x},${move.from.y}`;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(move);
  }

  for (const [, moves] of bySource) {
    const pos = moves[0].from;
    const stack = board.getPlayerStack(pos, orders.playerId);
    if (!stack) continue;

    const totalRequested = moves.reduce((s, m) => s + m.unitCount, 0);
    if (totalRequested > stack.units) continue; // reject all orders for this cell

    for (const move of moves) {
      const dest = board.applyDirection(move.from, move.direction);
      if (board.isInBounds(dest)) {
        valid.push(move);
      }
    }
  }

  return valid;
}

export function resolveTurn(
  board: Board,
  allOrders: TurnOrders[],
  rng: RNG,
  turnNumber: number,
): TurnResult {
  // Phase 1: Validate
  const validMoves: PlannedMove[] = [];
  for (const orders of allOrders) {
    const validated = validateOrders(board, orders);
    for (const move of validated) {
      const stack = board.getPlayerStack(move.from, move.playerId);
      if (!stack) continue;
      const dest = board.applyDirection(move.from, move.direction);
      validMoves.push({
        playerId: move.playerId,
        from: move.from,
        to: dest,
        units: move.unitCount,
        sourceStack: stack,
      });
    }
  }

  // Phase 2: Remove moving units from source cells (simultaneously)
  const splitStacks: { stack: Stack; move: PlannedMove }[] = [];
  for (const move of validMoves) {
    const newStack = move.sourceStack.split(move.units);
    splitStacks.push({ stack: newStack, move });
  }

  // Phase 3: Place all at destinations
  const movements: MovementResult[] = [];
  for (const { stack, move } of splitStacks) {
    board.addStack(move.to, stack);
    movements.push({
      playerId: move.playerId,
      from: move.from,
      to: move.to,
      units: move.units,
    });
  }

  // Phase 4: Merge allied stacks
  board.mergeAlliedStacks();

  // Phase 5: Resolve combat on each cell with multiple players (excluding neutrals)
  const combats: CombatResult[] = [];
  for (const pos of board.getOccupiedCells()) {
    const stacks = board.getStacks(pos);
    const combatStacks = stacks.filter((s) => s.alive && s.playerId !== NEUTRAL_PLAYER_ID);
    const playerIds = new Set(combatStacks.map((s) => s.playerId));
    if (playerIds.size < 2) continue;

    const result = resolveCombat(pos, combatStacks, rng);
    if (!result) continue;

    // Apply combat result: set winner units, eliminate losers
    for (const s of combatStacks) {
      if (s.playerId === result.winnerId) {
        s.units = result.unitsAfter;
      } else {
        s.units = 0;
      }
    }
    combats.push(result);
  }

  // Phase 5.5: Absorb neutrals - if exactly one player on a cell with neutrals, transfer units
  for (const pos of board.getOccupiedCells()) {
    const stacks = board.getStacks(pos);
    const neutrals = stacks.filter((s) => s.alive && s.playerId === NEUTRAL_PLAYER_ID);
    if (neutrals.length === 0) continue;

    const playerStacks = stacks.filter((s) => s.alive && s.playerId !== NEUTRAL_PLAYER_ID);
    const playerIds = new Set(playerStacks.map((s) => s.playerId));
    if (playerIds.size !== 1) continue;

    // Transfer neutral units to the player's stack
    const playerStack = playerStacks[0];
    for (const n of neutrals) {
      playerStack.units += n.units;
      n.units = 0;
    }
  }

  // Phase 6: Cleanup dead stacks
  board.cleanup();

  // Phase 7: Check eliminations
  const allPlayerIds = new Set<number>();
  for (const orders of allOrders) {
    allPlayerIds.add(orders.playerId);
  }

  const eliminations: number[] = [];
  for (const pid of allPlayerIds) {
    if (board.getPlayerTotalUnits(pid) === 0) {
      eliminations.push(pid);
    }
  }

  // Check winner: only one player left with units
  const alivePlayers = [...allPlayerIds].filter(
    (pid) => board.getPlayerTotalUnits(pid) > 0,
  );
  const winnerId = alivePlayers.length === 1 ? alivePlayers[0] : null;

  return { turnNumber, movements, combats, eliminations, winnerId };
}

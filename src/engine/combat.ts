import { Position, CombatResult } from './types';
import { Stack } from './stack';
import { RNG } from '../util/random';

interface Force {
  playerId: number;
  units: number;
}

function groupForces(stacks: Stack[]): Force[] {
  const map = new Map<number, number>();
  for (const s of stacks) {
    if (!s.alive) continue;
    map.set(s.playerId, (map.get(s.playerId) ?? 0) + s.units);
  }
  return [...map.entries()]
    .map(([playerId, units]) => ({ playerId, units }))
    .sort((a, b) => b.units - a.units);
}

export function resolveCombat(
  position: Position,
  stacks: Stack[],
  rng: RNG,
): CombatResult | null {
  const forces = groupForces(stacks);
  if (forces.length < 2) return null;

  const participants = forces.map((f) => ({
    playerId: f.playerId,
    unitsBefore: f.units,
  }));

  if (forces.length === 2) {
    return resolveTwoPlayer(position, participants, forces, rng);
  }
  return resolveMultiPlayer(position, participants, forces, rng);
}

function resolveTwoPlayer(
  position: Position,
  participants: { playerId: number; unitsBefore: number }[],
  forces: Force[],
  rng: RNG,
): CombatResult {
  const [a, b] = forces;

  if (a.units !== b.units) {
    // Unequal: stronger wins, loses floor(weaker / 2)
    const losses = Math.floor(b.units / 2);
    return {
      position,
      participants,
      winnerId: a.playerId,
      unitsAfter: a.units - losses,
      eliminated: [b.playerId],
    };
  }

  // Equal: random winner, keeps ceil(units * 0.15) min 1
  const winnerIdx = rng.nextInt(0, 1);
  const winner = forces[winnerIdx];
  const loser = forces[1 - winnerIdx];
  const surviving = Math.max(1, Math.ceil(winner.units * 0.15));

  return {
    position,
    participants,
    winnerId: winner.playerId,
    unitsAfter: surviving,
    eliminated: [loser.playerId],
  };
}

function resolveMultiPlayer(
  position: Position,
  participants: { playerId: number; unitsBefore: number }[],
  forces: Force[],
  rng: RNG,
): CombatResult {
  const maxUnits = forces[0].units;
  const strongest = forces.filter((f) => f.units === maxUnits);

  let winner: Force;
  if (strongest.length === 1) {
    winner = strongest[0];
  } else {
    winner = strongest[rng.nextInt(0, strongest.length - 1)];
  }

  const losers = forces.filter((f) => f.playerId !== winner.playerId);
  const sumOfLosers = losers.reduce((sum, f) => sum + f.units, 0);

  let unitsAfter: number;
  if (strongest.length > 1) {
    // Tie among strongest - equal forces rule
    unitsAfter = Math.max(1, Math.ceil(winner.units * 0.15));
  } else {
    // Clear strongest
    unitsAfter = Math.max(1, winner.units - Math.floor(sumOfLosers / 2));
  }

  return {
    position,
    participants,
    winnerId: winner.playerId,
    unitsAfter,
    eliminated: losers.map((l) => l.playerId),
  };
}

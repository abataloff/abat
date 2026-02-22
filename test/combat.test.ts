import { describe, it, expect } from 'vitest';
import { resolveCombat } from '../src/engine/combat';
import { Stack } from '../src/engine/stack';
import { RNG } from '../src/util/random';

const pos = { x: 0, y: 0 };

describe('resolveCombat', () => {
  describe('two players - unequal forces', () => {
    it('stronger wins, loses floor(weaker/2)', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 7)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      expect(result.unitsAfter).toBe(10 - Math.floor(7 / 2)); // 10 - 3 = 7
      expect(result.eliminated).toEqual([1]);
    });

    it('stronger wins even with 1 unit advantage', () => {
      const stacks = [new Stack(0, 6), new Stack(1, 5)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      expect(result.unitsAfter).toBe(6 - Math.floor(5 / 2)); // 6 - 2 = 4
    });

    it('floor rounding for odd weaker count', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 3)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      expect(result.unitsAfter).toBe(10 - Math.floor(3 / 2)); // 10 - 1 = 9
    });

    it('weaker has 1 unit: winner loses 0', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 1)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      expect(result.unitsAfter).toBe(10); // floor(1/2) = 0
    });

    it('order in stacks array does not matter', () => {
      const stacks = [new Stack(1, 3), new Stack(0, 10)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      expect(result.unitsAfter).toBe(9);
    });
  });

  describe('two players - equal forces', () => {
    it('random winner keeps ceil(units * 0.15) min 1', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 10)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect([0, 1]).toContain(result.winnerId);
      expect(result.unitsAfter).toBe(Math.max(1, Math.ceil(10 * 0.15))); // 2
      expect(result.eliminated.length).toBe(1);
    });

    it('equal forces with 1 unit each', () => {
      const stacks = [new Stack(0, 1), new Stack(1, 1)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.unitsAfter).toBe(1); // ceil(1*0.15) = 1, min 1
    });

    it('equal forces with 2 units each', () => {
      const stacks = [new Stack(0, 2), new Stack(1, 2)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.unitsAfter).toBe(1); // ceil(2*0.15) = ceil(0.3) = 1
    });

    it('equal forces with 100 units each', () => {
      const stacks = [new Stack(0, 100), new Stack(1, 100)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.unitsAfter).toBe(15); // ceil(100*0.15) = 15
    });
  });

  describe('multi-player combat', () => {
    it('clear strongest wins vs all', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 5), new Stack(2, 3)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      // loses floor((5+3)/2) = 4
      expect(result.unitsAfter).toBe(10 - 4); // 6
      expect(result.eliminated).toContain(1);
      expect(result.eliminated).toContain(2);
    });

    it('tied strongest: random winner with 15% rule', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 10), new Stack(2, 3)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect([0, 1]).toContain(result.winnerId);
      expect(result.unitsAfter).toBe(Math.max(1, Math.ceil(10 * 0.15))); // 2
      expect(result.eliminated.length).toBe(2);
    });

    it('winner clamped to 1 if losses would kill', () => {
      const stacks = [new Stack(0, 5), new Stack(1, 4), new Stack(2, 4)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      // floor((4+4)/2) = 4, 5-4 = 1
      expect(result.unitsAfter).toBe(1);
    });

    it('winner clamped to 1 even if losses exceed strength', () => {
      const stacks = [new Stack(0, 5), new Stack(1, 4), new Stack(2, 4), new Stack(3, 4)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect(result.winnerId).toBe(0);
      // floor((4+4+4)/2) = 6, 5-6 = -1 -> clamped to 1
      expect(result.unitsAfter).toBe(1);
    });

    it('4 players all equal: random winner with 15% rule', () => {
      const stacks = [new Stack(0, 10), new Stack(1, 10), new Stack(2, 10), new Stack(3, 10)];
      const result = resolveCombat(pos, stacks, new RNG(42))!;
      expect([0, 1, 2, 3]).toContain(result.winnerId);
      expect(result.unitsAfter).toBe(2); // ceil(10*0.15)
      expect(result.eliminated.length).toBe(3);
    });
  });

  it('returns null for single player', () => {
    const stacks = [new Stack(0, 10)];
    expect(resolveCombat(pos, stacks, new RNG(42))).toBeNull();
  });
});

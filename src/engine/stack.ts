export class Stack {
  constructor(
    public readonly playerId: number,
    public units: number,
  ) {}

  split(count: number): Stack {
    if (count < 1 || count > this.units) {
      throw new Error(`Invalid split: ${count} from ${this.units}`);
    }
    this.units -= count;
    return new Stack(this.playerId, count);
  }

  merge(other: Stack): void {
    if (other.playerId !== this.playerId) {
      throw new Error('Cannot merge stacks of different players');
    }
    this.units += other.units;
    other.units = 0;
  }

  get alive(): boolean {
    return this.units > 0;
  }

  clone(): Stack {
    return new Stack(this.playerId, this.units);
  }
}

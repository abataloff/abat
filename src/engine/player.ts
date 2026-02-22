import { PLAYER_COLORS, PLAYER_NAMES } from './types';

export class Player {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  eliminated = false;

  constructor(id: number, name?: string, color?: string) {
    this.id = id;
    this.name = name ?? PLAYER_NAMES[id] ?? `Player ${id + 1}`;
    this.color = color ?? PLAYER_COLORS[id] ?? '#888888';
  }
}

export interface Position {
  x: number; // column (0-based)
  y: number; // row (0-based)
}

export enum Direction {
  N = 'N',
  NE = 'NE',
  E = 'E',
  SE = 'SE',
  S = 'S',
  SW = 'SW',
  W = 'W',
  NW = 'NW',
}

export const DIRECTION_DELTA: Record<Direction, Position> = {
  [Direction.N]: { x: 0, y: -1 },
  [Direction.NE]: { x: 1, y: -1 },
  [Direction.E]: { x: 1, y: 0 },
  [Direction.SE]: { x: 1, y: 1 },
  [Direction.S]: { x: 0, y: 1 },
  [Direction.SW]: { x: -1, y: 1 },
  [Direction.W]: { x: -1, y: 0 },
  [Direction.NW]: { x: -1, y: -1 },
};

export enum GamePhase {
  SETUP = 'SETUP',
  ORDER_INPUT = 'ORDER_INPUT',
  RESOLUTION = 'RESOLUTION',
  GAME_OVER = 'GAME_OVER',
}

export interface MoveOrder {
  playerId: number;
  from: Position;
  unitCount: number;
  direction: Direction;
}

export interface TurnOrders {
  playerId: number;
  moves: MoveOrder[];
}

export interface GameConfig {
  cols: number;
  rows: number;
  playerCount: number;
  startingUnits: number;
  seed?: number;
  visionRadius: number;
}

export interface CombatResult {
  position: Position;
  participants: { playerId: number; unitsBefore: number }[];
  winnerId: number;
  unitsAfter: number;
  eliminated: number[];
}

export interface MovementResult {
  playerId: number;
  from: Position;
  to: Position;
  units: number;
}

export interface TurnResult {
  turnNumber: number;
  movements: MovementResult[];
  combats: CombatResult[];
  eliminations: number[];
  winnerId: number | null;
}

export const PLAYER_COLORS = ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A'];
export const PLAYER_NAMES = ['Красный', 'Синий', 'Бирюзовый', 'Золотой'];

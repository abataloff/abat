import { GameConfig, CombatResult, MovementResult, MoveOrder } from '../engine/types';

// --- Board snapshot (fog-of-war filtered) ---

export interface CellSnapshot {
  x: number;
  y: number;
  stacks: { playerId: number; units: number }[];
}

export interface BoardSnapshot {
  cells: CellSnapshot[];
  visibleKeys: string[];
}

export interface PlayerInfo {
  id: number;
  name: string;
  color: string;
  connected: boolean;
  eliminated: boolean;
  avatarUrl?: string;
}

// --- Client → Server messages ---

export interface CreateRoomMsg {
  type: 'create-room';
  config: Omit<GameConfig, 'seed'>;
  playerName: string;
}

export interface JoinRoomMsg {
  type: 'join-room';
  roomCode: string;
  playerName: string;
}

export interface SubmitOrdersMsg {
  type: 'submit-orders';
  moves: MoveOrder[];
}

export interface ReconnectMsg {
  type: 'reconnect';
  roomCode: string;
  playerId: number;
}

export type ClientMessage = CreateRoomMsg | JoinRoomMsg | SubmitOrdersMsg | ReconnectMsg;

// --- Server → Client messages ---

export interface RoomCreatedMsg {
  type: 'room-created';
  roomCode: string;
  playerId: number;
  config: Omit<GameConfig, 'seed'>;
}

export interface RoomJoinedMsg {
  type: 'room-joined';
  roomCode: string;
  playerId: number;
  config: Omit<GameConfig, 'seed'>;
  players: PlayerInfo[];
}

export interface PlayerJoinedMsg {
  type: 'player-joined';
  players: PlayerInfo[];
}

export interface PlayerDisconnectedMsg {
  type: 'player-disconnected';
  playerId: number;
}

export interface GameStartedMsg {
  type: 'game-started';
  playerId: number;
  config: Omit<GameConfig, 'seed'>;
  board: BoardSnapshot;
  players: PlayerInfo[];
}

export interface TurnStartMsg {
  type: 'turn-start';
  turnNumber: number;
  board: BoardSnapshot;
  players: PlayerInfo[];
}

export interface OrdersAcceptedMsg {
  type: 'orders-accepted';
}

export interface WaitingForPlayersMsg {
  type: 'waiting-for-players';
  pending: number[];
}

export interface TurnResolvedMsg {
  type: 'turn-resolved';
  turnNumber: number;
  board: BoardSnapshot;
  combats: CombatResult[];
  movements: MovementResult[];
  eliminations: number[];
  winnerId: number | null;
}

export interface ReconnectedMsg {
  type: 'reconnected';
  roomCode: string;
  playerId: number;
  config: Omit<GameConfig, 'seed'>;
  board: BoardSnapshot;
  players: PlayerInfo[];
  turnNumber: number;
  gameOver: boolean;
  winnerId: number | null;
}

export interface ErrorMsg {
  type: 'error';
  message: string;
  code: string;
}

export type ServerMessage =
  | RoomCreatedMsg
  | RoomJoinedMsg
  | ReconnectedMsg
  | PlayerJoinedMsg
  | PlayerDisconnectedMsg
  | GameStartedMsg
  | TurnStartMsg
  | OrdersAcceptedMsg
  | WaitingForPlayersMsg
  | TurnResolvedMsg
  | ErrorMsg;

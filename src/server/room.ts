import type { WebSocket } from 'ws';
import { Game } from '../engine/game';
import { GameConfig, CombatResult, TurnResult, PLAYER_COLORS, PLAYER_NAMES, MoveOrder } from '../engine/types';
import { serializeBoardForPlayer, filterMovements, filterCombats } from '../net/serialization';
import { PlayerInfo, ServerMessage } from '../net/protocol';

interface ConnectedPlayer {
  ws: WebSocket | null;
  id: number;
  name: string;
  connected: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export class Room {
  readonly code: string;
  readonly config: Omit<GameConfig, 'seed'>;
  private players: ConnectedPlayer[] = [];
  private game: Game | null = null;
  private pendingOrders = new Set<number>();

  constructor(code: string, config: Omit<GameConfig, 'seed'>) {
    this.code = code;
    this.config = config;
  }

  get playerCount(): number {
    return this.players.length;
  }

  get isEmpty(): boolean {
    return this.players.every((p) => !p.connected);
  }

  get isStarted(): boolean {
    return this.game !== null;
  }

  addPlayer(ws: WebSocket, name: string): number | null {
    if (this.players.length >= this.config.playerCount) return null;
    if (this.game) return null;

    const id = this.players.length;
    this.players.push({ ws, id, name, connected: true, disconnectTimer: null });
    return id;
  }

  reconnectPlayer(ws: WebSocket, playerId: number): boolean {
    const player = this.players[playerId];
    if (!player) return false;

    player.ws = ws;
    player.connected = true;
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }

    // Notify others
    this.broadcastExcept(playerId, {
      type: 'player-joined',
      players: this.getPlayerInfoList(),
    });

    // Send current state if game is running
    if (this.game) {
      const board = serializeBoardForPlayer(
        this.game.board,
        playerId,
        this.config.visionRadius,
      );
      this.sendTo(playerId, {
        type: 'turn-start',
        turnNumber: this.game.turnNumber,
        board,
        players: this.getPlayerInfoList(),
      });
    }

    return true;
  }

  handleDisconnect(playerId: number): void {
    const player = this.players[playerId];
    if (!player) return;

    player.connected = false;
    player.ws = null;

    this.broadcastExcept(playerId, {
      type: 'player-disconnected',
      playerId,
    });

    if (this.game) {
      // Auto-submit empty orders after 30 seconds
      player.disconnectTimer = setTimeout(() => {
        if (!player.connected && this.game && this.pendingOrders.has(playerId)) {
          this.submitOrders(playerId, []);
        }
      }, 30_000);
    }
  }

  tryStart(): boolean {
    if (this.game) return false;
    if (this.players.length < this.config.playerCount) return false;

    this.startGame();
    return true;
  }

  submitOrders(playerId: number, moves: MoveOrder[]): void {
    if (!this.game) return;
    if (!this.pendingOrders.has(playerId)) return;

    // Delete BEFORE submitOrders because submitOrders may synchronously
    // trigger resolve -> onTurnResolved -> startOrderPhase which creates
    // a new pendingOrders set for the next turn.
    this.pendingOrders.delete(playerId);
    this.sendTo(playerId, { type: 'orders-accepted' });

    if (this.pendingOrders.size > 0) {
      this.broadcast({
        type: 'waiting-for-players',
        pending: [...this.pendingOrders],
      });
    }

    // Stamp playerId onto moves and submit (may trigger resolve synchronously)
    const stamped = moves.map((m) => ({ ...m, playerId }));
    this.game.submitOrders({ playerId, moves: stamped });
  }

  getPlayerInfoList(): PlayerInfo[] {
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: PLAYER_COLORS[p.id] ?? '#888',
      connected: p.connected,
      eliminated: this.game
        ? this.game.players[p.id]?.eliminated ?? false
        : false,
    }));
  }

  findPlayerByWs(ws: WebSocket): number | undefined {
    return this.players.find((p) => p.ws === ws)?.id;
  }

  private startGame(): void {
    const config: GameConfig = {
      ...this.config,
      seed: Math.floor(Math.random() * 2147483647),
    };

    this.game = new Game(config);

    this.game.events.on('turn-resolved', (result) => {
      this.onTurnResolved(result as TurnResult);
    });

    // Send game-started to each player with their fog of war view
    for (const player of this.players) {
      const board = serializeBoardForPlayer(
        this.game.board,
        player.id,
        this.config.visionRadius,
      );
      this.sendTo(player.id, {
        type: 'game-started',
        playerId: player.id,
        config: this.config,
        board,
        players: this.getPlayerInfoList(),
      });
    }

    this.startOrderPhase();
  }

  private startOrderPhase(): void {
    if (!this.game) return;

    const activePlayers = this.game.getActivePlayers();
    this.pendingOrders = new Set(activePlayers.map((p) => p.id));

    // Send turn-start to each player with their fog of war view
    for (const player of this.players) {
      if (this.game.players[player.id]?.eliminated) continue;
      const board = serializeBoardForPlayer(
        this.game.board,
        player.id,
        this.config.visionRadius,
      );
      this.sendTo(player.id, {
        type: 'turn-start',
        turnNumber: this.game.turnNumber,
        board,
        players: this.getPlayerInfoList(),
      });
    }

    // Notify about pending players
    this.broadcast({
      type: 'waiting-for-players',
      pending: [...this.pendingOrders],
    });
  }

  private onTurnResolved(result: TurnResult): void {
    if (!this.game) return;

    // Send turn-resolved to each player with their fog of war
    for (const player of this.players) {
      const board = serializeBoardForPlayer(
        this.game.board,
        player.id,
        this.config.visionRadius,
      );
      const visibleKeys = new Set(board.visibleKeys);

      this.sendTo(player.id, {
        type: 'turn-resolved',
        turnNumber: result.turnNumber,
        board,
        combats: filterCombats(result.combats, visibleKeys),
        movements: filterMovements(result.movements, visibleKeys),
        eliminations: result.eliminations,
        winnerId: result.winnerId,
      });
    }

    // If game not over, prepare pending orders (don't send turn-start,
    // clients will start order input after viewing resolution)
    if (result.winnerId === null) {
      const activePlayers = this.game.getActivePlayers();
      this.pendingOrders = new Set(activePlayers.map((p) => p.id));
    }
  }

  private sendTo(playerId: number, msg: ServerMessage): void {
    const player = this.players[playerId];
    if (!player?.ws || !player.connected) return;
    try {
      player.ws.send(JSON.stringify(msg));
    } catch {
      // Connection lost
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const player of this.players) {
      this.sendTo(player.id, msg);
    }
  }

  private broadcastExcept(excludeId: number, msg: ServerMessage): void {
    for (const player of this.players) {
      if (player.id !== excludeId) {
        this.sendTo(player.id, msg);
      }
    }
  }
}

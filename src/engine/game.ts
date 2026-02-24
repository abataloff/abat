import { GameConfig, GamePhase, TurnOrders, TurnResult, NEUTRAL_PLAYER_ID } from './types';
import { Board } from './board';
import { Stack } from './stack';
import { Player } from './player';
import { resolveTurn } from './resolver';
import { EventEmitter } from '../util/event-emitter';
import { RNG } from '../util/random';

export class Game {
  readonly config: GameConfig;
  readonly board: Board;
  readonly players: Player[];
  readonly events = new EventEmitter();

  private rng: RNG;
  private _phase: GamePhase = GamePhase.ORDER_INPUT;
  private _turnNumber = 1;
  private pendingOrders = new Map<number, TurnOrders>();
  private _winnerId: number | null = null;

  constructor(config: GameConfig) {
    this.config = config;
    this.board = new Board(config.cols, config.rows);
    this.rng = new RNG(config.seed);

    this.players = [];
    for (let i = 0; i < config.playerCount; i++) {
      this.players.push(new Player(i));
    }

    const starts = Board.getStartPositions(config.cols, config.rows, config.playerCount);
    for (let i = 0; i < config.playerCount; i++) {
      this.board.addStack(starts[i], new Stack(i, config.startingUnits));
    }

    // Spawn neutral stacks on random empty cells
    const occupiedKeys = new Set(starts.map((p) => `${p.x},${p.y}`));
    const neutralCount = Math.floor(config.cols * config.rows * 0.15);
    let placed = 0;
    let attempts = 0;
    while (placed < neutralCount && attempts < neutralCount * 10) {
      attempts++;
      const x = this.rng.nextInt(0, config.cols - 1);
      const y = this.rng.nextInt(0, config.rows - 1);
      const key = `${x},${y}`;
      if (occupiedKeys.has(key)) continue;
      occupiedKeys.add(key);
      const units = this.rng.nextInt(1, 3);
      this.board.addStack({ x, y }, new Stack(NEUTRAL_PLAYER_ID, units));
      placed++;
    }
  }

  get phase(): GamePhase {
    return this._phase;
  }

  get turnNumber(): number {
    return this._turnNumber;
  }

  get winnerId(): number | null {
    return this._winnerId;
  }

  getActivePlayers(): Player[] {
    return this.players.filter((p) => !p.eliminated);
  }

  /** Returns players who haven't submitted orders yet this turn */
  getPendingPlayers(): Player[] {
    return this.getActivePlayers().filter((p) => !this.pendingOrders.has(p.id));
  }

  submitOrders(orders: TurnOrders): void {
    if (this._phase !== GamePhase.ORDER_INPUT) {
      throw new Error(`Cannot submit orders in phase ${this._phase}`);
    }
    const player = this.players[orders.playerId];
    if (!player || player.eliminated) {
      throw new Error(`Invalid player ${orders.playerId}`);
    }
    this.pendingOrders.set(orders.playerId, orders);
    this.events.emit('orders-submitted', orders.playerId);

    if (this.getPendingPlayers().length === 0) {
      this.resolve();
    }
  }

  private resolve(): void {
    this._phase = GamePhase.RESOLUTION;
    this.events.emit('phase-changed', this._phase);

    const allOrders = [...this.pendingOrders.values()];
    const result = resolveTurn(this.board, allOrders, this.rng, this._turnNumber);

    // Mark eliminated players
    for (const pid of result.eliminations) {
      const player = this.players[pid];
      if (player && !player.eliminated) {
        player.eliminated = true;
        this.events.emit('player-eliminated', pid);
      }
    }

    if (result.winnerId !== null) {
      this._winnerId = result.winnerId;
      this._phase = GamePhase.GAME_OVER;
      this.events.emit('game-over', result.winnerId);
    } else {
      this._turnNumber++;
      this._phase = GamePhase.ORDER_INPUT;
      this.pendingOrders.clear();
    }

    this.events.emit('turn-resolved', result);
    this.events.emit('phase-changed', this._phase);
  }

  getLastTurnResult(): TurnResult | null {
    return null; // TODO: store history if needed
  }
}

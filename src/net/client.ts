import { GameConfig, MoveOrder } from '../engine/types';
import { ClientMessage, ServerMessage } from './protocol';

type MessageHandler = (msg: ServerMessage) => void;

export class GameClient {
  private ws: WebSocket | null = null;
  private url = '';
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = false;

  connect(url: string): Promise<void> {
    this.url = url;
    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data as string);
          this.emit(msg.type, msg);
          this.emit('*', msg);
        } catch {
          // Ignore unparseable messages
        }
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            this.doConnect().catch(() => {});
          }, this.reconnectDelay * this.reconnectAttempts);
        }
        this.emit('disconnected', { type: 'error', message: 'Disconnected', code: 'DISCONNECTED' });
      };

      this.ws.onerror = () => {
        if (this.reconnectAttempts === 0) {
          reject(new Error('Connection failed'));
        }
      };
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom(config: Omit<GameConfig, 'seed'>, playerName: string): void {
    this.send({ type: 'create-room', config, playerName });
  }

  joinRoom(roomCode: string, playerName: string): void {
    this.send({ type: 'join-room', roomCode, playerName });
  }

  reconnect(roomCode: string, playerId: number): void {
    this.send({ type: 'reconnect', roomCode, playerId });
  }

  submitOrders(moves: MoveOrder[]): void {
    this.send({ type: 'submit-orders', moves });
  }

  on(event: string, handler: MessageHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: MessageHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, msg: ServerMessage): void {
    this.handlers.get(event)?.forEach((fn) => fn(msg));
  }
}

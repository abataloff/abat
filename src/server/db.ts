import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/abat.db';

let db: Database.Database;

export function initDb(): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      config TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      winner_id INTEGER,
      turn_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'playing'
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      user_id INTEGER REFERENCES users(id),
      player_index INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      eliminated INTEGER NOT NULL DEFAULT 0,
      final_units INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS game_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      turn_number INTEGER NOT NULL,
      orders TEXT NOT NULL,
      result TEXT NOT NULL
    );
  `);
}

export interface DbUser {
  id: number;
  google_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  is_admin: number;
  created_at: string;
  last_login: string;
}

export function upsertGoogleUser(googleId: string, email: string, name: string, avatarUrl: string | null, adminEmails: string[]): DbUser {
  const isAdmin = adminEmails.includes(email) ? 1 : 0;

  db.prepare(`
    INSERT INTO users (google_id, email, name, avatar_url, is_admin, last_login)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(google_id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      is_admin = CASE WHEN excluded.is_admin = 1 THEN 1 ELSE users.is_admin END,
      last_login = datetime('now')
  `).run(googleId, email, name, avatarUrl, isAdmin);

  return db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as DbUser;
}

export function getUserById(id: number): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function getAllUsers(): DbUser[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as DbUser[];
}

export function createGame(roomCode: string, config: object): number {
  const result = db.prepare(
    'INSERT INTO games (room_code, config) VALUES (?, ?)',
  ).run(roomCode, JSON.stringify(config));
  return result.lastInsertRowid as number;
}

export function addGamePlayer(gameId: number, userId: number | null, playerIndex: number, playerName: string): number {
  const result = db.prepare(
    'INSERT INTO game_players (game_id, user_id, player_index, player_name) VALUES (?, ?, ?, ?)',
  ).run(gameId, userId, playerIndex, playerName);
  return result.lastInsertRowid as number;
}

export function saveTurn(gameId: number, turnNumber: number, orders: object, result: object): void {
  db.prepare(
    'INSERT INTO game_turns (game_id, turn_number, orders, result) VALUES (?, ?, ?, ?)',
  ).run(gameId, turnNumber, JSON.stringify(orders), JSON.stringify(result));

  db.prepare('UPDATE games SET turn_count = ? WHERE id = ?').run(turnNumber, gameId);
}

export function finishGame(gameId: number, winnerId: number | null): void {
  db.prepare(
    "UPDATE games SET status = 'finished', ended_at = datetime('now'), winner_id = ? WHERE id = ?",
  ).run(winnerId, gameId);
}

export function updatePlayerResult(gameId: number, playerIndex: number, eliminated: boolean, finalUnits: number): void {
  db.prepare(
    'UPDATE game_players SET eliminated = ?, final_units = ? WHERE game_id = ? AND player_index = ?',
  ).run(eliminated ? 1 : 0, finalUnits, gameId, playerIndex);
}

export function markGameAbandoned(gameId: number): void {
  db.prepare(
    "UPDATE games SET status = 'abandoned', ended_at = datetime('now') WHERE id = ? AND status = 'playing'",
  ).run(gameId);
}

export interface DbGame {
  id: number;
  room_code: string;
  config: string;
  started_at: string;
  ended_at: string | null;
  winner_id: number | null;
  turn_count: number;
  status: string;
}

export interface DbUserGame {
  id: number;
  room_code: string;
  status: string;
  turn_count: number;
  started_at: string;
  ended_at: string | null;
  winner_id: number | null;
  player_index: number;
  player_name: string;
  eliminated: number;
  final_units: number;
}

export function getUserGames(userId: number, limit = 50, offset = 0): { games: DbUserGame[]; total: number } {
  const total = (db.prepare(
    'SELECT COUNT(*) as cnt FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ?',
  ).get(userId) as { cnt: number }).cnt;
  const games = db.prepare(`
    SELECT g.id, g.room_code, g.status, g.turn_count, g.started_at, g.ended_at, g.winner_id,
           gp.player_index, gp.player_name, gp.eliminated, gp.final_units
    FROM games g
    JOIN game_players gp ON gp.game_id = g.id
    WHERE gp.user_id = ?
    ORDER BY g.started_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset) as DbUserGame[];
  return { games, total };
}

export function getGames(limit = 50, offset = 0): { games: DbGame[]; total: number } {
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM games').get() as { cnt: number }).cnt;
  const games = db.prepare('SELECT * FROM games ORDER BY started_at DESC LIMIT ? OFFSET ?').all(limit, offset) as DbGame[];
  return { games, total };
}

export function getGame(id: number): DbGame | undefined {
  return db.prepare('SELECT * FROM games WHERE id = ?').get(id) as DbGame | undefined;
}

export interface DbGameTurn {
  id: number;
  game_id: number;
  turn_number: number;
  orders: string;
  result: string;
}

export function getGameTurns(gameId: number): DbGameTurn[] {
  return db.prepare('SELECT * FROM game_turns WHERE game_id = ? ORDER BY turn_number').all(gameId) as DbGameTurn[];
}

export interface DbGamePlayer {
  id: number;
  game_id: number;
  user_id: number | null;
  player_index: number;
  player_name: string;
  eliminated: number;
  final_units: number;
}

export function getGamePlayers(gameId: number): DbGamePlayer[] {
  return db.prepare('SELECT * FROM game_players WHERE game_id = ? ORDER BY player_index').all(gameId) as DbGamePlayer[];
}

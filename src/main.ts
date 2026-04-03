import { Game } from './engine/game';
import { GamePhase, MoveOrder, CombatResult, PLAYER_COLORS, PLAYER_NAMES, Position, GameConfig } from './engine/types';
import { Renderer, RenderState } from './ui/renderer';
import { InputHandler } from './ui/input';
import { Overlay } from './ui/overlay';
import { getVisibleCells } from './engine/visibility';
import { GameClient } from './net/client';
import { deserializeBoard } from './net/serialization';
import { BoardSnapshot, PlayerInfo, ServerMessage, TurnResolvedMsg } from './net/protocol';
import { Board } from './engine/board';
import { generateOrders, AiDifficulty } from './engine/ai';
import { RouteManager } from './engine/route';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlayEl = document.getElementById('overlay') as HTMLElement;
const statusBar = document.getElementById('status-bar') as HTMLElement;
const overlay = new Overlay(overlayEl);

// ============================================================
// Entry point: mode selection
// ============================================================

const GUEST_PREFIXES = ['Воин', 'Рыцарь', 'Маг', 'Лучник', 'Следопыт', 'Страж', 'Берсерк', 'Друид', 'Паладин', 'Шаман'];

function generateGuestName(): string {
  const prefix = GUEST_PREFIXES[Math.floor(Math.random() * GUEST_PREFIXES.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${prefix}-${num}`;
}

let currentUser: { id: number; name: string; nickname?: string | null; email: string; avatarUrl?: string; isAdmin: boolean } | null = null;

async function fetchUser(): Promise<void> {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
}

async function onSetNickname(nickname: string): Promise<void> {
  const res = await fetch('/api/me/nickname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json();
  if (data.ok && currentUser) {
    currentUser.nickname = data.nickname;
    showMainMenu();
  }
}

function getDefaultName(): string {
  if (currentUser) return currentUser.nickname || currentUser.name;
  return generateGuestName();
}

function showMainMenu(): void {
  statusBar.innerHTML = '';
  overlay.showModeSelect(
    () => overlay.showSetup(startHotseatGame, showMainMenu),
    () => overlay.showAiSetup(startAiGame, showMainMenu, !!currentUser?.isAdmin),
    () => overlay.showOnlineLobby({
      onCreate: onCreateRoom,
      onJoin: onJoinRoom,
      onBack: showMainMenu,
      defaultName: getDefaultName(),
    }),
    currentUser,
    () => { window.location.href = '/auth/google'; },
    async () => {
      await fetch('/api/logout', { method: 'POST' });
      currentUser = null;
      showMainMenu();
    },
    onSetNickname,
    () => overlay.showRules(showMainMenu),
  );
}

async function tryReconnect(): Promise<boolean> {
  const session = getNetSession();
  if (!session) return false;

  try {
    netClient = new GameClient();
    await netClient.connect(getWsUrl());
    setupNetworkHandlers();
    netClient.reconnect(session.roomCode, session.playerId);
    return true;
  } catch {
    clearNetSession();
    if (netClient) {
      netClient.disconnect();
      netClient = null;
    }
    return false;
  }
}

fetchUser().then(async () => {
  const joinMatch = window.location.pathname.match(/^\/join\/([A-Za-z0-9]{4})$/);
  if (joinMatch) {
    clearNetSession();
    const roomCode = joinMatch[1].toUpperCase();
    history.replaceState(null, '', '/');
    const defaultName = getDefaultName();
    overlay.showInviteJoin(roomCode, defaultName, onJoinRoom, showMainMenu);
    return;
  }

  const reconnected = await tryReconnect();
  if (reconnected) return;

  showMainMenu();
});

// ============================================================
// Hot-seat mode (existing logic)
// ============================================================

let game: Game;
let renderer: Renderer;
let input: InputHandler;
let routeManager: RouteManager;
let currentPlayerIndex = 0;
let pendingOrders: MoveOrder[] = [];
let lastCombats: CombatResult[] = [];
let selectedCell: Position | null = null;
let validMoves: Position[] = [];

function startHotseatGame(config: { cols: number; rows: number; playerCount: number; startingUnits: number; visionRadius: number }) {
  game = new Game(config);
  renderer = new Renderer(canvas, config.cols, config.rows);
  input = new InputHandler(canvas, renderer);
  routeManager = new RouteManager();
  lastCombats = [];

  input.onCellClick((pos) => {
    if (game.phase !== GamePhase.ORDER_INPUT) return;
    overlay.onCellSelected(pos, game.board);
  });

  window.addEventListener('resize', () => {
    renderer.resize();
    renderHotseatBoard();
  });

  game.events.on('turn-resolved', (result) => {
    const turnResult = result as {
      turnNumber: number;
      movements: unknown[];
      combats: CombatResult[];
      eliminations: number[];
      winnerId: number | null;
    };

    lastCombats = turnResult.combats;
    routeManager.advanceRoutes(game.board);

    if (turnResult.winnerId !== null) {
      renderHotseatBoard();
      updateHotseatStatusBar();
      overlay.showVictory(turnResult.winnerId, () => {
        statusBar.innerHTML = '';
        showMainMenu();
      });
      return;
    }

    updateHotseatStatusBar();

    const activePlayers = game.getActivePlayers();
    let resPlayerIndex = 0;

    function showResolutionForNextPlayer() {
      if (resPlayerIndex >= activePlayers.length) {
        lastCombats = [];
        startHotseatTurn();
        return;
      }

      const player = activePlayers[resPlayerIndex];
      resPlayerIndex++;

      overlay.showResolutionPassScreen(player.id, turnResult.turnNumber, () => {
        const visible = getVisibleCells(game.board, player.id, game.config.visionRadius);

        const visibleCombats = turnResult.combats.filter((c) =>
          visible.has(`${c.position.x},${c.position.y}`),
        );
        lastCombats = visibleCombats;

        renderHotseatBoard(false, player.id, undefined, visible);
        overlay.showCombatResults(
          visibleCombats,
          turnResult.eliminations,
          (id) => PLAYER_NAMES[id] ?? `Игрок ${id + 1}`,
          () => showResolutionForNextPlayer(),
        );
      });
    }

    showResolutionForNextPlayer();
  });

  updateHotseatStatusBar();
  startHotseatTurn();
}

function updateHotseatStatusBar() {
  if (!game) { statusBar.innerHTML = ''; return; }
  const turnHtml = `<span class="status-turn">Ход ${game.turnNumber}</span>`;
  const playersHtml = game.players
    .map((p) => {
      const units = game.board.getPlayerTotalUnits(p.id);
      const eliminated = p.eliminated;
      const cls = eliminated ? 'status-player status-eliminated' : 'status-player';
      return `<span class="${cls}">
        <span class="status-dot" style="background:${p.color}"></span>
        ${p.name}: ${units}
      </span>`;
    })
    .join('');
  statusBar.innerHTML = turnHtml + playersHtml;
}

function startHotseatTurn() {
  const activePlayers = game.getActivePlayers();
  currentPlayerIndex = 0;
  updateHotseatStatusBar();
  showPassScreen(activePlayers[currentPlayerIndex].id);
}

function showPassScreen(playerId: number) {
  renderHotseatBoard(true);
  overlay.showPassScreen(playerId, game.turnNumber, () => {
    startPlayerOrderPhase(playerId);
  });
}

function startPlayerOrderPhase(playerId: number) {
  pendingOrders = [];
  selectedCell = null;
  validMoves = [];
  renderHotseatBoard(false, playerId, pendingOrders);

  overlay.startOrderInput(
    playerId,
    game.board,
    (orders) => {
      selectedCell = null;
      validMoves = [];
      game.submitOrders({ playerId, moves: orders });

      if (game.phase === GamePhase.ORDER_INPUT) {
        currentPlayerIndex++;
        const activePlayers = game.getActivePlayers();
        if (currentPlayerIndex < activePlayers.length) {
          showPassScreen(activePlayers[currentPlayerIndex].id);
        }
      }
    },
    (orders) => {
      pendingOrders = orders;
      renderHotseatBoard(false, playerId, pendingOrders);
    },
    (state) => {
      selectedCell = state.selectedCell;
      validMoves = state.validMoves;
      renderHotseatBoard(false, playerId, pendingOrders);
    },
    routeManager,
  );
}

function renderHotseatBoard(hidden = false, currentPlayerId?: number, orders?: MoveOrder[], visibleCells?: Set<string>) {
  if (!renderer || !game) return;

  if (hidden) {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  let vis: Set<string> | null = visibleCells ?? null;
  if (!vis && currentPlayerId !== undefined) {
    vis = getVisibleCells(game.board, currentPlayerId, game.config.visionRadius);
  }

  const highlightCells =
    currentPlayerId !== undefined
      ? game.board.getPlayerStacks(currentPlayerId).map((s) => s.pos)
      : [];

  const routePaths = currentPlayerId !== undefined
    ? routeManager.getPlayerRoutes(currentPlayerId).map((r) => ({
        playerId: r.playerId,
        currentPos: r.currentPos,
        path: r.path,
        unitCount: r.unitCount,
      }))
    : [];

  const state: RenderState = {
    board: game.board,
    orders: orders ?? [],
    selectedCell,
    validMoves,
    currentPlayerId: currentPlayerId ?? null,
    highlightCells,
    combatCells: lastCombats,
    visibleCells: vis,
    routePaths,
  };
  renderer.render(state);
}

// ============================================================
// AI mode
// ============================================================

let aiGame: Game;
let aiRenderer: Renderer;
let aiInput: InputHandler;
let aiRouteManager: RouteManager;
let aiDebugMode = false;
let aiDifficulty: AiDifficulty = 'medium';
let aiPendingOrders: MoveOrder[] = [];
let aiLastCombats: CombatResult[] = [];
let aiSelectedCell: Position | null = null;
let aiValidMoves: Position[] = [];
let aiShowingResolution = false;

function startAiGame(
  config: { cols: number; rows: number; startingUnits: number; visionRadius: number },
  difficulty: AiDifficulty,
  aiCount: number,
  debugMode = false,
) {
  aiDebugMode = debugMode;
  const playerCount = 1 + aiCount;
  const gameConfig: GameConfig = { ...config, playerCount };
  aiGame = new Game(gameConfig);
  aiRenderer = new Renderer(canvas, gameConfig.cols, gameConfig.rows);
  aiInput = new InputHandler(canvas, aiRenderer);
  aiRouteManager = new RouteManager();
  aiDifficulty = difficulty;
  aiLastCombats = [];

  aiInput.onCellClick((pos) => {
    if (aiGame.phase !== GamePhase.ORDER_INPUT || aiShowingResolution) return;
    overlay.onCellSelected(pos, aiGame.board);
  });

  window.addEventListener('resize', () => {
    aiRenderer.resize();
    renderAiBoard();
  });

  aiGame.events.on('turn-resolved', (result) => {
    const turnResult = result as {
      turnNumber: number;
      movements: unknown[];
      combats: CombatResult[];
      eliminations: number[];
      winnerId: number | null;
    };

    aiLastCombats = turnResult.combats;
    aiRouteManager.advanceRoutes(aiGame.board);

    if (turnResult.winnerId !== null) {
      renderAiBoard();
      updateAiStatusBar();
      overlay.showVictory(turnResult.winnerId, () => {
        statusBar.innerHTML = '';
        showMainMenu();
      });
      return;
    }

    updateAiStatusBar();

    // Show resolution to human player (id=0) - no pass screen needed
    const humanId = 0;
    const visible = aiDebugMode ? null : getVisibleCells(aiGame.board, humanId, aiGame.config.visionRadius);

    const visibleCombats = visible
      ? turnResult.combats.filter((c) => visible.has(`${c.position.x},${c.position.y}`))
      : turnResult.combats;
    aiLastCombats = visibleCombats;

    aiShowingResolution = true;
    renderAiBoard(false, humanId, undefined, visible);
    overlay.showCombatResults(
      visibleCombats,
      turnResult.eliminations,
      (id) => PLAYER_NAMES[id] ?? `Игрок ${id + 1}`,
      () => {
        aiShowingResolution = false;
        aiLastCombats = [];
        startAiTurn();
      },
    );
  });

  updateAiStatusBar();
  startAiTurn();
}

function updateAiStatusBar() {
  if (!aiGame) { statusBar.innerHTML = ''; return; }
  const diffLabel = aiDifficulty === 'easy' ? 'Легкий' : aiDifficulty === 'medium' ? 'Средний' : 'Сложный';
  const debugLabel = aiDebugMode ? ' | Отладка' : '';
  const turnHtml = `<span class="status-turn">Ход ${aiGame.turnNumber} (AI: ${diffLabel}${debugLabel})</span>`;
  const playersHtml = aiGame.players
    .map((p) => {
      const units = aiGame.board.getPlayerTotalUnits(p.id);
      const eliminated = p.eliminated;
      const cls = eliminated ? 'status-player status-eliminated' : 'status-player';
      const label = p.id === 0 ? 'Вы' : `AI ${p.id}`;
      return `<span class="${cls}">
        <span class="status-dot" style="background:${p.color}"></span>
        ${label}: ${units}
      </span>`;
    })
    .join('');
  statusBar.innerHTML = turnHtml + playersHtml;
}

function startAiTurn() {
  if (aiGame.phase !== GamePhase.ORDER_INPUT) return;

  // Check if human (player 0) is eliminated
  const human = aiGame.players[0];
  if (human.eliminated) {
    // All AI submit empty orders to continue game
    for (const p of aiGame.getActivePlayers()) {
      const orders = generateOrders(aiGame.board, p.id, aiDifficulty, aiGame.config);
      aiGame.submitOrders({ playerId: p.id, moves: orders });
    }
    return;
  }

  // Human enters orders
  startAiPlayerOrderPhase();
}

function startAiPlayerOrderPhase() {
  const humanId = 0;
  aiPendingOrders = [];
  aiSelectedCell = null;
  aiValidMoves = [];
  renderAiBoard(false, humanId, aiPendingOrders);

  overlay.startOrderInput(
    humanId,
    aiGame.board,
    (orders) => {
      aiSelectedCell = null;
      aiValidMoves = [];
      aiPendingOrders = [];

      // Collect AI orders before submitting
      const allAiOrders: MoveOrder[] = [];
      if (aiGame.phase === GamePhase.ORDER_INPUT) {
        for (const p of aiGame.getActivePlayers()) {
          if (p.id === humanId) continue;
          const aiOrders = generateOrders(aiGame.board, p.id, aiDifficulty, aiGame.config);
          allAiOrders.push(...aiOrders);
        }
      }

      if (aiDebugMode && allAiOrders.length > 0) {
        // Show AI orders on the board, then submit on continue
        renderAiBoard(false, humanId, [...orders, ...allAiOrders]);
        overlay.showResolution('Планируемые ходы AI', () => {
          aiGame.submitOrders({ playerId: humanId, moves: orders });
          if (aiGame.phase === GamePhase.ORDER_INPUT) {
            for (const p of aiGame.getActivePlayers()) {
              if (p.id === humanId) continue;
              const pOrders = allAiOrders.filter((o) => o.playerId === p.id);
              aiGame.submitOrders({ playerId: p.id, moves: pOrders });
            }
          }
        });
      } else {
        // Normal flow: submit all immediately
        aiGame.submitOrders({ playerId: humanId, moves: orders });
        if (aiGame.phase === GamePhase.ORDER_INPUT) {
          for (const p of aiGame.getActivePlayers()) {
            if (p.id === humanId) continue;
            const pOrders = allAiOrders.filter((o) => o.playerId === p.id);
            aiGame.submitOrders({ playerId: p.id, moves: pOrders });
          }
        }
      }
    },
    (orders) => {
      aiPendingOrders = orders;
      renderAiBoard(false, humanId, aiPendingOrders);
    },
    (state) => {
      aiSelectedCell = state.selectedCell;
      aiValidMoves = state.validMoves;
      renderAiBoard(false, humanId, aiPendingOrders);
    },
    aiRouteManager,
  );
}

function renderAiBoard(hidden = false, currentPlayerId?: number, orders?: MoveOrder[], visibleCells?: Set<string> | null) {
  if (!aiRenderer || !aiGame) return;

  if (hidden) {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const pid = currentPlayerId ?? 0;
  const vis: Set<string> | null = aiDebugMode
    ? null
    : (visibleCells !== undefined ? visibleCells : getVisibleCells(aiGame.board, pid, aiGame.config.visionRadius));

  const highlightCells = aiGame.board.getPlayerStacks(pid).map((s) => s.pos);

  const routePaths = aiRouteManager.getPlayerRoutes(pid).map((r) => ({
    playerId: r.playerId,
    currentPos: r.currentPos,
    path: r.path,
    unitCount: r.unitCount,
  }));

  const state: RenderState = {
    board: aiGame.board,
    orders: orders ?? [],
    selectedCell: aiSelectedCell,
    validMoves: aiValidMoves,
    currentPlayerId: pid,
    highlightCells,
    combatCells: aiLastCombats,
    visibleCells: vis,
    routePaths,
  };
  aiRenderer.render(state);
}

// ============================================================
// Online mode
// ============================================================

let netClient: GameClient | null = null;
let netRenderer: Renderer | null = null;
let netInput: InputHandler | null = null;
let netPlayerId = -1;
let netConfig: Omit<GameConfig, 'seed'> | null = null;
let netBoard: Board | null = null;
let netPlayers: PlayerInfo[] = [];
let netPendingOrders: MoveOrder[] = [];
let netSelectedCell: Position | null = null;
let netValidMoves: Position[] = [];
let netCombats: CombatResult[] = [];
let netVisibleKeys: Set<string> | null = null;
let netOrdersSubmitted = false;
let netRoomCode = '';

function saveNetSession(roomCode: string, playerId: number): void {
  sessionStorage.setItem('abat-room', JSON.stringify({ roomCode, playerId }));
}

function clearNetSession(): void {
  sessionStorage.removeItem('abat-room');
}

function getNetSession(): { roomCode: string; playerId: number } | null {
  try {
    const raw = sessionStorage.getItem('abat-room');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getWsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

async function onCreateRoom(config: Omit<GameConfig, 'seed'>, playerName: string): Promise<void> {
  try {
    netClient = new GameClient();
    await netClient.connect(getWsUrl());
    setupNetworkHandlers();
    netClient.createRoom(config, playerName);
  } catch {
    overlay.showError('Не удалось подключиться к серверу', showMainMenu);
  }
}

async function onJoinRoom(roomCode: string, playerName: string): Promise<void> {
  try {
    netClient = new GameClient();
    await netClient.connect(getWsUrl());
    setupNetworkHandlers();
    netClient.joinRoom(roomCode, playerName);
  } catch {
    overlay.showError('Не удалось подключиться к серверу', showMainMenu);
  }
}

function cleanupOnline(): void {
  clearNetSession();
  if (netClient) {
    netClient.disconnect();
    netClient = null;
  }
  netRenderer = null;
  netInput = null;
  netBoard = null;
  netPlayers = [];
  netPendingOrders = [];
  netCombats = [];
  netVisibleKeys = null;
  netOrdersSubmitted = false;
  netRoomCode = '';
}

function setupNetworkHandlers(): void {
  if (!netClient) return;

  netClient.on('room-created', (msg) => {
    const m = msg as ServerMessage & { type: 'room-created' };
    netPlayerId = m.playerId;
    netConfig = m.config;
    netRoomCode = m.roomCode;
    saveNetSession(m.roomCode, m.playerId);
    const myInfo: PlayerInfo = {
      id: m.playerId,
      name: 'Я',
      color: PLAYER_COLORS[m.playerId] ?? '#888',
      connected: true,
      eliminated: false,
    };
    overlay.showWaitingRoom(m.roomCode, [myInfo], m.config, () => {
      cleanupOnline();
      showMainMenu();
    });
  });

  netClient.on('room-joined', (msg) => {
    const m = msg as ServerMessage & { type: 'room-joined' };
    netPlayerId = m.playerId;
    netConfig = m.config;
    netRoomCode = m.roomCode;
    netPlayers = m.players;
    saveNetSession(m.roomCode, m.playerId);
    overlay.showWaitingRoom(m.roomCode, m.players, m.config, () => {
      cleanupOnline();
      showMainMenu();
    });
  });

  netClient.on('player-joined', (msg) => {
    const m = msg as ServerMessage & { type: 'player-joined' };
    netPlayers = m.players;
    overlay.updateWaitingRoom(m.players);
    updateOnlineStatusBar();
  });

  netClient.on('game-started', (msg) => {
    const m = msg as ServerMessage & { type: 'game-started' };
    netPlayerId = m.playerId;
    netConfig = m.config;
    netPlayers = m.players;
    startOnlineGame(m.board);
  });

  netClient.on('turn-start', (msg) => {
    const m = msg as ServerMessage & { type: 'turn-start' };
    netPlayers = m.players;
    netOrdersSubmitted = false;
    onNetTurnStart(m.turnNumber, m.board);
  });

  netClient.on('orders-accepted', () => {
    netOrdersSubmitted = true;
  });

  netClient.on('waiting-for-players', (msg) => {
    const m = msg as ServerMessage & { type: 'waiting-for-players' };
    if (netOrdersSubmitted) {
      overlay.showWaitingForOrders(m.pending, netPlayers);
    }
  });

  netClient.on('turn-resolved', (msg) => {
    onNetTurnResolved(msg as TurnResolvedMsg);
  });

  netClient.on('player-disconnected', (msg) => {
    const m = msg as ServerMessage & { type: 'player-disconnected' };
    const player = netPlayers.find((p) => p.id === m.playerId);
    if (player) player.connected = false;
    updateOnlineStatusBar();
  });

  netClient.on('reconnected', (msg) => {
    const m = msg as ServerMessage & { type: 'reconnected' };
    netPlayerId = m.playerId;
    netConfig = m.config;
    netRoomCode = m.roomCode;
    netPlayers = m.players;
    saveNetSession(m.roomCode, m.playerId);

    if (m.gameOver) {
      startOnlineGame(m.board);
      overlay.showVictory(m.winnerId!, () => {
        cleanupOnline();
        showMainMenu();
      });
    } else {
      startOnlineGame(m.board);
      onNetTurnStart(m.turnNumber, m.board);
    }
  });

  netClient.on('error', (msg) => {
    const m = msg as ServerMessage & { type: 'error' };
    overlay.showError(m.message, () => {
      cleanupOnline();
      showMainMenu();
    });
  });
}

function startOnlineGame(snapshot: BoardSnapshot): void {
  if (!netConfig) return;

  overlay.clear();
  netRenderer = new Renderer(canvas, netConfig.cols, netConfig.rows);
  netInput = new InputHandler(canvas, netRenderer);

  netInput.onCellClick((pos) => {
    if (netOrdersSubmitted || !netBoard) return;
    overlay.onCellSelected(pos, netBoard);
  });

  window.addEventListener('resize', () => {
    netRenderer?.resize();
    renderOnlineBoard();
  });

  applySnapshot(snapshot);
  updateOnlineStatusBar();
}

function onNetTurnStart(turnNumber: number, snapshot: BoardSnapshot): void {
  applySnapshot(snapshot);
  netCombats = [];
  updateOnlineStatusBar();
  startOnlineOrderInput();
}

function startOnlineOrderInput(): void {
  netPendingOrders = [];
  netSelectedCell = null;
  netValidMoves = [];
  netOrdersSubmitted = false;

  if (!netBoard) return;

  overlay.clear();
  overlay.startOrderInput(
    netPlayerId,
    netBoard,
    (orders) => {
      netSelectedCell = null;
      netValidMoves = [];
      netClient?.submitOrders(orders);
      renderOnlineBoard();
    },
    (orders) => {
      netPendingOrders = orders;
      renderOnlineBoard();
    },
    (state) => {
      netSelectedCell = state.selectedCell;
      netValidMoves = state.validMoves;
      renderOnlineBoard();
    },
  );

  renderOnlineBoard();
}

function onNetTurnResolved(result: TurnResolvedMsg): void {
  if (!netConfig) return;

  netCombats = result.combats;
  applySnapshot(result.board);

  for (const pid of result.eliminations) {
    const p = netPlayers.find((pl) => pl.id === pid);
    if (p) p.eliminated = true;
  }

  updateOnlineStatusBar();
  renderOnlineBoard();

  if (result.winnerId !== null) {
    overlay.showVictory(result.winnerId, () => {
      cleanupOnline();
      showMainMenu();
    });
    return;
  }

  overlay.showCombatResults(
    result.combats,
    result.eliminations,
    (id) => netPlayers.find((p) => p.id === id)?.name ?? `Игрок ${id + 1}`,
    () => startOnlineOrderInput(),
  );
}

function applySnapshot(snapshot: BoardSnapshot): void {
  if (!netConfig) return;
  netBoard = deserializeBoard(snapshot, netConfig.cols, netConfig.rows);
  netVisibleKeys = new Set(snapshot.visibleKeys);
}

function updateOnlineStatusBar(): void {
  if (!netConfig) { statusBar.innerHTML = ''; return; }
  const playersHtml = netPlayers
    .map((p) => {
      const units = netBoard ? netBoard.getPlayerTotalUnits(p.id) : 0;
      const cls = p.eliminated ? 'status-player status-eliminated' : 'status-player';
      const disconnectedMark = p.connected ? '' : ' (!)';
      return `<span class="${cls}">
        <span class="status-dot" style="background:${p.color}"></span>
        ${p.name}${p.id === netPlayerId ? ' (вы)' : ''}${disconnectedMark}: ${units}
      </span>`;
    })
    .join('');
  statusBar.innerHTML = `<span class="status-turn">Сетевая</span>` + playersHtml;
}

function renderOnlineBoard(): void {
  if (!netRenderer || !netBoard) return;

  const highlightCells = netBoard.getPlayerStacks(netPlayerId).map((s) => s.pos);

  const state: RenderState = {
    board: netBoard,
    orders: netPendingOrders,
    selectedCell: netSelectedCell,
    validMoves: netValidMoves,
    currentPlayerId: netPlayerId,
    highlightCells,
    combatCells: netCombats,
    visibleCells: netVisibleKeys,
    routePaths: [],
  };
  netRenderer.render(state);
}

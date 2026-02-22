import { Game } from './engine/game';
import { GamePhase, MoveOrder, CombatResult, PLAYER_COLORS, PLAYER_NAMES } from './engine/types';
import { Renderer, RenderState } from './ui/renderer';
import { InputHandler } from './ui/input';
import { Overlay } from './ui/overlay';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlayEl = document.getElementById('overlay') as HTMLElement;
const statusBar = document.getElementById('status-bar') as HTMLElement;
const overlay = new Overlay(overlayEl);

let game: Game;
let renderer: Renderer;
let input: InputHandler;
let currentPlayerIndex = 0;
let pendingOrders: MoveOrder[] = [];
let lastCombats: CombatResult[] = [];

function startGame(config: { cols: number; rows: number; playerCount: number; startingUnits: number }) {
  game = new Game(config);
  renderer = new Renderer(canvas, config.cols, config.rows);
  input = new InputHandler(canvas, renderer);
  lastCombats = [];

  input.onCellClick((pos) => {
    if (game.phase !== GamePhase.ORDER_INPUT) return;
    overlay.onCellSelected(pos, game.board);
  });

  window.addEventListener('resize', () => {
    renderer.resize();
    renderBoard();
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

    if (turnResult.winnerId !== null) {
      renderBoard();
      updateStatusBar();
      overlay.showVictory(turnResult.winnerId, () => {
        statusBar.innerHTML = '';
        overlay.showSetup(startGame);
      });
      return;
    }

    const lines: string[] = [];
    if (turnResult.combats.length > 0) {
      for (const c of turnResult.combats) {
        const winnerName = PLAYER_NAMES[c.winnerId] ?? `Игрок ${c.winnerId + 1}`;
        const loserNames = c.participants
          .filter((p) => p.playerId !== c.winnerId)
          .map((p) => `${PLAYER_NAMES[p.playerId] ?? `И${p.playerId + 1}`}(${p.unitsBefore})`)
          .join(', ');
        lines.push(
          `Бой (${c.position.x},${c.position.y}): ${winnerName}(${c.participants.find((p) => p.playerId === c.winnerId)!.unitsBefore}) vs ${loserNames} - ${winnerName} побеждает, осталось ${c.unitsAfter}`,
        );
      }
    } else {
      lines.push('В этом ходу боев не было.');
    }
    if (turnResult.eliminations.length > 0) {
      for (const pid of turnResult.eliminations) {
        lines.push(`${PLAYER_NAMES[pid] ?? `Игрок ${pid + 1}`} уничтожен!`);
      }
    }

    renderBoard();
    updateStatusBar();
    overlay.showResolution(lines.join('\n'), () => {
      lastCombats = [];
      startTurn();
    });
  });

  updateStatusBar();
  startTurn();
}

function updateStatusBar() {
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

function startTurn() {
  const activePlayers = game.getActivePlayers();
  currentPlayerIndex = 0;
  updateStatusBar();
  showPassScreen(activePlayers[currentPlayerIndex].id);
}

function showPassScreen(playerId: number) {
  renderBoard(true);
  overlay.showPassScreen(playerId, game.turnNumber, () => {
    startPlayerOrderPhase(playerId);
  });
}

function startPlayerOrderPhase(playerId: number) {
  pendingOrders = [];
  renderBoard(false, playerId, pendingOrders);

  overlay.startOrderInput(
    playerId,
    game.board,
    (orders) => {
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
      renderBoard(false, playerId, pendingOrders);
    },
  );
}

function renderBoard(hidden = false, currentPlayerId?: number, orders?: MoveOrder[]) {
  if (!renderer || !game) return;

  if (hidden) {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const highlightCells =
    currentPlayerId !== undefined
      ? game.board.getPlayerStacks(currentPlayerId).map((s) => s.pos)
      : [];

  const state: RenderState = {
    board: game.board,
    orders: orders ?? [],
    selectedCell: null,
    validMoves: [],
    currentPlayerId: currentPlayerId ?? null,
    highlightCells,
    combatCells: lastCombats,
  };
  renderer.render(state);
}

// Start with setup screen
overlay.showSetup(startGame);

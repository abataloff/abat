import { Direction, MoveOrder, Position, PLAYER_COLORS, PLAYER_NAMES, DIRECTION_DELTA, GameConfig } from '../engine/types';
import { Board } from '../engine/board';
import { PlayerInfo } from '../net/protocol';

export type OrderCallback = (orders: MoveOrder[]) => void;

export interface SelectionState {
  selectedCell: Position | null;
  validMoves: Position[];
}

const DIRECTION_LABELS: Record<Direction, string> = {
  [Direction.NW]: '\u2196',
  [Direction.N]: '\u2191',
  [Direction.NE]: '\u2197',
  [Direction.W]: '\u2190',
  [Direction.E]: '\u2192',
  [Direction.SW]: '\u2199',
  [Direction.S]: '\u2193',
  [Direction.SE]: '\u2198',
};

const DELTA_TO_DIRECTION: Record<string, Direction> = {};
for (const [dir, delta] of Object.entries(DIRECTION_DELTA)) {
  DELTA_TO_DIRECTION[`${delta.x},${delta.y}`] = dir as Direction;
}

export class Overlay {
  private container: HTMLElement;
  private currentOrders: MoveOrder[] = [];
  private currentPlayerId = 0;
  private onConfirm: OrderCallback = () => {};
  private onOrdersChanged: (orders: MoveOrder[]) => void = () => {};
  private onSelectionChanged: (state: SelectionState) => void = () => {};
  private currentBoard: Board | null = null;

  // Two-click selection state
  private selectedFrom: Position | null = null;
  private availableUnits = 0;

  constructor(overlayEl: HTMLElement) {
    this.container = overlayEl;
  }

  /** Show privacy screen between turns */
  showPassScreen(playerId: number, turnNumber: number, onReady: () => void): void {
    const color = PLAYER_COLORS[playerId] ?? '#888';
    const name = PLAYER_NAMES[playerId] ?? `Игрок ${playerId + 1}`;
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e;
        z-index:100;
      ">
        <div style="font-size:1.2rem; opacity:0.6; margin-bottom:1rem;">Ход ${turnNumber}</div>
        <div style="font-size:2rem; margin-bottom:0.5rem;">Передай устройство</div>
        <div style="font-size:3rem; font-weight:bold; color:${color}; margin-bottom:2rem;">${name}</div>
        <button id="pass-ready-btn" style="
          padding:1rem 3rem; font-size:1.5rem; border:2px solid ${color};
          background:transparent; color:${color}; cursor:pointer; border-radius:8px;
          transition: background 0.2s;
        ">Я ${name} - Показать поле</button>
      </div>
    `;
    document.getElementById('pass-ready-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onReady();
    });
  }

  /** Show privacy screen before showing resolution results to a player */
  showResolutionPassScreen(playerId: number, turnNumber: number, onReady: () => void): void {
    const color = PLAYER_COLORS[playerId] ?? '#888';
    const name = PLAYER_NAMES[playerId] ?? `Игрок ${playerId + 1}`;
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e;
        z-index:100;
      ">
        <div style="font-size:1.2rem; opacity:0.6; margin-bottom:1rem;">Результаты хода ${turnNumber}</div>
        <div style="font-size:2rem; margin-bottom:0.5rem;">Передай устройство</div>
        <div style="font-size:3rem; font-weight:bold; color:${color}; margin-bottom:2rem;">${name}</div>
        <button id="res-pass-ready-btn" style="
          padding:1rem 3rem; font-size:1.5rem; border:2px solid ${color};
          background:transparent; color:${color}; cursor:pointer; border-radius:8px;
          transition: background 0.2s;
        ">Показать результаты</button>
      </div>
    `;
    document.getElementById('res-pass-ready-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onReady();
    });
  }

  /** Show victory screen */
  showVictory(playerId: number, onNewGame: () => void): void {
    const color = PLAYER_COLORS[playerId] ?? '#888';
    const name = PLAYER_NAMES[playerId] ?? `Игрок ${playerId + 1}`;
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:rgba(0,0,0,0.85);
        z-index:100;
      ">
        <div style="font-size:2rem; margin-bottom:1rem;">Победа!</div>
        <div style="font-size:3rem; font-weight:bold; color:${color}; margin-bottom:2rem;">${name} выиграл!</div>
        <button id="new-game-btn" style="
          padding:1rem 3rem; font-size:1.5rem; border:2px solid #eee;
          background:transparent; color:#eee; cursor:pointer; border-radius:8px;
        ">Новая игра</button>
      </div>
    `;
    document.getElementById('new-game-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onNewGame();
    });
  }

  /** Show resolution results */
  showResolution(message: string, onContinue: () => void): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; bottom:0; left:0; right:0; display:flex; flex-direction:column;
        align-items:center; padding:1.5rem; background:rgba(0,0,0,0.8);
        z-index:50;
      ">
        <div style="font-size:1.2rem; margin-bottom:1rem; white-space:pre-line; text-align:center;">${message}</div>
        <button id="continue-btn" style="
          padding:0.7rem 2rem; font-size:1.2rem; border:2px solid #eee;
          background:transparent; color:#eee; cursor:pointer; border-radius:8px;
        ">Далее</button>
      </div>
    `;
    document.getElementById('continue-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onContinue();
    });
  }

  /** Begin order input phase for a player */
  startOrderInput(
    playerId: number,
    board: Board,
    onConfirm: OrderCallback,
    onOrdersChanged: (orders: MoveOrder[]) => void,
    onSelectionChanged: (state: SelectionState) => void,
  ): void {
    this.currentPlayerId = playerId;
    this.currentOrders = [];
    this.currentBoard = board;
    this.selectedFrom = null;
    this.availableUnits = 0;
    this.onConfirm = onConfirm;
    this.onOrdersChanged = onOrdersChanged;
    this.onSelectionChanged = onSelectionChanged;
    this.renderOrderPanel(board);
  }

  /** Called when user clicks a cell - two-click flow: first select stack, then click target */
  onCellSelected(pos: Position, board: Board): void {
    // Ignore clicks while split popup is open
    if (document.getElementById('split-popup')) return;

    if (this.selectedFrom) {
      // Second click - try to create order to this cell
      const from = this.selectedFrom;

      // Click on the same cell - deselect
      if (pos.x === from.x && pos.y === from.y) {
        this.clearSelection(board);
        return;
      }

      // Check if target is adjacent (Chebyshev distance 1)
      const dx = pos.x - from.x;
      const dy = pos.y - from.y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && board.isInBounds(pos)) {
        const dir = DELTA_TO_DIRECTION[`${dx},${dy}`];
        if (dir) {
          this.showSplitPopup(from, pos, dir, this.availableUnits, board);
          return;
        }
      }

      // Click on another own stack - switch selection
      const otherStack = board.getPlayerStack(pos, this.currentPlayerId);
      if (otherStack && otherStack.alive) {
        const assigned = this.currentOrders
          .filter((o) => o.from.x === pos.x && o.from.y === pos.y)
          .reduce((s, o) => s + o.unitCount, 0);
        const available = otherStack.units - assigned;
        if (available > 0) {
          this.selectStack(pos, available, board);
          return;
        }
      }

      // Click elsewhere - deselect
      this.clearSelection(board);
      return;
    }

    // First click - try to select a stack
    const stack = board.getPlayerStack(pos, this.currentPlayerId);
    if (!stack || !stack.alive) return;

    const assigned = this.currentOrders
      .filter((o) => o.from.x === pos.x && o.from.y === pos.y)
      .reduce((s, o) => s + o.unitCount, 0);
    const available = stack.units - assigned;
    if (available <= 0) return;

    this.selectStack(pos, available, board);
  }

  private selectStack(pos: Position, available: number, board: Board): void {
    this.selectedFrom = pos;
    this.availableUnits = available;

    // Compute valid adjacent targets
    const validMoves: Position[] = [];
    for (const delta of Object.values(DIRECTION_DELTA)) {
      const target = { x: pos.x + delta.x, y: pos.y + delta.y };
      if (board.isInBounds(target)) {
        validMoves.push(target);
      }
    }

    this.onSelectionChanged({ selectedCell: pos, validMoves });
    this.renderOrderPanel(board);
  }

  private clearSelection(board: Board): void {
    this.selectedFrom = null;
    this.availableUnits = 0;
    const popup = document.getElementById('split-popup');
    if (popup) popup.remove();
    this.onSelectionChanged({ selectedCell: null, validMoves: [] });
    this.renderOrderPanel(board);
  }

  private showSplitPopup(from: Position, to: Position, dir: Direction, available: number, board: Board): void {
    const color = PLAYER_COLORS[this.currentPlayerId] ?? '#888';
    let splitValue = available;

    const popup = document.createElement('div');
    popup.id = 'split-popup';
    popup.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      background:#1a1a2e; border:2px solid ${color}; border-radius:12px;
      padding:1.5rem; z-index:70; display:flex; flex-direction:column; align-items:center; gap:12px;
      min-width:200px;
    `;
    popup.innerHTML = `
      <div style="font-size:1rem; opacity:0.7;">(${from.x},${from.y}) ${DIRECTION_LABELS[dir]} (${to.x},${to.y})</div>
      <div id="split-label" style="font-size:1.2rem;">Юниты: ${splitValue} / ${available}</div>
      <div style="display:flex; align-items:center; gap:8px; width:100%;">
        <button id="split-minus" style="width:36px;height:36px;font-size:1.2rem;border:1px solid #555;background:transparent;color:#eee;cursor:pointer;border-radius:6px;">-</button>
        <input id="split-value" type="range" min="1" max="${available}" value="${splitValue}" style="flex:1;">
        <button id="split-plus" style="width:36px;height:36px;font-size:1.2rem;border:1px solid #555;background:transparent;color:#eee;cursor:pointer;border-radius:6px;">+</button>
      </div>
      <div style="display:flex; gap:8px; width:100%;">
        <button id="split-cancel" style="
          flex:1; padding:0.6rem; border:1px solid #555; background:transparent;
          color:#eee; cursor:pointer; border-radius:6px;
        ">Отмена</button>
        <button id="split-confirm" style="
          flex:1; padding:0.6rem; border:2px solid ${color}; background:${color}33;
          color:#eee; cursor:pointer; border-radius:6px; font-weight:bold;
        ">Отправить</button>
      </div>
    `;
    this.container.appendChild(popup);

    const slider = popup.querySelector('#split-value') as HTMLInputElement;
    const label = popup.querySelector('#split-label')!;

    const updateLabel = () => {
      label.textContent = `Юниты: ${splitValue} / ${available}`;
    };

    slider.addEventListener('input', () => {
      splitValue = parseInt(slider.value);
      updateLabel();
    });
    popup.querySelector('#split-minus')!.addEventListener('click', () => {
      if (splitValue > 1) { splitValue--; slider.value = String(splitValue); updateLabel(); }
    });
    popup.querySelector('#split-plus')!.addEventListener('click', () => {
      if (splitValue < available) { splitValue++; slider.value = String(splitValue); updateLabel(); }
    });

    popup.querySelector('#split-confirm')!.addEventListener('click', () => {
      this.currentOrders.push({
        playerId: this.currentPlayerId,
        from,
        unitCount: splitValue,
        direction: dir,
      });
      popup.remove();
      // Update available for continued selection
      const remaining = available - splitValue;
      if (remaining > 0) {
        this.availableUnits = remaining;
        this.onOrdersChanged(this.currentOrders);
        this.renderOrderPanel(board);
      } else {
        this.clearSelection(board);
        this.onOrdersChanged(this.currentOrders);
        this.renderOrderPanel(board);
      }
    });

    popup.querySelector('#split-cancel')!.addEventListener('click', () => {
      popup.remove();
    });
  }

  private renderOrderPanel(board: Board): void {
    const existing = document.getElementById('order-panel');
    if (existing) existing.remove();

    const color = PLAYER_COLORS[this.currentPlayerId] ?? '#888';
    const name = PLAYER_NAMES[this.currentPlayerId] ?? `Игрок ${this.currentPlayerId + 1}`;

    const ordersList = this.currentOrders
      .map(
        (o, i) =>
          `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <span>(${o.from.x},${o.from.y}) ${DIRECTION_LABELS[o.direction]} ${o.unitCount} юн.</span>
            <button class="remove-order-btn" data-idx="${i}" style="
              border:1px solid #555;background:transparent;color:#e55;cursor:pointer;
              border-radius:4px;padding:2px 8px;font-size:0.9rem;
            ">x</button>
          </div>`,
      )
      .join('');

    // Selection info
    let selectionHtml = '';
    if (this.selectedFrom) {
      selectionHtml = `
        <div style="border:1px solid ${color}; border-radius:8px; padding:0.5rem; margin-bottom:0.5rem; background:${color}11;">
          <div style="font-size:0.9rem;">Выбрано: (${this.selectedFrom.x}, ${this.selectedFrom.y}) - ${this.availableUnits} юн.</div>
          <div style="font-size:0.8rem; opacity:0.5; margin-top:4px;">Кликни на соседнюю клетку</div>
        </div>
      `;
    }

    const hint = this.selectedFrom
      ? ''
      : '<div style="font-size:0.9rem; opacity:0.6; margin-bottom:0.5rem;">Кликни по своему отряду</div>';

    const panel = document.createElement('div');
    panel.id = 'order-panel';
    panel.style.cssText = `
      position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.85);
      border:2px solid ${color}; border-radius:12px; padding:1rem; z-index:40;
      min-width:220px; max-height:80vh; overflow-y:auto;
    `;
    panel.innerHTML = `
      <div style="font-size:1.2rem; font-weight:bold; color:${color}; margin-bottom:0.5rem;">Приказы: ${name}</div>
      ${hint}
      ${selectionHtml}
      ${ordersList || '<div style="opacity:0.4;">Пока нет приказов</div>'}
      <div style="display:flex; gap:8px; margin-top:1rem;">
        <button id="clear-orders-btn" style="
          flex:1; padding:0.5rem; border:1px solid #555; background:transparent;
          color:#eee; cursor:pointer; border-radius:6px;
        ">Сбросить</button>
        <button id="confirm-orders-btn" style="
          flex:1; padding:0.5rem; border:2px solid ${color}; background:${color}33;
          color:#eee; cursor:pointer; border-radius:6px; font-weight:bold;
        ">Готово</button>
      </div>
    `;
    this.container.appendChild(panel);

    // Remove order buttons
    panel.querySelectorAll('.remove-order-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        this.currentOrders.splice(idx, 1);
        this.clearSelection(board);
        this.onOrdersChanged(this.currentOrders);
        this.renderOrderPanel(board);
      });
    });

    // Clear all
    panel.querySelector('#clear-orders-btn')!.addEventListener('click', () => {
      this.currentOrders = [];
      this.clearSelection(board);
      this.onOrdersChanged(this.currentOrders);
      this.renderOrderPanel(board);
    });

    // Confirm
    panel.querySelector('#confirm-orders-btn')!.addEventListener('click', () => {
      panel.remove();
      this.clearSelection(board);
      this.onConfirm([...this.currentOrders]);
    });
  }

  /** Show game setup screen */
  showSetup(onStart: (config: { cols: number; rows: number; playerCount: number; startingUnits: number; visionRadius: number }) => void): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e; z-index:100;
      ">
        <div style="font-size:3rem; font-weight:bold; margin-bottom:2rem; letter-spacing:0.2em;">ABAT</div>
        <div style="font-size:1rem; opacity:0.5; margin-bottom:2rem;">Стратегическая игра</div>
        <div style="display:flex; flex-direction:column; gap:1rem; min-width:280px;">
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Ширина поля:</span>
            <input id="cfg-cols" type="number" min="4" max="20" value="8" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Высота поля:</span>
            <input id="cfg-rows" type="number" min="4" max="20" value="8" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Игроки:</span>
            <select id="cfg-players" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Начальные юниты:</span>
            <input id="cfg-units" type="number" min="5" max="100" value="20" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Радиус обзора:</span>
            <input id="cfg-vision" type="number" min="1" max="20" value="2" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <button id="start-btn" style="
            padding:1rem; font-size:1.3rem; border:2px solid #457B9D;
            background:#457B9D33; color:#eee; cursor:pointer; border-radius:8px;
            margin-top:1rem; font-weight:bold;
          ">Начать игру</button>
        </div>
      </div>
    `;
    document.getElementById('start-btn')!.addEventListener('click', () => {
      const cols = parseInt((document.getElementById('cfg-cols') as HTMLInputElement).value) || 8;
      const rows = parseInt((document.getElementById('cfg-rows') as HTMLInputElement).value) || 8;
      const playerCount = parseInt((document.getElementById('cfg-players') as HTMLSelectElement).value) || 2;
      const startingUnits = parseInt((document.getElementById('cfg-units') as HTMLInputElement).value) || 20;
      const visionRadius = parseInt((document.getElementById('cfg-vision') as HTMLInputElement).value) || 2;
      this.container.innerHTML = '';
      onStart({ cols, rows, playerCount, startingUnits, visionRadius });
    });
  }

  /** Show mode selection: Hotseat vs Online */
  showModeSelect(onHotseat: () => void, onOnline: () => void): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e; z-index:100;
      ">
        <div style="font-size:3rem; font-weight:bold; margin-bottom:1rem; letter-spacing:0.2em;">ABAT</div>
        <div style="font-size:1rem; opacity:0.5; margin-bottom:3rem;">Стратегическая игра</div>
        <div style="display:flex; flex-direction:column; gap:1rem; min-width:280px;">
          <button id="mode-hotseat" style="
            padding:1rem; font-size:1.3rem; border:2px solid #457B9D;
            background:#457B9D33; color:#eee; cursor:pointer; border-radius:8px; font-weight:bold;
          ">Локальная игра</button>
          <button id="mode-online" style="
            padding:1rem; font-size:1.3rem; border:2px solid #2A9D8F;
            background:#2A9D8F33; color:#eee; cursor:pointer; border-radius:8px; font-weight:bold;
          ">Сетевая игра</button>
        </div>
      </div>
    `;
    document.getElementById('mode-hotseat')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onHotseat();
    });
    document.getElementById('mode-online')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onOnline();
    });
  }

  /** Show online lobby: create or join room */
  showOnlineLobby(callbacks: {
    onCreate: (config: Omit<GameConfig, 'seed'>, playerName: string) => void;
    onJoin: (roomCode: string, playerName: string) => void;
    onBack: () => void;
  }): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e; z-index:100;
      ">
        <div style="font-size:2rem; font-weight:bold; margin-bottom:2rem;">Сетевая игра</div>

        <div style="display:flex; gap:2rem; flex-wrap:wrap; justify-content:center;">
          <!-- Create room -->
          <div style="
            border:2px solid #457B9D; border-radius:12px; padding:1.5rem;
            min-width:280px; display:flex; flex-direction:column; gap:0.8rem;
          ">
            <div style="font-size:1.2rem; font-weight:bold; color:#457B9D; margin-bottom:0.5rem;">Создать комнату</div>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Имя:</span>
              <input id="create-name" type="text" value="Игрок" maxlength="16" style="
                width:120px; padding:0.4rem; background:#16213e; border:1px solid #555;
                color:#eee; border-radius:6px; text-align:center;
              ">
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Поле:</span>
              <span>
                <input id="create-cols" type="number" min="4" max="20" value="8" style="width:45px; padding:0.4rem; background:#16213e; border:1px solid #555; color:#eee; border-radius:6px; text-align:center;">
                x
                <input id="create-rows" type="number" min="4" max="20" value="8" style="width:45px; padding:0.4rem; background:#16213e; border:1px solid #555; color:#eee; border-radius:6px; text-align:center;">
              </span>
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Игроки:</span>
              <select id="create-players" style="width:60px; padding:0.4rem; background:#16213e; border:1px solid #555; color:#eee; border-radius:6px; text-align:center;">
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Юниты:</span>
              <input id="create-units" type="number" min="5" max="100" value="20" style="width:60px; padding:0.4rem; background:#16213e; border:1px solid #555; color:#eee; border-radius:6px; text-align:center;">
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Обзор:</span>
              <input id="create-vision" type="number" min="1" max="20" value="2" style="width:60px; padding:0.4rem; background:#16213e; border:1px solid #555; color:#eee; border-radius:6px; text-align:center;">
            </label>
            <button id="create-btn" style="
              padding:0.7rem; font-size:1.1rem; border:2px solid #457B9D;
              background:#457B9D33; color:#eee; cursor:pointer; border-radius:8px; font-weight:bold; margin-top:0.5rem;
            ">Создать</button>
          </div>

          <!-- Join room -->
          <div style="
            border:2px solid #2A9D8F; border-radius:12px; padding:1.5rem;
            min-width:280px; display:flex; flex-direction:column; gap:0.8rem;
          ">
            <div style="font-size:1.2rem; font-weight:bold; color:#2A9D8F; margin-bottom:0.5rem;">Присоединиться</div>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Имя:</span>
              <input id="join-name" type="text" value="Игрок" maxlength="16" style="
                width:120px; padding:0.4rem; background:#16213e; border:1px solid #555;
                color:#eee; border-radius:6px; text-align:center;
              ">
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center;">
              <span>Код:</span>
              <input id="join-code" type="text" maxlength="4" placeholder="ABCD" style="
                width:120px; padding:0.4rem; background:#16213e; border:1px solid #555;
                color:#eee; border-radius:6px; text-align:center; text-transform:uppercase;
                font-size:1.2rem; letter-spacing:0.3em;
              ">
            </label>
            <button id="join-btn" style="
              padding:0.7rem; font-size:1.1rem; border:2px solid #2A9D8F;
              background:#2A9D8F33; color:#eee; cursor:pointer; border-radius:8px; font-weight:bold; margin-top:0.5rem;
            ">Войти</button>
          </div>
        </div>

        <button id="lobby-back-btn" style="
          margin-top:2rem; padding:0.5rem 2rem; border:1px solid #555;
          background:transparent; color:#eee; cursor:pointer; border-radius:6px;
        ">Назад</button>
      </div>
    `;

    document.getElementById('create-btn')!.addEventListener('click', () => {
      const name = (document.getElementById('create-name') as HTMLInputElement).value.trim() || 'Игрок';
      const cols = parseInt((document.getElementById('create-cols') as HTMLInputElement).value) || 8;
      const rows = parseInt((document.getElementById('create-rows') as HTMLInputElement).value) || 8;
      const playerCount = parseInt((document.getElementById('create-players') as HTMLSelectElement).value) || 2;
      const startingUnits = parseInt((document.getElementById('create-units') as HTMLInputElement).value) || 20;
      const visionRadius = parseInt((document.getElementById('create-vision') as HTMLInputElement).value) || 2;
      this.container.innerHTML = '';
      callbacks.onCreate({ cols, rows, playerCount, startingUnits, visionRadius }, name);
    });

    document.getElementById('join-btn')!.addEventListener('click', () => {
      const name = (document.getElementById('join-name') as HTMLInputElement).value.trim() || 'Игрок';
      const code = (document.getElementById('join-code') as HTMLInputElement).value.trim().toUpperCase();
      if (code.length !== 4) return;
      this.container.innerHTML = '';
      callbacks.onJoin(code, name);
    });

    document.getElementById('lobby-back-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      callbacks.onBack();
    });
  }

  /** Show waiting room with room code and player list */
  showWaitingRoom(roomCode: string, players: PlayerInfo[], config: Omit<GameConfig, 'seed'>, onLeave: () => void): void {
    const playerListHtml = players.map((p) => `
      <div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
        <span class="status-dot" style="background:${p.color}; width:12px; height:12px; border-radius:50%; display:inline-block;"></span>
        <span>${p.name}</span>
        <span style="opacity:0.5;">${p.connected ? '' : '(отключен)'}</span>
      </div>
    `).join('');

    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e; z-index:100;
      ">
        <div style="font-size:1.2rem; opacity:0.6; margin-bottom:1rem;">Код комнаты:</div>
        <div style="font-size:4rem; font-weight:bold; letter-spacing:0.5em; margin-bottom:2rem; color:#457B9D;">${roomCode}</div>
        <div style="font-size:1rem; opacity:0.6; margin-bottom:0.5rem;">Поле ${config.cols}x${config.rows}, ${config.startingUnits} юн., обзор ${config.visionRadius}</div>
        <div style="font-size:1.2rem; margin-bottom:0.5rem;">Игроки (${players.length}/${config.playerCount}):</div>
        <div id="waiting-players" style="margin-bottom:2rem; min-width:200px;">
          ${playerListHtml}
        </div>
        <div style="font-size:1rem; opacity:0.5; margin-bottom:1rem;">Ожидание игроков...</div>
        <button id="leave-room-btn" style="
          padding:0.5rem 2rem; border:1px solid #555;
          background:transparent; color:#eee; cursor:pointer; border-radius:6px;
        ">Покинуть</button>
      </div>
    `;
    document.getElementById('leave-room-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onLeave();
    });
  }

  /** Update player list in waiting room */
  updateWaitingRoom(players: PlayerInfo[]): void {
    const el = document.getElementById('waiting-players');
    if (!el) return;
    el.innerHTML = players.map((p) => `
      <div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
        <span style="background:${p.color}; width:12px; height:12px; border-radius:50%; display:inline-block;"></span>
        <span>${p.name}</span>
        <span style="opacity:0.5;">${p.connected ? '' : '(отключен)'}</span>
      </div>
    `).join('');
  }

  /** Show "waiting for other players' orders" overlay */
  showWaitingForOrders(pendingPlayerIds: number[], players: PlayerInfo[]): void {
    const pendingNames = pendingPlayerIds
      .map((id) => {
        const p = players.find((pl) => pl.id === id);
        return p ? p.name : `Игрок ${id + 1}`;
      })
      .join(', ');

    this.container.innerHTML = `
      <div style="
        position:absolute; bottom:0; left:0; right:0; display:flex; flex-direction:column;
        align-items:center; padding:1.5rem; background:rgba(0,0,0,0.8);
        z-index:50;
      ">
        <div style="font-size:1.2rem;">Ожидание приказов...</div>
        <div style="font-size:1rem; opacity:0.6; margin-top:0.5rem;">${pendingNames}</div>
      </div>
    `;
  }

  /** Show error message with back button */
  showError(message: string, onBack: () => void): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e; z-index:100;
      ">
        <div style="font-size:1.5rem; color:#E63946; margin-bottom:2rem;">${message}</div>
        <button id="error-back-btn" style="
          padding:0.7rem 2rem; border:2px solid #eee;
          background:transparent; color:#eee; cursor:pointer; border-radius:8px;
        ">Назад</button>
      </div>
    `;
    document.getElementById('error-back-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onBack();
    });
  }

  clear(): void {
    this.container.innerHTML = '';
  }
}

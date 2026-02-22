import { Direction, MoveOrder, Position, PLAYER_COLORS, PLAYER_NAMES, DIRECTION_DELTA } from '../engine/types';
import { Board } from '../engine/board';

export type OrderCallback = (orders: MoveOrder[]) => void;

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

export class Overlay {
  private container: HTMLElement;
  private currentOrders: MoveOrder[] = [];
  private currentPlayerId = 0;
  private onConfirm: OrderCallback = () => {};
  private onOrdersChanged: (orders: MoveOrder[]) => void = () => {};

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
  ): void {
    this.currentPlayerId = playerId;
    this.currentOrders = [];
    this.onConfirm = onConfirm;
    this.onOrdersChanged = onOrdersChanged;
    this.renderOrderPanel(board);
  }

  /** Called when user clicks a cell - show direction picker if they have units there */
  onCellSelected(pos: Position, board: Board): void {
    const stack = board.getPlayerStack(pos, this.currentPlayerId);
    if (!stack || !stack.alive) return;

    // Count how many units are already assigned from this cell
    const assigned = this.currentOrders
      .filter((o) => o.from.x === pos.x && o.from.y === pos.y)
      .reduce((s, o) => s + o.unitCount, 0);
    const available = stack.units - assigned;
    if (available <= 0) return;

    this.showDirectionPicker(pos, available, board);
  }

  private showDirectionPicker(pos: Position, available: number, board: Board): void {
    const color = PLAYER_COLORS[this.currentPlayerId] ?? '#888';
    let splitValue = available;

    const updatePicker = () => {
      const picker = document.getElementById('dir-picker');
      if (!picker) return;

      const splitInput = picker.querySelector('#split-value') as HTMLInputElement;
      if (splitInput) splitInput.value = String(splitValue);

      const splitLabel = picker.querySelector('#split-label');
      if (splitLabel) splitLabel.textContent = `Юниты: ${splitValue} / ${available}`;
    };

    const dirGrid = [
      [Direction.NW, Direction.N, Direction.NE],
      [Direction.W, null, Direction.E],
      [Direction.SW, Direction.S, Direction.SE],
    ];

    const dirButtons = dirGrid
      .map(
        (row) =>
          `<div style="display:flex; gap:4px;">${row
            .map((dir) => {
              if (!dir) {
                return `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;
                  opacity:0.4; font-size:0.8rem;">СТОП</div>`;
              }
              const dest = { x: pos.x + DIRECTION_DELTA[dir].x, y: pos.y + DIRECTION_DELTA[dir].y };
              const inBounds = board.isInBounds(dest);
              return `<button class="dir-btn" data-dir="${dir}" ${!inBounds ? 'disabled' : ''} style="
                width:48px; height:48px; font-size:1.5rem; border:1px solid ${inBounds ? color : '#333'};
                background:${inBounds ? 'rgba(255,255,255,0.05)' : 'transparent'};
                color:${inBounds ? '#eee' : '#444'}; cursor:${inBounds ? 'pointer' : 'default'};
                border-radius:6px;
              ">${DIRECTION_LABELS[dir]}</button>`;
            })
            .join('')}</div>`,
      )
      .join('');

    const existingPicker = document.getElementById('dir-picker');
    if (existingPicker) existingPicker.remove();

    const picker = document.createElement('div');
    picker.id = 'dir-picker';
    picker.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      background:#1a1a2e; border:2px solid ${color}; border-radius:12px;
      padding:1.5rem; z-index:60; display:flex; flex-direction:column; align-items:center; gap:12px;
    `;
    picker.innerHTML = `
      <div style="font-size:1rem; opacity:0.7;">Клетка (${pos.x}, ${pos.y})</div>
      <div id="split-label" style="font-size:1.1rem;">Юниты: ${splitValue} / ${available}</div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="split-minus" style="width:36px;height:36px;font-size:1.2rem;border:1px solid #555;background:transparent;color:#eee;cursor:pointer;border-radius:6px;">-</button>
        <input id="split-value" type="range" min="1" max="${available}" value="${splitValue}" style="width:120px;">
        <button id="split-plus" style="width:36px;height:36px;font-size:1.2rem;border:1px solid #555;background:transparent;color:#eee;cursor:pointer;border-radius:6px;">+</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px;">${dirButtons}</div>
      <button id="dir-cancel" style="
        padding:0.5rem 1.5rem; border:1px solid #555; background:transparent;
        color:#eee; cursor:pointer; border-radius:6px; margin-top:8px;
      ">Отмена</button>
    `;
    this.container.appendChild(picker);

    // Slider
    const slider = picker.querySelector('#split-value') as HTMLInputElement;
    slider.addEventListener('input', () => {
      splitValue = parseInt(slider.value);
      updatePicker();
    });

    // +/- buttons
    picker.querySelector('#split-minus')!.addEventListener('click', () => {
      if (splitValue > 1) { splitValue--; updatePicker(); slider.value = String(splitValue); }
    });
    picker.querySelector('#split-plus')!.addEventListener('click', () => {
      if (splitValue < available) { splitValue++; updatePicker(); slider.value = String(splitValue); }
    });

    // Direction buttons
    picker.querySelectorAll('.dir-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = (btn as HTMLElement).dataset.dir as Direction;
        if (!dir) return;
        this.currentOrders.push({
          playerId: this.currentPlayerId,
          from: pos,
          unitCount: splitValue,
          direction: dir,
        });
        picker.remove();
        this.onOrdersChanged(this.currentOrders);
        this.renderOrderPanel(board);
      });
    });

    // Cancel
    picker.querySelector('#dir-cancel')!.addEventListener('click', () => {
      picker.remove();
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

    const panel = document.createElement('div');
    panel.id = 'order-panel';
    panel.style.cssText = `
      position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.85);
      border:2px solid ${color}; border-radius:12px; padding:1rem; z-index:40;
      min-width:220px; max-height:80vh; overflow-y:auto;
    `;
    panel.innerHTML = `
      <div style="font-size:1.2rem; font-weight:bold; color:${color}; margin-bottom:0.5rem;">Приказы: ${name}</div>
      <div style="font-size:0.9rem; opacity:0.6; margin-bottom:0.5rem;">Кликни по своим отрядам</div>
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
        this.onOrdersChanged(this.currentOrders);
        this.renderOrderPanel(board);
      });
    });

    // Clear all
    panel.querySelector('#clear-orders-btn')!.addEventListener('click', () => {
      this.currentOrders = [];
      this.onOrdersChanged(this.currentOrders);
      this.renderOrderPanel(board);
    });

    // Confirm
    panel.querySelector('#confirm-orders-btn')!.addEventListener('click', () => {
      panel.remove();
      const picker = document.getElementById('dir-picker');
      if (picker) picker.remove();
      this.onConfirm([...this.currentOrders]);
    });
  }

  /** Show game setup screen */
  showSetup(onStart: (config: { cols: number; rows: number; playerCount: number; startingUnits: number }) => void): void {
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
      this.container.innerHTML = '';
      onStart({ cols, rows, playerCount, startingUnits });
    });
  }

  clear(): void {
    this.container.innerHTML = '';
  }
}

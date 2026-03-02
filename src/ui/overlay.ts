import { Direction, MoveOrder, Position, PLAYER_COLORS, PLAYER_NAMES, DIRECTION_DELTA, GameConfig, CombatResult } from '../engine/types';
import { AiDifficulty } from '../engine/ai';
import { Board } from '../engine/board';
import { PlayerInfo } from '../net/protocol';
import { RouteManager } from '../engine/route';

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
  private routeManager: RouteManager | null = null;
  private routeOrders: MoveOrder[] = [];

  // Two-click selection state
  private selectedFrom: Position | null = null;
  private availableUnits = 0;

  private isMobile(): boolean {
    return window.innerWidth < 600;
  }

  constructor(overlayEl: HTMLElement) {
    this.container = overlayEl;

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const btn =
        this.container.querySelector('#split-confirm') as HTMLElement ??
        this.container.querySelector('#confirm-orders-btn') as HTMLElement ??
        this.container.querySelector('#continue-btn') as HTMLElement ??
        this.container.querySelector('#pass-ready-btn') as HTMLElement ??
        this.container.querySelector('#res-pass-ready-btn') as HTMLElement ??
        this.container.querySelector('#new-game-btn') as HTMLElement;

      if (btn) {
        e.preventDefault();
        btn.click();
      }
    });
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

  /** Show structured combat result cards */
  showCombatResults(
    combats: CombatResult[],
    eliminations: number[],
    getPlayerName: (id: number) => string,
    onContinue: () => void,
  ): void {
    let html = `<div style="
      position:absolute; bottom:0; left:0; right:0; display:flex; flex-direction:column;
      align-items:center; padding:1.5rem; background:rgba(0,0,0,0.85);
      z-index:50; gap:0.75rem; max-height:60vh; overflow-y:auto;
    ">`;

    if (combats.length === 0) {
      html += `<div style="font-size:1.1rem; opacity:0.7;">В этом ходу боёв не было.</div>`;
    } else {
      for (const c of combats) {
        html += `<div style="
          background:rgba(255,255,255,0.07); border-radius:8px; padding:0.75rem 1rem;
          width:100%; max-width:420px; border:1px solid rgba(255,255,255,0.1);
        ">`;
        html += `<div style="font-size:0.85rem; opacity:0.6; margin-bottom:0.4rem;">Бой (${c.position.x}, ${c.position.y})</div>`;

        for (const p of c.participants) {
          const color = PLAYER_COLORS[p.playerId] ?? '#888';
          const name = getPlayerName(p.playerId);
          const isWinner = p.playerId === c.winnerId;
          const style = isWinner
            ? 'font-weight:bold;'
            : 'opacity:0.5;';
          html += `<div style="display:flex; align-items:center; gap:0.4rem; margin:0.2rem 0; ${style}">`;
          html += `<span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block; flex-shrink:0;"></span>`;
          html += `<span>${name}</span>`;
          html += `<span style="opacity:0.7; margin-left:auto;">${p.unitsBefore}</span>`;
          html += `</div>`;
        }

        const winnerName = getPlayerName(c.winnerId);
        const winnerColor = PLAYER_COLORS[c.winnerId] ?? '#888';
        html += `<div style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px solid rgba(255,255,255,0.1); font-size:0.9rem;">`;
        html += `<span style="color:${winnerColor}; font-weight:bold;">${winnerName}</span> побеждает, осталось <b>${c.unitsAfter}</b>`;
        html += `</div>`;
        html += `</div>`;
      }
    }

    for (const pid of eliminations) {
      const name = getPlayerName(pid);
      const color = PLAYER_COLORS[pid] ?? '#888';
      html += `<div style="
        background:rgba(230,57,70,0.15); border:1px solid rgba(230,57,70,0.4);
        border-radius:8px; padding:0.6rem 1rem; width:100%; max-width:420px;
        text-align:center; color:#E63946; font-weight:bold;
      ">`;
      html += `<span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block; vertical-align:middle; margin-right:0.3rem;"></span>`;
      html += `${name} уничтожен!`;
      html += `</div>`;
    }

    html += `<button id="combat-continue-btn" style="
      padding:0.7rem 2rem; font-size:1.2rem; border:2px solid #eee;
      background:transparent; color:#eee; cursor:pointer; border-radius:8px;
      margin-top:0.25rem;
    ">Далее</button>`;
    html += `</div>`;

    this.container.innerHTML = html;
    document.getElementById('combat-continue-btn')!.addEventListener('click', () => {
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
    routeManager?: RouteManager,
  ): void {
    this.currentPlayerId = playerId;
    this.currentOrders = [];
    this.currentBoard = board;
    this.selectedFrom = null;
    this.availableUnits = 0;
    this.onConfirm = onConfirm;
    this.onOrdersChanged = onOrdersChanged;
    this.onSelectionChanged = onSelectionChanged;
    this.routeManager = routeManager ?? null;
    this.routeOrders = this.routeManager ? this.routeManager.generateOrders(playerId) : [];
    if (this.routeOrders.length > 0) {
      this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
    }
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
          if (this.availableUnits === 1) {
            this.currentOrders.push({
              playerId: this.currentPlayerId,
              from,
              unitCount: 1,
              direction: dir,
            });
            this.clearSelection(board);
            this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
            this.renderOrderPanel(board);
          } else {
            this.showSplitPopup(from, pos, dir, this.availableUnits, board);
          }
          return;
        }
      }

      // Non-adjacent cell - create route if routeManager available
      if (this.routeManager && board.isInBounds(pos)) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (dist > 1) {
          if (this.availableUnits === 1) {
            this.createRoute(from, pos, 1, board);
          } else {
            this.showRouteSplitPopup(from, pos, this.availableUnits, board);
          }
          return;
        }
      }

      // Click on another own stack - switch selection
      const otherStack = board.getPlayerStack(pos, this.currentPlayerId);
      if (otherStack && otherStack.alive) {
        const allOrders = [...this.routeOrders, ...this.currentOrders];
        const assigned = allOrders
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

    const allOrders = [...this.routeOrders, ...this.currentOrders];
    const assigned = allOrders
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
    const mobile = this.isMobile();
    popup.style.cssText = mobile
      ? `position:absolute; bottom:0; left:0; right:0;
         background:#1a1a2e; border-top:2px solid ${color}; border-radius:12px 12px 0 0;
         padding:1rem; z-index:70; display:flex; flex-direction:column; align-items:center; gap:10px;`
      : `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
         background:#1a1a2e; border:2px solid ${color}; border-radius:12px;
         padding:1.5rem; z-index:70; display:flex; flex-direction:column; align-items:center; gap:12px;
         min-width:200px;`;
    const presets = [
      { value: 1 },
      { value: Math.max(1, Math.round(available * 0.25)) },
      { value: Math.max(1, Math.round(available * 0.5)) },
      { value: Math.max(1, Math.round(available * 0.75)) },
      { value: available },
    ];
    // Deduplicate presets with same value
    const seen = new Set<number>();
    const uniquePresets = presets.filter((p) => {
      if (seen.has(p.value)) return false;
      seen.add(p.value);
      return true;
    });

    const presetBtns = uniquePresets.map((p, i) =>
      `<button class="split-preset" data-val="${p.value}" data-key="${i + 1}" style="
        padding:0.3rem 0.6rem; border:1px solid #555; background:transparent;
        color:#eee; cursor:pointer; border-radius:6px; font-size:0.85rem;
      "><span style="opacity:0.4;font-size:0.75rem;">${i + 1}:</span> ${p.value}</button>`,
    ).join('');

    popup.innerHTML = `
      <div style="font-size:1rem; opacity:0.7;">(${from.x},${from.y}) ${DIRECTION_LABELS[dir]} (${to.x},${to.y})</div>
      <div id="split-label" style="font-size:1.2rem;">Юниты: ${splitValue} / ${available}</div>
      <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">${presetBtns}</div>
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

    const confirmOrder = () => {
      (popup.querySelector('#split-confirm') as HTMLElement).click();
    };

    popup.querySelectorAll('.split-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        splitValue = parseInt((btn as HTMLElement).dataset.val!);
        confirmOrder();
      });
    });

    const onPresetKey = (e: KeyboardEvent) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= uniquePresets.length) {
        e.preventDefault();
        splitValue = uniquePresets[key - 1].value;
        confirmOrder();
      }
    };
    document.addEventListener('keydown', onPresetKey);

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
      document.removeEventListener('keydown', onPresetKey);
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
        this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
        this.renderOrderPanel(board);
      } else {
        this.clearSelection(board);
        this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
        this.renderOrderPanel(board);
      }
    });

    popup.querySelector('#split-cancel')!.addEventListener('click', () => {
      document.removeEventListener('keydown', onPresetKey);
      popup.remove();
    });
  }

  private createRoute(from: Position, to: Position, unitCount: number, board: Board): void {
    if (!this.routeManager) return;
    this.routeManager.addRoute(this.currentPlayerId, from, to, unitCount, board);
    this.routeOrders = this.routeManager.generateOrders(this.currentPlayerId);
    this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);

    // Keep stack selected if units remain
    const stack = board.getPlayerStack(from, this.currentPlayerId);
    if (stack) {
      const allOrders = [...this.routeOrders, ...this.currentOrders];
      const assigned = allOrders
        .filter((o) => o.from.x === from.x && o.from.y === from.y)
        .reduce((s, o) => s + o.unitCount, 0);
      const remaining = stack.units - assigned;
      if (remaining > 0) {
        this.selectStack(from, remaining, board);
        return;
      }
    }
    this.clearSelection(board);
  }

  private showRouteSplitPopup(from: Position, to: Position, available: number, board: Board): void {
    const color = PLAYER_COLORS[this.currentPlayerId] ?? '#888';
    let splitValue = available;

    const popup = document.createElement('div');
    popup.id = 'split-popup';
    const mobile = this.isMobile();
    popup.style.cssText = mobile
      ? `position:absolute; bottom:0; left:0; right:0;
         background:#1a1a2e; border-top:2px solid ${color}; border-radius:12px 12px 0 0;
         padding:1rem; z-index:70; display:flex; flex-direction:column; align-items:center; gap:10px;`
      : `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
         background:#1a1a2e; border:2px solid ${color}; border-radius:12px;
         padding:1.5rem; z-index:70; display:flex; flex-direction:column; align-items:center; gap:12px;
         min-width:200px;`;
    const presets = [
      { value: 1 },
      { value: Math.max(1, Math.round(available * 0.25)) },
      { value: Math.max(1, Math.round(available * 0.5)) },
      { value: Math.max(1, Math.round(available * 0.75)) },
      { value: available },
    ];
    const seen = new Set<number>();
    const uniquePresets = presets.filter((p) => {
      if (seen.has(p.value)) return false;
      seen.add(p.value);
      return true;
    });

    const presetBtns = uniquePresets.map((p, i) =>
      `<button class="split-preset" data-val="${p.value}" data-key="${i + 1}" style="
        padding:0.3rem 0.6rem; border:1px solid #555; background:transparent;
        color:#eee; cursor:pointer; border-radius:6px; font-size:0.85rem;
      "><span style="opacity:0.4;font-size:0.75rem;">${i + 1}:</span> ${p.value}</button>`,
    ).join('');

    popup.innerHTML = `
      <div style="font-size:1rem; opacity:0.7;">Маршрут: (${from.x},${from.y}) -> (${to.x},${to.y})</div>
      <div id="split-label" style="font-size:1.2rem;">Юниты: ${splitValue} / ${available}</div>
      <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">${presetBtns}</div>
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
        ">Создать маршрут</button>
      </div>
    `;
    this.container.appendChild(popup);

    const slider = popup.querySelector('#split-value') as HTMLInputElement;
    const label = popup.querySelector('#split-label')!;

    const updateLabel = () => {
      label.textContent = `Юниты: ${splitValue} / ${available}`;
    };

    const confirmRoute = () => {
      (popup.querySelector('#split-confirm') as HTMLElement).click();
    };

    popup.querySelectorAll('.split-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        splitValue = parseInt((btn as HTMLElement).dataset.val!);
        confirmRoute();
      });
    });

    const onPresetKey = (e: KeyboardEvent) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= uniquePresets.length) {
        e.preventDefault();
        splitValue = uniquePresets[key - 1].value;
        confirmRoute();
      }
    };
    document.addEventListener('keydown', onPresetKey);

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
      document.removeEventListener('keydown', onPresetKey);
      popup.remove();
      this.createRoute(from, to, splitValue, board);
    });

    popup.querySelector('#split-cancel')!.addEventListener('click', () => {
      document.removeEventListener('keydown', onPresetKey);
      popup.remove();
    });
  }

  private renderOrderPanel(board: Board): void {
    const existing = document.getElementById('order-panel');
    if (existing) existing.remove();

    const color = PLAYER_COLORS[this.currentPlayerId] ?? '#888';
    const name = PLAYER_NAMES[this.currentPlayerId] ?? `Игрок ${this.currentPlayerId + 1}`;

    // Routes section
    const playerRoutes = this.routeManager ? this.routeManager.getPlayerRoutes(this.currentPlayerId) : [];
    let routesHtml = '';
    if (playerRoutes.length > 0) {
      const routeItems = playerRoutes.map((r) => {
        const dest = r.path[r.path.length - 1];
        const destLabel = dest ? `(${dest.x},${dest.y})` : '?';
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <span>(${r.currentPos.x},${r.currentPos.y}) -> ${destLabel}, ${r.path.length} шаг., ${r.unitCount} юн.</span>
          <button class="remove-route-btn" data-route-id="${r.id}" style="
            border:1px solid #555;background:transparent;color:#e55;cursor:pointer;
            border-radius:4px;padding:2px 8px;font-size:0.9rem;
          ">x</button>
        </div>`;
      }).join('');
      routesHtml = `
        <div style="margin-bottom:0.5rem;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:0.9rem; opacity:0.7;">Маршруты <span style="background:${color}44;padding:1px 6px;border-radius:4px;font-size:0.8rem;">${playerRoutes.length}</span></span>
            <button id="clear-routes-btn" style="
              margin-left:auto; border:1px solid #555; background:transparent;
              color:#e55; cursor:pointer; border-radius:4px; padding:2px 8px; font-size:0.8rem;
            ">Сбросить все</button>
          </div>
          ${routeItems}
        </div>
      `;
    }

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
          <div style="font-size:0.8rem; opacity:0.5; margin-top:4px;">Соседняя = ход, дальняя = маршрут</div>
        </div>
      `;
    }

    const hint = this.selectedFrom
      ? ''
      : '<div style="font-size:0.9rem; opacity:0.6; margin-bottom:0.5rem;">Кликни по своему отряду</div>';

    const panel = document.createElement('div');
    panel.id = 'order-panel';
    const mobile = this.isMobile();
    panel.style.cssText = mobile
      ? `position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.92);
         border-top:2px solid ${color}; border-radius:12px 12px 0 0; padding:0.5rem 0.75rem; z-index:40;
         max-height:45vh; overflow-y:auto;`
      : `position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.85);
         border:2px solid ${color}; border-radius:12px; padding:1rem; z-index:40;
         min-width:220px; max-height:80vh; overflow-y:auto;`;

    const ordersContent = ordersList || (playerRoutes.length === 0 ? '<div style="opacity:0.4;">Пока нет приказов</div>' : '');

    if (mobile) {
      // Compact mobile layout: header + buttons in one row, orders in scrollable zone
      panel.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.3rem;">
          <div style="font-size:1rem; font-weight:bold; color:${color}; white-space:nowrap;">Приказы: ${name}</div>
          <div style="margin-left:auto; display:flex; gap:6px;">
            <button id="clear-orders-btn" style="
              padding:0.3rem 0.6rem; border:1px solid #555; background:transparent;
              color:#eee; cursor:pointer; border-radius:6px; font-size:0.8rem;
            ">Сбросить</button>
            <button id="confirm-orders-btn" style="
              padding:0.3rem 0.6rem; border:2px solid ${color}; background:${color}33;
              color:#eee; cursor:pointer; border-radius:6px; font-weight:bold; font-size:0.8rem;
            ">Готово</button>
          </div>
        </div>
        ${hint}
        ${selectionHtml}
        ${routesHtml}
        ${ordersContent}
      `;
    } else {
      panel.innerHTML = `
        <div style="font-size:1.2rem; font-weight:bold; color:${color}; margin-bottom:0.5rem;">Приказы: ${name}</div>
        ${hint}
        ${selectionHtml}
        ${routesHtml}
        ${ordersContent}
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
    }
    this.container.appendChild(panel);

    // Remove route buttons
    panel.querySelectorAll('.remove-route-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const routeId = parseInt((btn as HTMLElement).dataset.routeId!);
        if (this.routeManager) {
          this.routeManager.removeRoute(routeId);
          this.routeOrders = this.routeManager.generateOrders(this.currentPlayerId);
        }
        this.clearSelection(board);
        this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
        this.renderOrderPanel(board);
      });
    });

    // Clear all routes button
    panel.querySelector('#clear-routes-btn')?.addEventListener('click', () => {
      if (this.routeManager) {
        for (const r of [...this.routeManager.getPlayerRoutes(this.currentPlayerId)]) {
          this.routeManager.removeRoute(r.id);
        }
        this.routeOrders = [];
      }
      this.clearSelection(board);
      this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
      this.renderOrderPanel(board);
    });

    // Remove order buttons
    panel.querySelectorAll('.remove-order-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        this.currentOrders.splice(idx, 1);
        this.clearSelection(board);
        this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
        this.renderOrderPanel(board);
      });
    });

    // Clear manual orders only (routes stay)
    panel.querySelector('#clear-orders-btn')!.addEventListener('click', () => {
      this.currentOrders = [];
      this.clearSelection(board);
      this.onOrdersChanged([...this.routeOrders, ...this.currentOrders]);
      this.renderOrderPanel(board);
    });

    // Confirm: merge route orders + manual orders
    panel.querySelector('#confirm-orders-btn')!.addEventListener('click', () => {
      panel.remove();
      this.clearSelection(board);
      this.onConfirm([...this.routeOrders, ...this.currentOrders]);
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

  /** Show mode selection: Hotseat vs AI vs Online */
  showModeSelect(onHotseat: () => void, onAi: () => void, onOnline: () => void): void {
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
          <button id="mode-ai" style="
            padding:1rem; font-size:1.3rem; border:2px solid #E9C46A;
            background:#E9C46A33; color:#eee; cursor:pointer; border-radius:8px; font-weight:bold;
          ">Против компьютера</button>
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
    document.getElementById('mode-ai')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onAi();
    });
    document.getElementById('mode-online')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onOnline();
    });
  }

  /** Show AI game setup screen */
  showAiSetup(onStart: (config: { cols: number; rows: number; startingUnits: number; visionRadius: number }, aiDifficulty: AiDifficulty, aiCount: number, debugMode: boolean) => void, onBack: () => void): void {
    this.container.innerHTML = `
      <div style="
        position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#1a1a2e; z-index:100;
      ">
        <div style="font-size:2rem; font-weight:bold; margin-bottom:2rem;">Против компьютера</div>
        <div style="display:flex; flex-direction:column; gap:1rem; min-width:280px;">
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Ширина поля:</span>
            <input id="ai-cols" type="number" min="4" max="20" value="8" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Высота поля:</span>
            <input id="ai-rows" type="number" min="4" max="20" value="8" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>AI-противники:</span>
            <select id="ai-count" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Сложность:</span>
            <select id="ai-difficulty" style="
              width:130px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
              <option value="easy">Легкий</option>
              <option value="medium" selected>Средний</option>
              <option value="hard">Сложный</option>
            </select>
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Начальные юниты:</span>
            <input id="ai-units" type="number" min="5" max="100" value="20" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Радиус обзора:</span>
            <input id="ai-vision" type="number" min="1" max="20" value="2" style="
              width:60px; padding:0.5rem; background:#16213e; border:1px solid #555;
              color:#eee; border-radius:6px; text-align:center;
            ">
          </label>
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Режим отладки (без тумана):</span>
            <input id="ai-debug" type="checkbox" style="
              width:20px; height:20px; accent-color:#E76F51; cursor:pointer;
            ">
          </label>
          <button id="ai-start-btn" style="
            padding:1rem; font-size:1.3rem; border:2px solid #E9C46A;
            background:#E9C46A33; color:#eee; cursor:pointer; border-radius:8px;
            margin-top:1rem; font-weight:bold;
          ">Начать игру</button>
          <button id="ai-back-btn" style="
            padding:0.5rem; border:1px solid #555;
            background:transparent; color:#eee; cursor:pointer; border-radius:6px;
          ">Назад</button>
        </div>
      </div>
    `;
    document.getElementById('ai-start-btn')!.addEventListener('click', () => {
      const cols = parseInt((document.getElementById('ai-cols') as HTMLInputElement).value) || 8;
      const rows = parseInt((document.getElementById('ai-rows') as HTMLInputElement).value) || 8;
      const aiCount = parseInt((document.getElementById('ai-count') as HTMLSelectElement).value) || 1;
      const aiDifficulty = (document.getElementById('ai-difficulty') as HTMLSelectElement).value as AiDifficulty;
      const startingUnits = parseInt((document.getElementById('ai-units') as HTMLInputElement).value) || 20;
      const visionRadius = parseInt((document.getElementById('ai-vision') as HTMLInputElement).value) || 2;
      const debugMode = (document.getElementById('ai-debug') as HTMLInputElement).checked;
      this.container.innerHTML = '';
      onStart({ cols, rows, startingUnits, visionRadius }, aiDifficulty, aiCount, debugMode);
    });
    document.getElementById('ai-back-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onBack();
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

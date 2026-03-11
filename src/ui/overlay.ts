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
      <div class="screen">
        <div class="subtitle mb-2">Ход ${turnNumber}</div>
        <div style="font-size:2rem;" class="mb-1">Передай устройство</div>
        <div style="font-size:3rem; font-weight:bold; color:${color};" class="mb-4">${name}</div>
        <button id="pass-ready-btn" class="btn btn-primary btn-lg" style="--accent:${color}; color:${color};">Я ${name} - Показать поле</button>
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
      <div class="screen">
        <div class="subtitle mb-2">Результаты хода ${turnNumber}</div>
        <div style="font-size:2rem;" class="mb-1">Передай устройство</div>
        <div style="font-size:3rem; font-weight:bold; color:${color};" class="mb-4">${name}</div>
        <button id="res-pass-ready-btn" class="btn btn-primary btn-lg" style="--accent:${color}; color:${color};">Показать результаты</button>
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
      <div class="screen" style="background:var(--bg-overlay);">
        <div style="font-size:2rem;" class="mb-2">Победа!</div>
        <div style="font-size:3rem; font-weight:bold; color:${color};" class="mb-4">${name} выиграл!</div>
        <button id="new-game-btn" class="btn btn-secondary btn-lg">Новая игра</button>
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
      <div class="panel-bottom">
        <div style="font-size:1.2rem; white-space:pre-line;" class="text-center mb-2">${message}</div>
        <button id="continue-btn" class="btn btn-secondary">Далее</button>
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
    let html = `<div class="panel-bottom gap-sm" style="max-height:60vh; overflow-y:auto;">`;

    if (combats.length === 0) {
      html += `<div style="font-size:1.1rem;" class="text-muted">В этом ходу боёв не было.</div>`;
    } else {
      for (const c of combats) {
        html += `<div class="combat-card">`;
        html += `<div style="font-size:0.85rem; opacity:0.6; margin-bottom:0.4rem;">Бой (${c.position.x}, ${c.position.y})</div>`;

        for (const p of c.participants) {
          const color = PLAYER_COLORS[p.playerId] ?? '#888';
          const name = getPlayerName(p.playerId);
          const isWinner = p.playerId === c.winnerId;
          const cls = isWinner ? 'text-bold' : '';
          html += `<div class="flex-row" style="gap:0.4rem; margin:0.2rem 0; ${isWinner ? '' : 'opacity:0.5;'}">`;
          html += `<span class="dot" style="background:${color};"></span>`;
          html += `<span class="${cls}">${name}</span>`;
          html += `<span style="opacity:0.7; margin-left:auto;">${p.unitsBefore}</span>`;
          html += `</div>`;
        }

        const winnerName = getPlayerName(c.winnerId);
        const winnerColor = PLAYER_COLORS[c.winnerId] ?? '#888';
        html += `<div style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px solid var(--border-subtle); font-size:0.9rem;">`;
        html += `<span style="color:${winnerColor}; font-weight:bold;">${winnerName}</span> побеждает, осталось <b>${c.unitsAfter}</b>`;
        html += `</div>`;
        html += `</div>`;
      }
    }

    for (const pid of eliminations) {
      const name = getPlayerName(pid);
      const color = PLAYER_COLORS[pid] ?? '#888';
      html += `<div class="elimination-banner">`;
      html += `<span class="dot" style="background:${color}; vertical-align:middle; margin-right:0.3rem;"></span>`;
      html += `${name} уничтожен!`;
      html += `</div>`;
    }

    html += `<button id="combat-continue-btn" class="btn btn-secondary" style="margin-top:0.25rem;">Далее</button>`;
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
    popup.className = mobile ? 'popup popup-bottom' : 'popup popup-center';
    popup.style.setProperty('--accent', color);
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
      `<button class="split-preset btn btn-sm btn-ghost" data-val="${p.value}"><span style="opacity:0.4;font-size:0.75rem;">${i + 1}:</span> ${p.value}</button>`,
    ).join('');

    popup.innerHTML = `
      <div style="font-size:1rem; opacity:0.7;">(${from.x},${from.y}) ${DIRECTION_LABELS[dir]} (${to.x},${to.y})</div>
      <div id="split-label" style="font-size:1.2rem;">Юниты: ${splitValue} / ${available}</div>
      <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">${presetBtns}</div>
      <div class="flex-row w-full" style="gap:8px;">
        <button id="split-minus" class="btn btn-icon btn-ghost" style="font-size:1.2rem;">-</button>
        <input id="split-value" type="range" min="1" max="${available}" value="${splitValue}" style="flex:1;">
        <button id="split-plus" class="btn btn-icon btn-ghost" style="font-size:1.2rem;">+</button>
      </div>
      <div class="flex-row w-full" style="gap:8px;">
        <button id="split-cancel" class="btn btn-ghost flex-1">Отмена</button>
        <button id="split-confirm" class="btn btn-primary flex-1" style="--accent:${color};">Отправить</button>
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
    popup.className = mobile ? 'popup popup-bottom' : 'popup popup-center';
    popup.style.setProperty('--accent', color);
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
      `<button class="split-preset btn btn-sm btn-ghost" data-val="${p.value}" data-key="${i + 1}"><span style="opacity:0.4;font-size:0.75rem;">${i + 1}:</span> ${p.value}</button>`,
    ).join('');

    popup.innerHTML = `
      <div style="font-size:1rem; opacity:0.7;">Маршрут: (${from.x},${from.y}) -> (${to.x},${to.y})</div>
      <div id="split-label" style="font-size:1.2rem;">Юниты: ${splitValue} / ${available}</div>
      <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">${presetBtns}</div>
      <div class="flex-row w-full" style="gap:8px;">
        <button id="split-minus" class="btn btn-icon btn-ghost" style="font-size:1.2rem;">-</button>
        <input id="split-value" type="range" min="1" max="${available}" value="${splitValue}" style="flex:1;">
        <button id="split-plus" class="btn btn-icon btn-ghost" style="font-size:1.2rem;">+</button>
      </div>
      <div class="flex-row w-full" style="gap:8px;">
        <button id="split-cancel" class="btn btn-ghost flex-1">Отмена</button>
        <button id="split-confirm" class="btn btn-primary flex-1" style="--accent:${color};">Создать маршрут</button>
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
        return `<div class="flex-row" style="gap:8px; padding:4px 0;">
          <span>(${r.currentPos.x},${r.currentPos.y}) -> ${destLabel}, ${r.path.length} шаг., ${r.unitCount} юн.</span>
          <button class="remove-route-btn btn btn-sm btn-danger" data-route-id="${r.id}">x</button>
        </div>`;
      }).join('');
      routesHtml = `
        <div class="mb-1">
          <div class="flex-row" style="gap:8px; margin-bottom:4px;">
            <span style="font-size:0.9rem; opacity:0.7;">Маршруты <span style="background:${color}44;padding:1px 6px;border-radius:4px;font-size:0.8rem;">${playerRoutes.length}</span></span>
            <button id="clear-routes-btn" class="btn btn-sm btn-danger mt-auto" style="margin-left:auto;">Сбросить все</button>
          </div>
          ${routeItems}
        </div>
      `;
    }

    const ordersList = this.currentOrders
      .map(
        (o, i) =>
          `<div class="flex-row" style="gap:8px; padding:4px 0;">
            <span>(${o.from.x},${o.from.y}) ${DIRECTION_LABELS[o.direction]} ${o.unitCount} юн.</span>
            <button class="remove-order-btn btn btn-sm btn-danger" data-idx="${i}">x</button>
          </div>`,
      )
      .join('');

    // Selection info
    let selectionHtml = '';
    if (this.selectedFrom) {
      selectionHtml = `
        <div class="selection-box" style="--accent:${color};">
          <div style="font-size:0.9rem;">Выбрано: (${this.selectedFrom.x}, ${this.selectedFrom.y}) - ${this.availableUnits} юн.</div>
          <div style="font-size:0.8rem; opacity:0.5; margin-top:4px;">Соседняя = ход, дальняя = маршрут</div>
        </div>
      `;
    }

    const hint = this.selectedFrom
      ? ''
      : '<div style="font-size:0.9rem; opacity:0.6;" class="mb-1">Кликни по своему отряду</div>';

    const panel = document.createElement('div');
    panel.id = 'order-panel';
    const mobile = this.isMobile();
    panel.className = mobile ? 'order-panel order-panel-mobile' : 'order-panel order-panel-desktop';
    panel.style.setProperty('--accent', color);

    const ordersContent = ordersList || (playerRoutes.length === 0 ? '<div style="opacity:0.4;">Пока нет приказов</div>' : '');

    if (mobile) {
      // Compact mobile layout: header + buttons in one row, orders in scrollable zone
      panel.innerHTML = `
        <div class="flex-row" style="gap:8px; margin-bottom:0.3rem;">
          <div style="font-size:1rem; font-weight:bold; color:${color}; white-space:nowrap;">Приказы: ${name}</div>
          <div class="flex-row mt-auto" style="gap:6px;">
            <button id="clear-orders-btn" class="btn btn-sm btn-ghost">Сбросить</button>
            <button id="confirm-orders-btn" class="btn btn-sm btn-primary" style="--accent:${color};">Готово</button>
          </div>
        </div>
        ${hint}
        ${selectionHtml}
        ${routesHtml}
        ${ordersContent}
      `;
    } else {
      panel.innerHTML = `
        <div style="font-size:1.2rem; font-weight:bold; color:${color};" class="mb-1">Приказы: ${name}</div>
        ${hint}
        ${selectionHtml}
        ${routesHtml}
        ${ordersContent}
        <div class="flex-row" style="gap:8px; margin-top:1rem;">
          <button id="clear-orders-btn" class="btn btn-ghost flex-1">Сбросить</button>
          <button id="confirm-orders-btn" class="btn btn-primary flex-1" style="--accent:${color};">Готово</button>
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
  showSetup(onStart: (config: { cols: number; rows: number; playerCount: number; startingUnits: number; visionRadius: number }) => void, onBack?: () => void): void {
    this.container.innerHTML = `
      <div class="screen">
        <div style="font-size:2rem; font-weight:700;" class="mb-4">Локальная игра</div>
        <div class="flex-col gap-md" style="min-width:280px;">
          <label class="field">
            <span>Ширина поля:</span>
            <input id="cfg-cols" type="number" min="4" max="20" value="8" class="input" style="width:60px;">
          </label>
          <label class="field">
            <span>Высота поля:</span>
            <input id="cfg-rows" type="number" min="4" max="20" value="8" class="input" style="width:60px;">
          </label>
          <label class="field">
            <span>Игроки:</span>
            <select id="cfg-players" class="select" style="width:60px;">
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <label class="field">
            <span>Начальные юниты:</span>
            <input id="cfg-units" type="number" min="5" max="100" value="20" class="input" style="width:60px;">
          </label>
          <label class="field">
            <span>Радиус обзора:</span>
            <input id="cfg-vision" type="number" min="1" max="20" value="2" class="input" style="width:60px;">
          </label>
          <button id="start-btn" class="btn btn-primary btn-lg" style="margin-top:1rem;">Начать игру</button>
          ${onBack ? '<button id="setup-back-btn" class="btn btn-ghost">Назад</button>' : ''}
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
    document.getElementById('setup-back-btn')?.addEventListener('click', () => {
      this.container.innerHTML = '';
      if (onBack) onBack();
    });
  }

  /** Show mode selection: Hotseat vs AI vs Online */
  showModeSelect(
    onHotseat: () => void,
    onAi: () => void,
    onOnline: () => void,
    user?: { name: string; nickname?: string | null; avatarUrl?: string; isAdmin?: boolean } | null,
    onLogin?: () => void,
    onLogout?: () => void,
    onSetNickname?: (nickname: string) => void,
    onRules?: () => void,
  ): void {
    const displayName = user ? this.escapeHtml(user.nickname || user.name) : '';
    const userHtml = user
      ? `<div id="user-block" class="user-bar">
          ${user.avatarUrl ? `<img src="${user.avatarUrl}" alt="">` : ''}
          <span style="font-size:0.85rem; opacity:0.8;">${displayName}</span>
          <button id="btn-edit-nick" class="btn btn-sm btn-ghost" title="Изменить ник" style="font-family:monospace; padding:2px 8px; font-size:0.9rem;">&#9998;</button>
          <a id="btn-my-games" href="/my-games" class="btn btn-sm btn-ghost" style="text-decoration:none; font-family:monospace; --accent:#457B9D;">Мои игры</a>
          ${user.isAdmin ? `<a href="/admin" class="btn btn-sm btn-ghost" style="text-decoration:none; font-family:monospace; --accent:#E76F51;">Админка</a>` : ''}
          <button id="btn-logout" class="btn btn-sm btn-danger" style="font-family:monospace;">Выйти</button>
        </div>`
      : (onLogin
        ? `<div class="user-bar">
            <button id="btn-login" class="btn btn-sm btn-ghost" style="font-family:monospace;">Войти через Google</button>
          </div>`
        : '');

    this.container.innerHTML = `
      <div class="screen">
        ${userHtml}
        <div id="nickname-popup" style="display:none; position:absolute; top:50px; right:10px; background:var(--bg-card, #1a1a2e); border:1px solid var(--border-subtle, #333); border-radius:8px; padding:12px; z-index:100; min-width:220px;">
          <div style="font-size:0.85rem; margin-bottom:8px; opacity:0.7;">Никнейм (макс. 20 символов)</div>
          <input id="nickname-input" type="text" maxlength="20" class="input" style="width:100%; margin-bottom:8px;" placeholder="Введите ник">
          <div style="display:flex; gap:6px; justify-content:flex-end;">
            <button id="nickname-cancel" class="btn btn-sm btn-ghost">Отмена</button>
            <button id="nickname-save" class="btn btn-sm btn-primary" style="--accent:#457B9D;">Сохранить</button>
          </div>
        </div>
        <div class="title mb-2">ABAT</div>
        <div class="subtitle" style="margin-bottom:3rem;">Стратегическая игра</div>
        <div class="flex-col gap-md" style="min-width:280px;">
          <button id="mode-hotseat" class="btn btn-primary btn-lg" style="--accent:#457B9D;">Локальная игра</button>
          <button id="mode-ai" class="btn btn-primary btn-lg" style="--accent:#E9C46A;">Против компьютера</button>
          <button id="mode-online" class="btn btn-primary btn-lg" style="--accent:#2A9D8F;">Сетевая игра</button>
          <button id="mode-rules" class="btn btn-ghost" style="margin-top:0.5rem;">Правила</button>
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
    document.getElementById('mode-rules')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      if (onRules) onRules();
    });
    document.getElementById('btn-login')?.addEventListener('click', () => {
      if (onLogin) onLogin();
    });
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      if (onLogout) onLogout();
    });

    // Nickname edit popup
    const editBtn = document.getElementById('btn-edit-nick');
    const popup = document.getElementById('nickname-popup');
    const nickInput = document.getElementById('nickname-input') as HTMLInputElement | null;
    if (editBtn && popup && nickInput && onSetNickname) {
      editBtn.addEventListener('click', () => {
        nickInput.value = user?.nickname || '';
        popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
        if (popup.style.display === 'block') nickInput.focus();
      });
      document.getElementById('nickname-cancel')!.addEventListener('click', () => {
        popup.style.display = 'none';
      });
      document.getElementById('nickname-save')!.addEventListener('click', () => {
        const val = nickInput.value.trim();
        if (val.length > 0) {
          popup.style.display = 'none';
          onSetNickname(val);
        }
      });
    }
  }

  /** Show rules page */
  showRules(onBack: () => void): void {
    this.container.innerHTML = `
      <div class="screen" style="overflow-y:auto; justify-content:flex-start; padding:2rem 1rem;">
        <div style="max-width:640px; width:100%;">
          <div style="font-size:2rem; font-weight:bold; text-align:center;" class="mb-4">Правила игры</div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Цель игры</div>
            <p>Уничтожить все войска противников. Последний выживший игрок побеждает.</p>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Поле и юниты</div>
            <p>Игра идет на прямоугольной сетке. У каждого игрока есть стартовый отряд юнитов.</p>
            <div class="rules-diagram">
              <div class="rules-grid" style="grid-template-columns:repeat(5,1fr);">
                <div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">12</div></div><div class="rules-cell"></div><div class="rules-cell"></div>
                <div class="rules-cell"></div><div class="rules-cell"><div class="rules-unit rules-unit-neutral">2</div></div><div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"></div>
                <div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"><div class="rules-unit rules-unit-neutral">1</div></div><div class="rules-cell"></div>
                <div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"><div class="rules-unit rules-unit-neutral">3</div></div><div class="rules-cell"></div><div class="rules-cell"></div>
                <div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"></div><div class="rules-cell"><div class="rules-unit" style="--c:#E63946;">15</div></div>
              </div>
              <div class="rules-diagram-caption">
                <span class="flex-row" style="gap:4px;"><span class="dot" style="background:#E63946;"></span> Красный</span>
                <span class="flex-row" style="gap:4px;"><span class="dot" style="background:#457B9D;"></span> Синий</span>
                <span class="flex-row" style="gap:4px;"><span class="dot" style="background:#888;"></span> Нейтральные</span>
              </div>
            </div>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Нейтральные отряды (Серые)</div>
            <p>На поле случайным образом расставлены нейтральные отряды серого цвета (1-3 юнита каждый, примерно 15% клеток). Нейтралы не двигаются и не атакуют. Когда отряд игрока входит на клетку с нейтралами, он поглощает их юнитов без боя - они просто присоединяются к отряду.</p>
            <div class="rules-diagram">
              <div class="rules-example-row">
                <div class="rules-mini-grid">
                  <div class="rules-cell"><div class="rules-unit" style="--c:#E63946;">10</div></div>
                  <div class="rules-cell rules-cell-arrow">\u2192</div>
                  <div class="rules-cell"><div class="rules-unit rules-unit-neutral">3</div></div>
                </div>
                <div class="rules-arrow-big">\u2192</div>
                <div class="rules-mini-grid">
                  <div class="rules-cell"></div>
                  <div class="rules-cell"></div>
                  <div class="rules-cell"><div class="rules-unit" style="--c:#E63946;">13</div></div>
                </div>
              </div>
              <div class="rules-diagram-caption">Нейтралы поглощаются без боя: 10 + 3 = 13</div>
            </div>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Ходы</div>
            <p>Все игроки отдают приказы одновременно. За ход можно отправить любое количество приказов на перемещение. Каждый приказ двигает отряд (или его часть) на одну клетку в любом из 8 направлений.</p>
            <div class="rules-diagram">
              <div class="rules-compass">
                <span class="rules-dir" style="grid-area:nw;">\u2196</span>
                <span class="rules-dir" style="grid-area:n;">\u2191</span>
                <span class="rules-dir" style="grid-area:ne;">\u2197</span>
                <span class="rules-dir" style="grid-area:w;">\u2190</span>
                <span class="rules-dir rules-dir-center"><div class="rules-unit" style="--c:#E63946;">8</div></span>
                <span class="rules-dir" style="grid-area:e;">\u2192</span>
                <span class="rules-dir" style="grid-area:sw;">\u2199</span>
                <span class="rules-dir" style="grid-area:s;">\u2193</span>
                <span class="rules-dir" style="grid-area:se;">\u2198</span>
              </div>
              <div class="rules-diagram-caption">8 возможных направлений движения</div>
            </div>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Разделение отряда</div>
            <p>При отправке приказа можно разделить отряд - отправить только часть юнитов, оставив остальных на месте.</p>
            <div class="rules-diagram">
              <div class="rules-example-row">
                <div class="rules-mini-grid">
                  <div class="rules-cell"></div>
                  <div class="rules-cell"></div>
                  <div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">20</div></div>
                </div>
                <div class="rules-arrow-big">\u2192</div>
                <div class="rules-mini-grid" style="grid-template-columns:repeat(2,1fr);">
                  <div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">5</div></div>
                  <div class="rules-cell"></div>
                  <div class="rules-cell"></div>
                  <div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">15</div></div>
                </div>
              </div>
              <div class="rules-diagram-caption">Отряд из 20 разделен: 5 идут на север, 15 остаются</div>
            </div>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Бой</div>
            <p>Бой происходит автоматически, когда отряды разных игроков оказываются на одной клетке.</p>

            <div class="rules-combat-example mb-2">
              <div class="rules-combat-title">Неравные силы</div>
              <div class="rules-example-row">
                <div class="rules-mini-grid">
                  <div class="rules-cell"><div class="rules-unit" style="--c:#E63946;">12</div></div>
                  <div class="rules-cell rules-cell-vs">vs</div>
                  <div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">6</div></div>
                </div>
                <div class="rules-arrow-big">\u2192</div>
                <div class="rules-combat-result">
                  <div class="rules-unit" style="--c:#E63946;">9</div>
                  <div style="font-size:0.75rem; opacity:0.5; margin-top:4px;">12 - \u230A6/2\u230B = 9</div>
                </div>
              </div>
              <div class="rules-diagram-caption">Побеждает сильнейший, теряя \u230Aслабый/2\u230B юнитов</div>
            </div>

            <div class="rules-combat-example mb-2">
              <div class="rules-combat-title">Равные силы</div>
              <div class="rules-example-row">
                <div class="rules-mini-grid">
                  <div class="rules-cell"><div class="rules-unit" style="--c:#E63946;">10</div></div>
                  <div class="rules-cell rules-cell-vs">vs</div>
                  <div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">10</div></div>
                </div>
                <div class="rules-arrow-big">\u2192</div>
                <div class="rules-combat-result">
                  <div class="rules-unit" style="--c:#E63946;">2</div>
                  <div style="font-size:0.7rem; opacity:0.5; margin-top:4px;">случайный победитель</div>
                  <div style="font-size:0.7rem; opacity:0.5;">\u230810 \u00D7 0.15\u2309 = 2</div>
                </div>
              </div>
              <div class="rules-diagram-caption">Победитель случайный, остается 15% юнитов (мин. 1)</div>
            </div>

            <div class="rules-combat-example">
              <div class="rules-combat-title">Несколько сторон</div>
              <div class="rules-example-row">
                <div class="rules-mini-grid" style="grid-template-columns:repeat(2,1fr);">
                  <div class="rules-cell"><div class="rules-unit" style="--c:#E63946;">8</div></div>
                  <div class="rules-cell"><div class="rules-unit" style="--c:#457B9D;">4</div></div>
                  <div class="rules-cell" style="grid-column:span 2;"><div class="rules-unit" style="--c:#2A9D8F;">3</div></div>
                </div>
                <div class="rules-arrow-big">\u2192</div>
                <div class="rules-combat-result">
                  <div class="rules-unit" style="--c:#E63946;">5</div>
                  <div style="font-size:0.75rem; opacity:0.5; margin-top:4px;">8 - \u230A(4+3)/2\u230B = 5</div>
                </div>
              </div>
              <div class="rules-diagram-caption">Сильнейший побеждает, теряя \u230Aсумма_слабых/2\u230B</div>
            </div>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Туман войны</div>
            <p>Каждый игрок видит только клетки в радиусе обзора от своих отрядов. Вражеские юниты за пределами обзора скрыты.</p>
            <div class="rules-diagram">
              <div class="rules-grid rules-fog-grid" style="grid-template-columns:repeat(5,1fr);">
                <div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-fog"></div>
                <div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-fog"></div>
                <div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-vis"><div class="rules-unit" style="--c:#E63946;">8</div></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-dim"></div>
                <div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-fog"></div>
                <div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-dim"></div><div class="rules-cell rules-cell-fog"></div><div class="rules-cell rules-cell-fog"><div class="rules-unit rules-unit-hidden">?</div></div>
              </div>
              <div class="rules-diagram-caption">Радиус обзора = 2. Враги за пределами обзора скрыты</div>
            </div>
          </div>

          <div class="rules-section mb-3">
            <div class="rules-heading">Режимы игры</div>
            <ul class="rules-list">
              <li><b>Локальная игра</b> - hot-seat на одном устройстве, с экраном передачи хода.</li>
              <li><b>Против компьютера</b> - игра с AI-противниками разной сложности.</li>
              <li><b>Сетевая игра</b> - онлайн-мультиплеер через комнаты с кодами и приглашениями.</li>
            </ul>
          </div>

          <div style="text-align:center; margin-top:1.5rem;">
            <button id="rules-back-btn" class="btn btn-secondary btn-lg">Назад</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('rules-back-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onBack();
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** Show AI game setup screen */
  showAiSetup(onStart: (config: { cols: number; rows: number; startingUnits: number; visionRadius: number }, aiDifficulty: AiDifficulty, aiCount: number, debugMode: boolean) => void, onBack: () => void, isAdmin = false): void {
    this.container.innerHTML = `
      <div class="screen">
        <div style="font-size:2rem; font-weight:bold;" class="mb-4">Против компьютера</div>
        <div class="flex-col gap-md" style="min-width:280px;">
          <label class="field">
            <span>Ширина поля:</span>
            <input id="ai-cols" type="number" min="4" max="20" value="8" class="input" style="width:60px;">
          </label>
          <label class="field">
            <span>Высота поля:</span>
            <input id="ai-rows" type="number" min="4" max="20" value="8" class="input" style="width:60px;">
          </label>
          <label class="field">
            <span>AI-противники:</span>
            <select id="ai-count" class="select" style="width:60px;">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label class="field">
            <span>Сложность:</span>
            <select id="ai-difficulty" class="select" style="width:130px;">
              <option value="easy">Легкий</option>
              <option value="medium" selected>Средний</option>
              <option value="hard">Сложный</option>
            </select>
          </label>
          <label class="field">
            <span>Начальные юниты:</span>
            <input id="ai-units" type="number" min="5" max="100" value="20" class="input" style="width:60px;">
          </label>
          <label class="field">
            <span>Радиус обзора:</span>
            <input id="ai-vision" type="number" min="1" max="20" value="2" class="input" style="width:60px;">
          </label>
          ${isAdmin ? `<label class="field">
            <span>Режим отладки (без тумана):</span>
            <input id="ai-debug" type="checkbox" style="width:20px; height:20px; accent-color:#E76F51; cursor:pointer;">
          </label>` : ''}
          <button id="ai-start-btn" class="btn btn-primary btn-lg" style="--accent:#E9C46A; margin-top:1rem;">Начать игру</button>
          <button id="ai-back-btn" class="btn btn-ghost">Назад</button>
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
      const debugMode = (document.getElementById('ai-debug') as HTMLInputElement | null)?.checked ?? false;
      this.container.innerHTML = '';
      onStart({ cols, rows, startingUnits, visionRadius }, aiDifficulty, aiCount, debugMode);
    });
    document.getElementById('ai-back-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onBack();
    });
  }

  /** Show online lobby: create or join room */
  /** Show invite join screen for /join/XXXX links */
  showInviteJoin(
    roomCode: string,
    defaultName: string,
    onJoin: (roomCode: string, playerName: string) => void,
    onBack: () => void,
  ): void {
    this.container.innerHTML = `
      <div class="screen">
        <div style="font-size:2rem; font-weight:bold;" class="mb-2">Присоединиться к игре</div>
        <div class="subtitle mb-1">Код комнаты:</div>
        <div style="font-size:3rem; font-weight:bold; letter-spacing:0.4em; color:#2A9D8F;" class="mb-4">${roomCode}</div>
        <label class="field" style="justify-content:center;">
          <span>Ваше имя:</span>
          <input id="invite-name" type="text" value="${defaultName}" maxlength="16" class="input" style="width:160px;">
        </label>
        <div style="display:flex; gap:1rem; margin-top:1.5rem;">
          <button id="invite-join-btn" class="btn btn-primary" style="--accent:#2A9D8F;">Присоединиться</button>
          <button id="invite-back-btn" class="btn btn-ghost">На главную</button>
        </div>
      </div>
    `;

    const doJoin = () => {
      const name = (document.getElementById('invite-name') as HTMLInputElement).value.trim() || defaultName;
      this.container.innerHTML = '';
      onJoin(roomCode, name);
    };

    document.getElementById('invite-join-btn')!.addEventListener('click', doJoin);
    document.getElementById('invite-name')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doJoin();
    });
    document.getElementById('invite-back-btn')!.addEventListener('click', () => {
      this.container.innerHTML = '';
      onBack();
    });
  }

  showOnlineLobby(callbacks: {
    onCreate: (config: Omit<GameConfig, 'seed'>, playerName: string) => void;
    onJoin: (roomCode: string, playerName: string) => void;
    onBack: () => void;
    defaultName?: string;
  }): void {
    const dn = callbacks.defaultName || 'Игрок';
    this.container.innerHTML = `
      <div class="screen">
        <div style="font-size:2rem; font-weight:bold;" class="mb-4">Сетевая игра</div>

        <div style="display:flex; gap:2rem; flex-wrap:wrap; justify-content:center;">
          <!-- Create room -->
          <div class="card" style="--accent:#457B9D; min-width:280px;">
            <div style="font-size:1.2rem; font-weight:bold; color:#457B9D;" class="mb-1">Создать комнату</div>
            <label class="field">
              <span>Имя:</span>
              <input id="create-name" type="text" value="${dn}" maxlength="16" class="input" style="width:120px;">
            </label>
            <label class="field">
              <span>Поле:</span>
              <span>
                <input id="create-cols" type="number" min="4" max="20" value="8" class="input" style="width:45px; padding:0.4rem;">
                x
                <input id="create-rows" type="number" min="4" max="20" value="8" class="input" style="width:45px; padding:0.4rem;">
              </span>
            </label>
            <label class="field">
              <span>Игроки:</span>
              <select id="create-players" class="select" style="width:60px; padding:0.4rem;">
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <label class="field">
              <span>Юниты:</span>
              <input id="create-units" type="number" min="5" max="100" value="20" class="input" style="width:60px; padding:0.4rem;">
            </label>
            <label class="field">
              <span>Обзор:</span>
              <input id="create-vision" type="number" min="1" max="20" value="2" class="input" style="width:60px; padding:0.4rem;">
            </label>
            <button id="create-btn" class="btn btn-primary" style="--accent:#457B9D; margin-top:0.5rem;">Создать</button>
          </div>

          <!-- Join room -->
          <div class="card" style="--accent:#2A9D8F; min-width:280px;">
            <div style="font-size:1.2rem; font-weight:bold; color:#2A9D8F;" class="mb-1">Присоединиться</div>
            <label class="field">
              <span>Имя:</span>
              <input id="join-name" type="text" value="${dn}" maxlength="16" class="input" style="width:120px;">
            </label>
            <label class="field">
              <span>Код:</span>
              <input id="join-code" type="text" maxlength="4" placeholder="ABCD" class="input" style="width:120px; text-transform:uppercase; font-size:1.2rem; letter-spacing:0.3em;">
            </label>
            <button id="join-btn" class="btn btn-primary" style="--accent:#2A9D8F; margin-top:0.5rem;">Войти</button>
          </div>
        </div>

        <div style="width:100%; max-width:600px; margin-top:2rem;">
          <div style="font-size:1.2rem; font-weight:bold; margin-bottom:0.5rem;">Открытые комнаты</div>
          <div id="room-list" style="opacity:0.5;">Загрузка...</div>
        </div>

        <button id="lobby-back-btn" class="btn btn-ghost" style="margin-top:2rem;">Назад</button>
      </div>
    `;

    let roomListInterval: ReturnType<typeof setInterval> | null = null;

    const loadRooms = async () => {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        const listEl = document.getElementById('room-list');
        if (!listEl) return;
        if (data.rooms.length === 0) {
          listEl.innerHTML = '<div style="opacity:0.5; padding:0.5rem 0;">Нет открытых комнат</div>';
          return;
        }
        listEl.innerHTML = data.rooms.map((r: { code: string; hostName: string; playerCount: number; maxPlayers: number; config: { cols: number; rows: number } }) =>
          `<div class="flex-row" style="justify-content:space-between; padding:0.4rem 0.6rem; background:rgba(255,255,255,0.03); border-radius:6px; margin-bottom:0.3rem;">
            <div style="display:flex; gap:0.8rem; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:bold;">${r.hostName}</span>
              <span style="opacity:0.5;">${r.config.cols}x${r.config.rows}</span>
              <span style="opacity:0.5;">${r.playerCount}/${r.maxPlayers}</span>
            </div>
            <button class="btn btn-primary room-join-btn" data-code="${r.code}" style="--accent:#2A9D8F; padding:0.3rem 0.8rem; font-size:0.85rem;">Войти</button>
          </div>`
        ).join('');
        listEl.querySelectorAll('.room-join-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const code = (btn as HTMLElement).dataset.code!;
            const name = (document.getElementById('join-name') as HTMLInputElement).value.trim() || dn;
            cleanupInterval();
            this.container.innerHTML = '';
            callbacks.onJoin(code, name);
          });
        });
      } catch {
        // ignore fetch errors
      }
    };

    const cleanupInterval = () => {
      if (roomListInterval !== null) {
        clearInterval(roomListInterval);
        roomListInterval = null;
      }
    };

    loadRooms();
    roomListInterval = setInterval(loadRooms, 5000);

    document.getElementById('create-btn')!.addEventListener('click', () => {
      const name = (document.getElementById('create-name') as HTMLInputElement).value.trim() || dn;
      const cols = parseInt((document.getElementById('create-cols') as HTMLInputElement).value) || 8;
      const rows = parseInt((document.getElementById('create-rows') as HTMLInputElement).value) || 8;
      const playerCount = parseInt((document.getElementById('create-players') as HTMLSelectElement).value) || 2;
      const startingUnits = parseInt((document.getElementById('create-units') as HTMLInputElement).value) || 20;
      const visionRadius = parseInt((document.getElementById('create-vision') as HTMLInputElement).value) || 2;
      cleanupInterval();
      this.container.innerHTML = '';
      callbacks.onCreate({ cols, rows, playerCount, startingUnits, visionRadius }, name);
    });

    document.getElementById('join-btn')!.addEventListener('click', () => {
      const name = (document.getElementById('join-name') as HTMLInputElement).value.trim() || dn;
      const code = (document.getElementById('join-code') as HTMLInputElement).value.trim().toUpperCase();
      if (code.length !== 4) return;
      cleanupInterval();
      this.container.innerHTML = '';
      callbacks.onJoin(code, name);
    });

    document.getElementById('lobby-back-btn')!.addEventListener('click', () => {
      cleanupInterval();
      this.container.innerHTML = '';
      callbacks.onBack();
    });
  }

  /** Show waiting room with room code and player list */
  showWaitingRoom(roomCode: string, players: PlayerInfo[], config: Omit<GameConfig, 'seed'>, onLeave: () => void): void {
    const playerListHtml = players.map((p) => `
      <div class="flex-row" style="gap:8px; padding:4px 0;">
        <span class="dot dot-lg" style="background:${p.color};"></span>
        <span>${p.name}</span>
        <span style="opacity:0.5;">${p.connected ? '' : '(отключен)'}</span>
      </div>
    `).join('');

    this.container.innerHTML = `
      <div class="screen">
        <div class="subtitle mb-2">Код комнаты:</div>
        <div style="font-size:4rem; font-weight:bold; letter-spacing:0.5em; color:#457B9D;" class="mb-2">${roomCode}</div>
        <button id="copy-invite-btn" class="btn btn-ghost" style="margin-bottom:1rem; font-size:0.9rem;">Скопировать ссылку</button>
        <div class="subtitle mb-1">Поле ${config.cols}x${config.rows}, ${config.startingUnits} юн., обзор ${config.visionRadius}</div>
        <div style="font-size:1.2rem;" class="mb-1">Игроки (${players.length}/${config.playerCount}):</div>
        <div id="waiting-players" class="mb-4" style="min-width:200px;">
          ${playerListHtml}
        </div>
        <div class="subtitle mb-2">Ожидание игроков...</div>
        <button id="leave-room-btn" class="btn btn-ghost">Покинуть</button>
      </div>
    `;
    document.getElementById('copy-invite-btn')!.addEventListener('click', () => {
      const url = `${window.location.origin}/join/${roomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copy-invite-btn')!;
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = 'Скопировать ссылку'; }, 2000);
      });
    });

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
      <div class="flex-row" style="gap:8px; padding:4px 0;">
        <span class="dot dot-lg" style="background:${p.color};"></span>
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
      <div class="panel-bottom">
        <div style="font-size:1.2rem;">Ожидание приказов...</div>
        <div class="subtitle" style="margin-top:0.5rem;">${pendingNames}</div>
      </div>
    `;
  }

  /** Show error message with back button */
  showError(message: string, onBack: () => void): void {
    this.container.innerHTML = `
      <div class="screen">
        <div style="font-size:1.5rem; color:var(--danger);" class="mb-4">${message}</div>
        <button id="error-back-btn" class="btn btn-secondary">Назад</button>
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

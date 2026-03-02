import { Board } from '../engine/board';
import { MoveOrder, DIRECTION_DELTA, PLAYER_COLORS, Position, CombatResult } from '../engine/types';

export interface RoutePath {
  playerId: number;
  currentPos: Position;
  path: Position[];
  unitCount: number;
}

export interface RenderState {
  board: Board;
  orders: MoveOrder[];
  selectedCell: Position | null;
  validMoves: Position[];
  currentPlayerId: number | null;
  highlightCells: Position[];
  combatCells: CombatResult[];
  visibleCells: Set<string> | null;
  routePaths: RoutePath[];
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cellSize = 0;
  private offsetX = 0;
  private offsetY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cols: number,
    private rows: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const parent = this.canvas.parentElement!;
    const mobile = window.innerWidth < 600;
    const padH = mobile ? 16 : 40;
    const padV = mobile ? 16 : 40;
    const maxW = parent.clientWidth - padH;
    const maxH = parent.clientHeight - padV;
    this.cellSize = Math.floor(Math.min(maxW / this.cols, maxH / this.rows));
    this.cellSize = Math.max(this.cellSize, 30); // lower minimum on mobile
    const totalW = this.cellSize * this.cols;
    const totalH = this.cellSize * this.rows;
    this.canvas.width = totalW;
    this.canvas.height = totalH;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  getCellSize(): number {
    return this.cellSize;
  }

  pixelToCell(px: number, py: number): Position | null {
    const x = Math.floor((px - this.offsetX) / this.cellSize);
    const y = Math.floor((py - this.offsetY) / this.cellSize);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return null;
    return { x, y };
  }

  cellToPixelCenter(pos: Position): { px: number; py: number } {
    return {
      px: this.offsetX + pos.x * this.cellSize + this.cellSize / 2,
      py: this.offsetY + pos.y * this.cellSize + this.cellSize / 2,
    };
  }

  render(state: RenderState): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid();
    this.drawHighlights(state.highlightCells, state.currentPlayerId);
    this.drawCombatHighlights(state.combatCells);
    this.drawSelectedCell(state.selectedCell);
    this.drawValidMoves(state.validMoves);
    this.drawStacks(state.board, state.visibleCells, state.currentPlayerId);
    this.drawOrders(state.orders);
    this.drawRoutes(state.routePaths);
    this.drawCombatLabels(state.combatCells);
    this.drawCoordinates(state.visibleCells);
    this.drawFog(state.visibleCells);
  }

  private drawGrid(): void {
    const { ctx, cellSize, offsetX, offsetY, cols, rows } = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = offsetX + x * cellSize;
        const py = offsetY + y * cellSize;
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1b2a4a' : '#0f1524';
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }

    ctx.strokeStyle = '#2e3d5e';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x * cellSize, offsetY);
      ctx.lineTo(offsetX + x * cellSize, offsetY + rows * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y * cellSize);
      ctx.lineTo(offsetX + cols * cellSize, offsetY + y * cellSize);
      ctx.stroke();
    }
  }

  private drawCoordinates(visibleCells: Set<string> | null): void {
    if (this.cellSize < 50) return; // Hide coordinates on small cells (mobile)
    const { ctx, cellSize, offsetX, offsetY, cols, rows } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = `${Math.max(9, cellSize * 0.18)}px system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (visibleCells && !visibleCells.has(`${x},${y}`)) continue;
        ctx.fillText(`${x},${y}`, offsetX + x * cellSize + 3, offsetY + y * cellSize + 2);
      }
    }
  }

  private drawSelectedCell(cell: Position | null): void {
    if (!cell) return;
    const { ctx, cellSize, offsetX, offsetY } = this;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      offsetX + cell.x * cellSize + 2,
      offsetY + cell.y * cellSize + 2,
      cellSize - 4,
      cellSize - 4,
    );
  }

  private drawValidMoves(cells: Position[]): void {
    const { ctx, cellSize, offsetX, offsetY } = this;
    for (const cell of cells) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(
        offsetX + cell.x * cellSize,
        offsetY + cell.y * cellSize,
        cellSize,
        cellSize,
      );
    }
  }

  private drawHighlights(cells: Position[], playerId: number | null): void {
    if (playerId === null) return;
    const { ctx, cellSize, offsetX, offsetY } = this;
    const color = PLAYER_COLORS[playerId] ?? '#888';
    for (const cell of cells) {
      ctx.fillStyle = color + '22';
      ctx.fillRect(
        offsetX + cell.x * cellSize,
        offsetY + cell.y * cellSize,
        cellSize,
        cellSize,
      );
    }
  }

  private drawCombatHighlights(combats: CombatResult[]): void {
    const { ctx, cellSize, offsetX, offsetY } = this;
    for (const combat of combats) {
      const { x, y } = combat.position;
      // Red pulsing border for combat cells
      ctx.fillStyle = 'rgba(255, 50, 50, 0.15)';
      ctx.fillRect(
        offsetX + x * cellSize,
        offsetY + y * cellSize,
        cellSize,
        cellSize,
      );
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        offsetX + x * cellSize + 1,
        offsetY + y * cellSize + 1,
        cellSize - 2,
        cellSize - 2,
      );
    }
  }

  private drawCombatLabels(combats: CombatResult[]): void {
    const { ctx, cellSize } = this;
    for (const combat of combats) {
      const { px, py } = this.cellToPixelCenter(combat.position);
      const winnerColor = PLAYER_COLORS[combat.winnerId] ?? '#fff';

      // "X" marks for eliminated players at the top of the cell
      const fontSize = Math.max(10, cellSize * 0.2);
      ctx.font = `bold ${fontSize}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Show combat result below the stack
      ctx.fillStyle = winnerColor;
      ctx.font = `bold ${Math.max(9, cellSize * 0.18)}px system-ui`;
      ctx.textBaseline = 'top';
      const resultY = py + cellSize * 0.3;
      const label = `${combat.unitsAfter}`;

      // Background
      const metrics = ctx.measureText(label);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(px - metrics.width / 2 - 3, resultY - 2, metrics.width + 6, fontSize + 2);
      ctx.fillStyle = winnerColor;
      ctx.fillText(label, px, resultY);
    }
  }

  private drawStacks(board: Board, visibleCells: Set<string> | null, currentPlayerId: number | null): void {
    const { ctx, cellSize } = this;
    for (const pos of board.getOccupiedCells()) {
      const stacks = board.getStacks(pos);
      for (const stack of stacks) {
        if (!stack.alive) continue;
        // Hide enemy stacks in fog
        if (visibleCells && !visibleCells.has(`${pos.x},${pos.y}`) && stack.playerId !== currentPlayerId) continue;
        const { px, py } = this.cellToPixelCenter(pos);
        const radius = Math.min(cellSize * 0.35, 8 + Math.log2(stack.units + 1) * 4);
        const color = PLAYER_COLORS[stack.playerId] ?? '#888';

        // Shadow
        ctx.beginPath();
        ctx.arc(px + 2, py + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Circle
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Unit count
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(12, cellSize * 0.3)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(stack.units), px, py);
      }
    }
  }

  private drawFog(visibleCells: Set<string> | null): void {
    if (!visibleCells) return;
    const { ctx, cellSize, offsetX, offsetY, cols, rows } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (visibleCells.has(`${x},${y}`)) continue;
        ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
      }
    }
  }

  private drawRoutes(routes: RoutePath[]): void {
    const { ctx, cellSize } = this;

    for (const route of routes) {
      const color = PLAYER_COLORS[route.playerId] ?? '#888';
      const points = [route.currentPos, ...route.path];

      // Dashed line through all waypoints
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color + '88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const start = this.cellToPixelCenter(points[0]);
      ctx.moveTo(start.px, start.py);
      for (let i = 1; i < points.length; i++) {
        const p = this.cellToPixelCenter(points[i]);
        ctx.lineTo(p.px, p.py);
      }
      ctx.stroke();
      ctx.restore();

      // Small dots on each intermediate waypoint
      for (let i = 1; i < points.length - 1; i++) {
        const p = this.cellToPixelCenter(points[i]);
        ctx.beginPath();
        ctx.arc(p.px, p.py, 3, 0, Math.PI * 2);
        ctx.fillStyle = color + 'aa';
        ctx.fill();
      }

      // Circle marker on final point
      if (points.length >= 2) {
        const final = this.cellToPixelCenter(points[points.length - 1]);
        ctx.beginPath();
        ctx.arc(final.px, final.py, Math.max(6, cellSize * 0.12), 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = color + '44';
        ctx.fill();

        // Unit count label near destination
        const label = String(route.unitCount);
        ctx.font = `bold ${Math.max(9, cellSize * 0.18)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const metrics = ctx.measureText(label);
        const ly = final.py + Math.max(8, cellSize * 0.14);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(final.px - metrics.width / 2 - 2, ly - 1, metrics.width + 4, Math.max(10, cellSize * 0.2) + 2);
        ctx.fillStyle = color;
        ctx.fillText(label, final.px, ly);
      }
    }
  }

  private drawOrders(orders: MoveOrder[]): void {
    const { ctx, cellSize } = this;
    for (const order of orders) {
      const from = this.cellToPixelCenter(order.from);
      const delta = DIRECTION_DELTA[order.direction];
      const to = this.cellToPixelCenter({
        x: order.from.x + delta.x,
        y: order.from.y + delta.y,
      });
      const color = PLAYER_COLORS[order.playerId] ?? '#888';

      // Arrow line
      ctx.beginPath();
      ctx.moveTo(from.px, from.py);
      ctx.lineTo(to.px, to.py);
      ctx.strokeStyle = color + 'cc';
      ctx.lineWidth = Math.max(2, Math.min(order.unitCount, 8));
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(to.py - from.py, to.px - from.px);
      const headLen = cellSize * 0.2;
      ctx.beginPath();
      ctx.moveTo(to.px, to.py);
      ctx.lineTo(
        to.px - headLen * Math.cos(angle - Math.PI / 6),
        to.py - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        to.px - headLen * Math.cos(angle + Math.PI / 6),
        to.py - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fillStyle = color + 'cc';
      ctx.fill();

      // Unit count label on arrow
      const midX = (from.px + to.px) / 2;
      const midY = (from.py + to.py) / 2;
      ctx.font = `bold ${Math.max(10, cellSize * 0.22)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const label = String(order.unitCount);
      const metrics = ctx.measureText(label);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(midX - metrics.width / 2 - 3, midY - 8, metrics.width + 6, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, midX, midY);
    }
  }
}

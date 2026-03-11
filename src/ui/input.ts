import { Position } from '../engine/types';
import { Renderer } from './renderer';

export type CellClickHandler = (pos: Position) => void;

export class InputHandler {
  private handlers: CellClickHandler[] = [];
  private boundClick: (e: MouseEvent) => void;
  private boundTouch: (e: TouchEvent) => void;
  private touchHandled = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
  ) {
    this.boundClick = this.onClick.bind(this);
    this.boundTouch = this.onTouchEnd.bind(this);
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('touchend', this.boundTouch);
  }

  onCellClick(handler: CellClickHandler): void {
    this.handlers.push(handler);
  }

  private dispatch(px: number, py: number): void {
    const cell = this.renderer.pixelToCell(px, py);
    if (cell) {
      for (const handler of this.handlers) {
        handler(cell);
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    const px = touch.clientX - rect.left;
    const py = touch.clientY - rect.top;
    this.touchHandled = true;
    this.dispatch(px, py);
  }

  private onClick(e: MouseEvent): void {
    // Skip if already handled by touch (prevents double-fire on mobile)
    if (this.touchHandled) {
      this.touchHandled = false;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    this.dispatch(px, py);
  }

  destroy(): void {
    this.canvas.removeEventListener('click', this.boundClick);
    this.canvas.removeEventListener('touchend', this.boundTouch);
  }
}

import { Position } from '../engine/types';
import { Renderer } from './renderer';

export type CellClickHandler = (pos: Position) => void;

export class InputHandler {
  private handlers: CellClickHandler[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
  ) {
    this.canvas.addEventListener('click', this.onClick.bind(this));
  }

  onCellClick(handler: CellClickHandler): void {
    this.handlers.push(handler);
  }

  private onClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cell = this.renderer.pixelToCell(px, py);
    if (cell) {
      for (const handler of this.handlers) {
        handler(cell);
      }
    }
  }

  destroy(): void {
    this.canvas.removeEventListener('click', this.onClick.bind(this));
  }
}

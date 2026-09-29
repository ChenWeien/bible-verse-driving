/** Keyboard state for driving. */
export class Input {
  private down = new Set<string>();
  private pressedHandlers: Array<(code: string) => void> = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Let a focused dropdown keep its arrow keys, but Enter still starts the game.
      if (e.target instanceof HTMLSelectElement && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      if (!this.down.has(e.code)) this.pressedHandlers.forEach((h) => h(e.code));
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  onPressed(handler: (code: string) => void): void {
    this.pressedHandlers.push(handler);
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** -1 (brake/reverse) .. 1 (accelerate). */
  get throttle(): number {
    return (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  }

  /** -1 (left) .. 1 (right). */
  get steer(): number {
    return (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  }
}

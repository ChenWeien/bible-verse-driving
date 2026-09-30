/** Keyboard and touch state for driving. Touch buttons and physical keys are tracked separately so releasing one does not cancel the other. */
export class Input {
  private keys = new Set<string>();
  private touch = new Set<string>();
  private pressedHandlers: Array<(code: string) => void> = [];

  constructor(target: EventTarget = window) {
    target.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      // Let a focused dropdown keep its arrow keys, but Enter still starts the game.
      if (
        typeof HTMLSelectElement !== 'undefined' &&
        ev.target instanceof HTMLSelectElement &&
        ev.code !== 'Enter' &&
        ev.code !== 'NumpadEnter'
      ) {
        return;
      }
      if (!this.isDown(ev.code)) this.pressedHandlers.forEach((h) => h(ev.code));
      this.keys.add(ev.code);
      if (ev.code.startsWith('Arrow') || ev.code === 'Space') ev.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
    });
  }

  onPressed(handler: (code: string) => void): void {
    this.pressedHandlers.push(handler);
  }

  /** Hold or release a virtual key from an on-screen button. */
  setTouch(code: string, held: boolean): void {
    const before = this.isDown(code);
    if (held) this.touch.add(code);
    else this.touch.delete(code);
    if (held && !before) this.pressedHandlers.forEach((h) => h(code));
  }

  /** Drop every touch-held key, for example when a finger is cancelled or the page hides. */
  clearTouch(): void {
    this.touch.clear();
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c) || this.touch.has(c));
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

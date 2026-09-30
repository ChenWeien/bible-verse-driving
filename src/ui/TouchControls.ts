import type { Input } from '../game/input';

/** Phones, tablets, and touchscreen laptops. A mouse-only desktop stays on the keyboard. */
export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(any-pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches ||
    window.matchMedia('(any-hover: none)').matches
  );
}

/** Stop the browser from scrolling, bouncing, or pinch-zooming the game. Menus can still scroll. */
export function installTouchGuards(): void {
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest('.panel, .finish-passage, select, input, textarea')) return;
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

/**
 * On-screen accelerate / brake / steer / pause buttons.
 * Holds feed the same Input state as the keyboard, and each finger is tracked on its own.
 */
export class TouchControls {
  private root = document.getElementById('touch-controls')!;
  private bindings: Array<{ pointers: Set<number>; button: HTMLElement }> = [];

  onPause: () => void = () => {};

  constructor(private input: Input) {
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-code]')) {
      this.bindHold(button, button.dataset.code!);
    }
    const pause = document.getElementById('touch-pause');
    if (pause) this.bindTap(pause, () => this.onPause());

    const drop = () => this.releaseAll();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) drop();
    });
    window.addEventListener('blur', drop);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.trackVerseHeight();
  }

  /** Portrait layout places the driving buttons just above the verse card. */
  private trackVerseHeight(): void {
    const verse = document.querySelector('.hud-verse');
    if (!verse) return;
    const apply = () => {
      const h = Math.ceil(verse.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--verse-h', `${h}px`);
    };
    apply();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(verse);
  }

  /** Show the pad only during a run, and only when touch controls are enabled. */
  setPlaying(playing: boolean): void {
    const show = playing && document.body.classList.contains('touch-ui');
    this.root.classList.toggle('hidden', !show);
    if (!show) this.releaseAll();
  }

  private bindHold(button: HTMLElement, code: string): void {
    const pointers = new Set<number>();
    this.bindings.push({ pointers, button });
    const sync = () => {
      const held = pointers.size > 0;
      button.classList.toggle('held', held);
      button.setAttribute('aria-pressed', String(held));
      this.input.setTouch(code, held);
    };
    button.addEventListener('pointerdown', (e) => {
      if (!this.primaryPointer(e)) return;
      e.preventDefault();
      this.capture(button, e.pointerId);
      pointers.add(e.pointerId);
      sync();
    });
    const end = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      sync();
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
  }

  private bindTap(button: HTMLElement, action: () => void): void {
    let pointerId: number | null = null;
    button.addEventListener('pointerdown', (e) => {
      if (!this.primaryPointer(e) || pointerId !== null) return;
      e.preventDefault();
      this.capture(button, e.pointerId);
      pointerId = e.pointerId;
      button.classList.add('held');
    });
    button.addEventListener('pointerup', (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      button.classList.remove('held');
      const r = button.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) action();
    });
    button.addEventListener('pointercancel', (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      button.classList.remove('held');
    });
  }

  private primaryPointer(e: PointerEvent): boolean {
    return e.pointerType !== 'mouse' || e.button === 0;
  }

  /** Real touches keep sending events after the finger slides off. Synthetic events cannot capture. */
  private capture(button: HTMLElement, pointerId: number): void {
    try {
      button.setPointerCapture(pointerId);
    } catch {
      // The pointer is already gone, or this event was dispatched in a test.
    }
  }

  private releaseAll(): void {
    for (const b of this.bindings) {
      b.pointers.clear();
      b.button.classList.remove('held');
      b.button.setAttribute('aria-pressed', 'false');
    }
    document.getElementById('touch-pause')?.classList.remove('held');
    this.input.clearTouch();
  }
}

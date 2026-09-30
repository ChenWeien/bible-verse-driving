import { describe, expect, it } from 'vitest';
import { Input } from './input';

function key(type: string, code: string): Event {
  const e = new Event(type, { cancelable: true });
  Object.defineProperty(e, 'code', { value: code });
  return e;
}

describe('Input', () => {
  it('maps touch holds onto throttle and steer', () => {
    const input = new Input(new EventTarget());
    input.setTouch('KeyW', true);
    input.setTouch('KeyA', true);
    expect(input.throttle).toBe(1);
    expect(input.steer).toBe(-1);

    input.setTouch('KeyS', true);
    expect(input.throttle).toBe(0);
    input.setTouch('KeyW', false);
    expect(input.throttle).toBe(-1);

    input.setTouch('KeyD', true);
    expect(input.steer).toBe(0);
    input.clearTouch();
    expect(input.throttle).toBe(0);
    expect(input.steer).toBe(0);
  });

  it('fires the press handler once when a touch control goes down', () => {
    const input = new Input(new EventTarget());
    const presses: string[] = [];
    input.onPressed((code) => presses.push(code));
    input.setTouch('KeyP', true);
    input.setTouch('KeyP', true);
    input.setTouch('KeyP', false);
    expect(presses).toEqual(['KeyP']);
  });

  it('keeps a held keyboard key when the matching touch control releases', () => {
    const target = new EventTarget();
    const input = new Input(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    input.setTouch('KeyW', true);
    input.setTouch('KeyW', false);
    expect(input.throttle).toBe(1);
    target.dispatchEvent(key('keyup', 'KeyW'));
    expect(input.throttle).toBe(0);
  });
});

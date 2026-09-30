import type { Passage, PassageIndexEntry } from '../data/passage';
import { verseTokens, type DisplayToken } from '../data/verseDisplay';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function tokensToHtml(tokens: DisplayToken[]): string {
  return tokens
    .map((t) => (t.kind === 'text' ? escapeHtml(t.text) : `<span class="tok-${t.kind}">${escapeHtml(t.text)}</span>`))
    .join('');
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface FinishStats {
  time: number;
  mistakes: number;
}

/** HTML overlay: start menu, in-game HUD, pause and finish screens. */
export class Hud {
  private hud = $('hud');
  private start = $('start-screen');
  private finish = $('finish-screen');
  private pause = $('pause-screen');
  private loading = $('loading');
  private select = $<HTMLSelectElement>('passage-select');
  private toastEl = $('hud-toast');
  private toastTimer = 0;
  private lastVerseKey = '';

  onStart: (passageId: string) => void = () => {};
  onRetry: () => void = () => {};
  onMenu: () => void = () => {};
  onResume: () => void = () => {};
  onScreen: (screen: 'start' | 'playing' | 'paused' | 'finished') => void = () => {};

  constructor() {
    $('start-button').addEventListener('click', () => this.onStart(this.select.value));
    $('retry-button').addEventListener('click', () => this.onRetry());
    $('menu-button').addEventListener('click', () => this.onMenu());
    $('resume-button').addEventListener('click', () => this.onResume());
    $('quit-button').addEventListener('click', () => this.onMenu());
  }

  get selectedPassageId(): string {
    return this.select.value;
  }

  setPassages(entries: PassageIndexEntry[], selected: string) {
    this.select.innerHTML = entries
      .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title ?? e.id)}</option>`)
      .join('');
    if (entries.some((e) => e.id === selected)) this.select.value = selected;
  }

  hideLoading() {
    this.loading.classList.add('hidden');
  }

  showError(message: string | null) {
    const el = $('start-error');
    el.textContent = message ?? '';
    el.classList.toggle('hidden', !message);
  }

  setStartBusy(busy: boolean) {
    const btn = $<HTMLButtonElement>('start-button');
    btn.disabled = busy;
  }

  showScreen(screen: 'start' | 'playing' | 'paused' | 'finished') {
    this.start.classList.toggle('hidden', screen !== 'start');
    this.hud.classList.toggle('hidden', screen === 'start');
    this.pause.classList.toggle('hidden', screen !== 'paused');
    this.finish.classList.toggle('hidden', screen !== 'finished');
    if (screen !== 'start' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.onScreen(screen);
  }

  get visibleScreen(): 'start' | 'paused' | 'finished' | 'playing' {
    if (!this.start.classList.contains('hidden')) return 'start';
    if (!this.pause.classList.contains('hidden')) return 'paused';
    if (!this.finish.classList.contains('hidden')) return 'finished';
    return 'playing';
  }

  setPassage(p: Passage) {
    $('hud-passage-title').textContent = p.title;
    $('hud-passage-ref').textContent = p.reference;
    this.lastVerseKey = '';
  }

  update(p: Passage, challengeIndex: number, elapsed: number, mistakes: number, speedKmh: number) {
    $('hud-timer').textContent = formatTime(elapsed);
    $('hud-mistakes').textContent = String(mistakes);
    $('hud-speed').textContent = String(Math.round(speedKmh));
    const total = p.challenges.length;
    const done = Math.min(challengeIndex, total);
    ($('hud-progress-fill') as HTMLElement).style.width = `${(done / total) * 100}%`;
    $('hud-progress-text').textContent = `${done} / ${total} 已完成`;

    const key = `${p.id}:${challengeIndex}`;
    if (key !== this.lastVerseKey) {
      this.lastVerseKey = key;
      const c = p.challenges[Math.min(challengeIndex, total - 1)];
      const verse = p.verses[c.verseIndex];
      $('hud-verse-ref').textContent = verse.ref;
      $('hud-verse-text').innerHTML = tokensToHtml(verseTokens(verse, p, challengeIndex));
    }
  }

  toast(html: string, kind: 'good' | 'bad' | 'info' = 'info', ms = 1800) {
    this.toastEl.innerHTML = html;
    this.toastEl.className = `hud-toast show ${kind}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.className = 'hud-toast'), ms);
  }

  showFinish(p: Passage, stats: FinishStats) {
    $('finish-title').textContent = `${p.title}${p.reference ? '　' + p.reference : ''}`;
    $('finish-time').textContent = formatTime(stats.time);
    $('finish-mistakes').textContent = String(stats.mistakes);
    const total = p.challenges.length;
    $('finish-accuracy').textContent = `${Math.round((total / (total + stats.mistakes)) * 100)}%`;
    $('finish-passage').innerHTML = p.verses
      .map(
        (v) =>
          `<p><sup>${escapeHtml(v.ref)}</sup>${tokensToHtml(verseTokens(v, p, Infinity))}</p>`,
      )
      .join('');
    this.showScreen('finished');
  }
}

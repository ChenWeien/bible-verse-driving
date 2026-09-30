import './style.css';
import { loadPassage, loadPassageIndex, type Passage, type PassageIndex } from './data/passage';
import { Game } from './game/Game';
import { Input } from './game/input';
import { Hud } from './ui/Hud';
import { installTouchGuards, prefersTouchControls, TouchControls } from './ui/TouchControls';

const params = new URLSearchParams(location.search);
const flag = (name: string) => params.has(name) && params.get(name) !== '0' && params.get(name) !== 'false';
const autoParam = params.get('auto');
const seedParam = params.get('seed');

installTouchGuards();
if (flag('touch') || prefersTouchControls()) document.body.classList.add('touch-ui');

/** Keep the HUD above Safari's collapsing toolbar on a short phone. */
function syncVisualViewport() {
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const bottom = vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0;
  const root = document.documentElement;
  root.style.setProperty('--vv-top', `${top}px`);
  root.style.setProperty('--vv-bottom', `${bottom}px`);
}
syncVisualViewport();
window.visualViewport?.addEventListener('resize', syncVisualViewport);
window.visualViewport?.addEventListener('scroll', syncVisualViewport);

const hud = new Hud();
const input = new Input();
const touch = new TouchControls(input);
const game = new Game(document.getElementById('scene')!, hud, input, {
  debug: flag('debug'),
  auto: autoParam === 'wrong' ? 'wrong' : flag('auto') ? 'correct' : false,
  fast: flag('fast'),
  seed: seedParam ? Number(seedParam) : undefined,
});
game.run();

let index: PassageIndex | null = null;
const cache = new Map<string, Passage>();

async function startPassage(id: string) {
  if (!index) return;
  const entry = index.passages.find((p) => p.id === id) ?? index.passages[0];
  hud.showError(null);
  hud.setStartBusy(true);
  try {
    // Always re-fetch so edits to the JSON show up without restarting the dev server.
    const passage = await loadPassage(entry);
    cache.set(entry.id, passage);
    game.start(passage);
  } catch (err) {
    console.error(err);
    hud.showError(`無法載入經文 Cannot load passage "${entry.file}": ${(err as Error).message}`);
    hud.showScreen('start');
  } finally {
    hud.setStartBusy(false);
  }
}

hud.onStart = (id) => void startPassage(id);
hud.onRetry = () => game.restart();
hud.onMenu = () => game.toMenu();
hud.onResume = () => game.togglePause();
hud.onScreen = (screen) => touch.setPlaying(screen === 'playing');
touch.onPause = () => game.togglePause();

// A touchscreen that didn't match the media queries still gets the pad on first contact.
window.addEventListener(
  'touchstart',
  () => {
    if (document.body.classList.contains('touch-ui')) return;
    document.body.classList.add('touch-ui');
    touch.setPlaying(hud.visibleScreen === 'playing');
  },
  { once: true, passive: true },
);

input.onPressed((code) => {
  const screen = hud.visibleScreen;
  if (code === 'Enter' || code === 'NumpadEnter') {
    if (screen === 'start') void startPassage(hud.selectedPassageId);
    else if (screen === 'finished') game.restart();
  } else if (code === 'KeyP' || code === 'Escape') {
    game.togglePause();
  }
});

(async () => {
  try {
    index = await loadPassageIndex();
    const wanted = params.get('passage') ?? index.default;
    hud.setPassages(index.passages, wanted);
    hud.hideLoading();
    hud.showScreen('start');
    if (flag('autostart')) void startPassage(hud.selectedPassageId);
  } catch (err) {
    console.error(err);
    hud.hideLoading();
    hud.showScreen('start');
    hud.showError(`無法載入經文清單 Cannot load passages/index.json: ${(err as Error).message}`);
  }
})();

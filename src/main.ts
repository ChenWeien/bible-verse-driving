import './style.css';
import { loadPassage, loadPassageIndex, type Passage, type PassageIndex } from './data/passage';
import { Game } from './game/Game';
import { Input } from './game/input';
import { Hud } from './ui/Hud';

const params = new URLSearchParams(location.search);
const flag = (name: string) => params.has(name) && params.get(name) !== '0' && params.get(name) !== 'false';
const autoParam = params.get('auto');
const seedParam = params.get('seed');

const hud = new Hud();
const input = new Input();
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

// Automated browser play-test: launches headless Edge/Chrome, drives the game with real
// keyboard events over the Chrome DevTools Protocol, checks game state, saves screenshots.
// Usage: start `npm run dev`, then `node scripts/playtest.mjs [url]`. Needs Node 22+.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5173/?debug=1&seed=42';
const PORT = 9333;
const OUT = 'docs';
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) throw new Error('No Edge/Chrome found');
const profile = join(tmpdir(), `verse-driving-playtest-${Date.now()}`);
const browser = spawn(
  exe,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,720',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.onopen = res;
          ws.onerror = rej;
        });
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
          } else if (msg.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
          } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
          }
        };
        return;
      }
    } catch {
      /* browser still starting */
    }
    await sleep(200);
  }
  throw new Error('Could not connect to the browser DevTools endpoint');
}

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description}`);
  return r.result.value;
}

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, name);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`      screenshot -> ${file}`);
}

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  W: { key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 },
  A: { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 },
  D: { key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 },
  S: { key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 },
};
const keyDown = (k) => send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS[k] });
const keyUp = (k) => send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEYS[k] });
async function press(k) {
  await keyDown(k);
  await sleep(60);
  await keyUp(k);
}

const game = (expr) => evaluate(`(() => { const g = window.__game; return ${expr}; })()`);
async function waitFor(expr, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await game(expr)) return true;
    await sleep(100);
  }
  console.log(`      timed out waiting for ${label ?? expr}`);
  return false;
}

/** Steers with A/D keys until the car's lateral offset is near the target lane center. */
async function steerToLane(lane) {
  const target = -6.75 + 4.5 * (lane + 0.5);
  for (let i = 0; i < 100; i++) {
    const off = await game('g.car.offset');
    const err = target - off;
    if (Math.abs(err) < 0.6) break;
    const k = err > 0 ? 'D' : 'A';
    await keyDown(k);
    await sleep(Math.min(250, Math.abs(err) * 40));
    await keyUp(k);
  }
  return game('g.car.offset');
}

try {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(500);

  check('page loads and exposes debug game', await waitFor('!!g', 15000));
  check(
    'start screen is visible with passage selector',
    await waitFor(`!document.getElementById('start-screen').classList.contains('hidden') && document.getElementById('passage-select').value === 'psalm-16'`, 10000),
  );
  await sleep(1500);
  await screenshot('start-screen.png');

  await press('Enter');
  check('Enter starts the game', await waitFor(`g.state === 'playing' && g.passage && g.passage.challenges.length > 0`, 10000));
  const total = await game('g.passage.challenges.length');
  check('Psalm 16 loaded with all verses', (await game('g.passage.verses.length')) === 11, `${total} blanks`);

  const segs = await game('g.track.segments.length');
  const meshes = await game('(() => { let n = 0; g.scene.traverse(o => { if (o.isInstancedMesh) n++; }); return n; })()');
  check('city renders (track segments + instanced buildings/props)', segs > 3 && meshes > 10, `segments=${segs} instancedMeshes=${meshes}`);

  // Accelerate with the keyboard.
  await keyDown('W');
  await sleep(2500);
  const v1 = await game('g.car.speed');
  check('W accelerates the car', v1 > 3, `speed=${v1.toFixed(1)} m/s`);

  // Steer with the keyboard.
  const off0 = await game('g.car.offset');
  await keyDown('D');
  await sleep(500);
  await keyUp('D');
  const off1 = await game('g.car.offset');
  check('D steers right', off1 > off0 + 0.5, `offset ${off0.toFixed(2)} -> ${off1.toFixed(2)}`);
  await keyDown('A');
  await sleep(500);
  await keyUp('A');
  const off2 = await game('g.car.offset');
  check('A steers left', off2 < off1 - 0.5, `offset ${off1.toFixed(2)} -> ${off2.toFixed(2)}`);

  // Approach the first checkpoint and capture the sign.
  check('first checkpoint exists', await waitFor('!!g.active', 5000));
  const cp = await game(`({ gate: g.active.gateS, options: g.active.options, correct: g.active.correctLane, answer: g.active.challenge.answer })`);
  console.log(`      checkpoint at s=${cp.gate.toFixed(0)} options=${cp.options.join('/')} correct=${cp.answer}`);
  check('checkpoint has 3 gate words incl. the answer', cp.options.length === 3 && cp.options.includes(cp.answer));
  await waitFor(`g.car.s > ${cp.gate} - 75`, 30000, 'approach sign');
  await keyUp('W');
  await screenshot('sign.png');
  const hudVerse = await evaluate(`document.getElementById('hud-verse-text').textContent`);
  check('HUD shows the verse with a blank', hudVerse.includes('＿＿'), hudVerse);

  // Wrong gate: steer into a wrong lane and drive through.
  const wrong = [0, 1, 2].find((l) => l !== cp.correct);
  await steerToLane(wrong);
  await keyDown('W');
  const bounced = await waitFor('g.mistakes === 1', 20000, 'wrong-gate bounce');
  const afterWrong = await game(`({ speed: g.car.speed, s: g.car.s, hint: g.active && g.active.hinting, idx: g.challengeIndex, stunned: g.car.stunned })`);
  await keyUp('W');
  check(
    'wrong gate bounces the car back and hints the correct gate',
    bounced && afterWrong.speed < 0 && afterWrong.s < cp.gate && afterWrong.hint && afterWrong.idx === 0,
    JSON.stringify(afterWrong),
  );
  await sleep(250);
  const toast = await evaluate(`document.getElementById('hud-toast').textContent`);
  check('wrong-gate toast shown', toast.includes('不對'), toast);
  await screenshot('wrong-gate.png');
  await waitFor('g.car.stunned <= 0 && Math.abs(g.car.speed) < 0.5', 5000, 'bounce settle');

  // Correct gate.
  await steerToLane(cp.correct);
  await keyDown('W');
  const filled = await waitFor('g.challengeIndex === 1', 20000, 'correct gate');
  check('correct gate fills the word and advances', filled && (await game('g.mistakes')) === 1);
  const burstCount = await game('g.particles.alive');
  check('correct gate fires celebration particles', burstCount > 100, `alive=${burstCount}`);
  await sleep(300);
  const verseAfter = await evaluate(`document.getElementById('hud-verse-text').innerHTML`);
  check('filled word highlighted in HUD', verseAfter.includes(`tok-filled">${cp.answer}<`), verseAfter);
  await screenshot('correct-gate.png');
  await keyUp('W');

  // Drive the rest with the debug autopilot, jumping close to each gate to keep it quick.
  await game(`(g.options.auto = 'correct', g.car.maxSpeed = 45, true)`);
  let lastIdx = -1;
  let gameplayShot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await game(`({ state: g.state, idx: g.challengeIndex, s: g.car.s, gate: g.active ? g.active.gateS : null })`);
    if (st.state === 'finished') {
      await sleep(350);
      await evaluate(`document.getElementById('debug').classList.add('hidden')`);
      await screenshot('finale-particles.png');
      break;
    }
    if (st.idx !== lastIdx && st.gate !== null) {
      lastIdx = st.idx;
      if (!gameplayShot && st.idx === 3) {
        await game('(g.debugJumpToGate(130), true)');
        await waitFor(`g.car.s > ${st.gate} - 62`, 20000, 'screenshot position');
        await evaluate(`document.getElementById('debug').classList.add('hidden')`);
        await screenshot('screenshot.png');
        await evaluate(`document.getElementById('debug').classList.remove('hidden')`);
        gameplayShot = true;
      } else if (st.idx === 7) {
        // Second blank of 16:4, the longest verse: the sign should show an excerpt.
        await game('(g.debugJumpToGate(110), true)');
        await waitFor(`g.car.s > ${st.gate} - 55`, 20000, 'long verse sign');
        await screenshot('sign-long-verse.png');
      } else if (st.idx === 5) {
        await sleep(350);
        await evaluate(`document.getElementById('debug').classList.add('hidden')`);
        await screenshot('correct-particles.png');
        await evaluate(`document.getElementById('debug').classList.remove('hidden')`);
        if (st.gate - (await game('g.car.s')) > 120) await game('(g.debugJumpToGate(), true)');
      } else if (st.gate - st.s > 120) {
        await game('(g.debugJumpToGate(), true)');
      }
    }
    await sleep(150);
  }
  check('all blanks completed', (await game('g.challengeIndex')) === total, `${await game('g.challengeIndex')}/${total}`);
  check('finish screen appears', await waitFor(`!document.getElementById('finish-screen').classList.contains('hidden')`, 8000));
  const finishText = await evaluate(`document.getElementById('finish-passage').textContent`);
  check('finish screen shows the full passage', finishText.includes('在你右手中有永遠的福樂') && !finishText.includes('＿＿'));
  const stats = await evaluate(`[...document.querySelectorAll('.finish-stats b')].map(b => b.textContent).join(' | ')`);
  console.log(`      finish stats: ${stats}`);
  await screenshot('finish-screen.png');

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));
} catch (err) {
  console.error(err);
  check('play-test ran without exceptions', false, String(err));
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  browser.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

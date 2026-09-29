# 讀經複習 (Verse Driving)

3D city driving game for memorizing Bible verses. Drive through the gate with the correct word to fill in each blank.

![Gameplay](docs/verse-driving-p1.png)

![Correct answer](docs/verse-driveng-Correct-screenshot.png)

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173/

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake |
| A/D or ←/→ | Change lane |
| P / Esc | Pause |

## Passages

Verse data lives in `public/passages/`. Mark blanks as `[correct|wrong1|wrong2]`. Edit JSON and refresh the browser — no rebuild needed.

Default passage: **詩篇 第十六篇** (Psalm 16).

# Nebula

**A generative physics playground in pure HTML, CSS, and JavaScript.**

Push particles with forces. Then bend the space they live in. Share the experiment you invent.

**Live demo:** [linzialessandro.github.io/Nebula](https://linzialessandro.github.io/Nebula/)

[![License: MIT](https://img.shields.io/badge/License-MIT-a78bfa.svg)](./LICENSE)
[![No build](https://img.shields.io/badge/build-none-5eead4.svg)](#quick-start)
[![Dependencies](https://img.shields.io/badge/dependencies-0-22d3ee.svg)](#files)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-a78bfa.svg)](https://linzialessandro.github.io/Nebula/)

---

## Quick start

```bash
# Option A — open the file
open index.html

# Option B — local static server
python3 -m http.server 8765
# → http://localhost:8765
```

No install. No bundler. No API keys. Or use the [live demo](https://linzialessandro.github.io/Nebula/).

---

## What it is

Nebula is a real-time particle field with **two orthogonal interaction layers**:

| Layer | Role |
|-------|------|
| **Force** | The cursor is a force field — attract, repel, orbit, vortex, stars, paint |
| **Geometry** | You edit the *metric* of space — wells and painted hills/valleys. Free particles curve even with the cursor field off |

### Highlights

- **Living metric** — rubber-sheet wells, paint, erase, metric grid, optical depth
- **Geometry presets** — Rubber Sheet, Binary Lens, Saddle, Gravity Wave, Horizon Garden
- **Discovery coach** — short first-run walkthrough (skippable; remembered via `localStorage`)
- **Shareable experiments** — copy a link encoding seed, wells, and key parameters
- **Juice** — palettes, bloom, neighbor links, optional ambient audio, PNG export
- **Seeds** — deterministic layouts (`mulberry32`)

### Science note

Geometry is a **2D rubber-sheet / surface analogy**, not a numerical relativity solver. Neighbor links stay Euclidean for performance. The goal is discovery: turn off the cursor field, place a well, and watch trails draw free-fall curves.

---

## Controls

| Input | Action |
|-------|--------|
| Move cursor | Shape the force field (Force layer) |
| Click / hold | Stronger force, or place / paint geometry |
| `G` | Toggle **Force** / **Geometry** layer |
| `1`–`6` | Force modes |
| `7`–`0` | Geometry tools (well · valleys · hills · erase) |
| `Shift`+click (Well tool) | Place a hill (negative mass) |
| `M` | Toggle metric grid |
| `X` | Clear geometry |
| Share (toolbar) | Copy experiment link |
| `Space` | Pause |
| `R` | Reset particles (geometry kept) |
| `C` | Clear trails |
| `N` | New seed |
| `E` | Export PNG |
| `T` | Ambient tone |
| `F` | Fullscreen |
| `H` / `?` | Help |
| `[` / `]` | Toggle side panels |

**Try this:** on the splash screen, choose **Run Rubber Sheet experiment**, or enter the field and follow the three-step coach.

---

## Share format

Experiment links use the URL hash (no backend):

```text
index.html#s=SEED&m=orbit&g=w:0.50,0.50,1.5,120&p=f:0.996,c:0,t:0.08,pal:aurora,gs:1,sg:0.75,n:1200
```

| Key | Meaning |
|-----|---------|
| `s` | Seed |
| `m` | Force mode |
| `g` | Wells as `w:nx,ny,mass,radius` (normalized 0–1 positions) |
| `p` | Params: friction, cursor on/off, trail, palette, geometry strength, surface G, count |

Paint is not encoded in share links yet. Wells cover most “look what I found” moments.

---

## Files

```text
index.html   App shell, panels, discovery coach, help
styles.css   Glass UI, layout, responsive panels
app.js       Particle engine, living metric, share links, audio
LICENSE      MIT
README.md    This file
```

---

## Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge). Requires Canvas 2D and ES2015+ JavaScript. Touch works for mobile; the densest panels are happiest on a tablet or desktop.

---

## Contributing

Issues and pull requests are welcome.

1. Keep the **zero-dependency / no-build** constraint unless there is a strong reason to change it.
2. Prefer small, focused changes with a clear playtest path.
3. Match the existing style: vanilla JS IIFE, typed arrays for particles, glass UI.

---

## Provenance

Started as a Grok 4.5 generative demo; evolved into a dual-layer physics playground (forces + living metric) with discovery and sharing.

---

## License

[MIT](./LICENSE) — use it, fork it, bend space with it.

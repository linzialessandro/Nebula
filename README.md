# Nebula

**A generative physics playground and educational relativity lab in pure HTML, CSS, and JavaScript.**

Push particles with forces. Bend space on a rubber sheet. Or switch to **Relativity** and watch Schwarzschild geodesics — massive orbits, light deflection, horizons, and a photon sphere.

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

## Two simulation modes

| Mode | Role | Physics |
|------|------|---------|
| **Playground** | Discovery toy | Cursor forces + 2D rubber-sheet height field (analogy) |
| **Relativity** | Educational lab | Geometric units \(G=c=1\); single-mass **Schwarzschild** geodesics; multi-mass **weak-field** |

Toggle with the top-bar control or press **`P`**.

### Playground

- **Force** — attract, repel, orbit, vortex, stars, paint
- **Geometry** — wells, painted hills/valleys, metric grid, optical-depth slowdown
- Geometry presets: Rubber Sheet, Binary Lens, Saddle, Gravity Wave, Horizon Garden

### Relativity lab

- **Massive particles** — timelike geodesics (conserved \(E\), \(L\) about a primary mass)
- **Photons** — null geodesics / weak-field ray bending
- **Horizon** \(r_s = 2M\) (solid ring) · **photon sphere** \(r = 3M\) (dashed)
- Color encodes \(\gamma\) / redshift factor
- HUD: mean \(\gamma\), \(\langle E \rangle\) error, photon count, model name
- Default ~250 tracers (clear orbits); links off; focus UI hides panels
- Presets: Circular orbits · Plunge · Light deflection · Photon sphere · Binary (weak)

**Not modeled:** full numerical relativity, dynamical spacetime, spin/Kerr (beyond a toy playground spin term), realistic multi-body strong-field GR.

---

## Controls

| Input | Action |
|-------|--------|
| **`P`** | Toggle **Playground** / **Relativity** |
| **`\`** | Focus UI (auto-hide panels for fullscreen orbits) |
| Move cursor | Force field (Playground) |
| Click / hold | Stronger force, or place geometry / mass |
| `G` | Toggle **Force** / **Geometry** layer |
| `1`–`6` | Force modes (Playground) |
| `7` | Place well / mass |
| `8`–`0` | Paint tools (Playground geometry) |
| `M` | Metric grid (Play) / equipotentials (Relativity) |
| `X` | Clear geometry |
| Share | Copy experiment link (`sim=` in hash) |
| `Space` | Pause |
| `R` | Reset particles / reseed geodesics |
| `C` | Clear trails |
| `N` | New seed |
| `E` | Export PNG |
| `T` | Ambient tone |
| `F` | Fullscreen |
| `H` / `?` | Help |
| `[` / `]` | Toggle side panels |

**Try this:** splash → **Open Relativity lab**, or **Run Rubber Sheet experiment**. In Relativity, try **Light deflection** then **Circular orbits**.

---

## Share format

Experiment links use the URL hash (no backend):

```text
index.html#s=SEED&sim=relativity&m=orbit&g=w:0.50,0.50,1.2,90,M28&p=f:1,c:0,t:0.045,pal:aurora,n:280,pf:0.2
```

| Key | Meaning |
|-----|---------|
| `s` | Seed |
| `sim` | `playground` or `relativity` |
| `m` | Force mode (playground) |
| `g` | Wells `w:nx,ny,mass,radius[,Mxx]` (normalized positions; optional geometric `M`) |
| `p` | Params: friction, cursor, trail, palette, geometry strength, surface G, count, photon fraction |

---

## Files

```text
index.html   App shell, panels, discovery coach, help
styles.css   Glass UI, mode visibility, focus UI
app.js       Playground engine + relativity geodesics, share links, audio
LICENSE      MIT
README.md    This file
```

---

## Science notes (Relativity mode)

- **Units:** geometric \(G = c = 1\). Length unit = screen pixel. Mass \(M\) is a length; \(r_s = 2M\).
- **Single mass:** equatorial Schwarzschild motion with conserved energy-at-infinity \(E\) and angular momentum \(L\). Coordinate-time steps with turning-point handling.
- **Circular orbits:** \(L^2 = M r^2 / (r - 3M)\), \(E^2 = (r-2M)^2 / [r(r-3M)]\) (stable for \(r > 6M\)).
- **Photons:** effective potential \(V = L^2(1-2M/r)/r^2\); critical impact \(b_c = 3\sqrt{3}\,M\).
- **Multi-mass:** weak-field \(\Phi = -\sum M_i/r_i\); massive particles use relativistic momentum \(p=\gamma v\); light bends with \(\approx 2\times\) Newtonian deflection. Labeled “Weak field” in the HUD.
- **Playground geometry** remains a **2D rubber-sheet analogy**, not a GR solver.

---

## Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge). Requires Canvas 2D and ES2015+ JavaScript. Relativity mode is happiest on a laptop or desktop fullscreen with focus UI (`\`).

---

## Contributing

Issues and pull requests are welcome.

1. Keep the **zero-dependency / no-build** constraint unless there is a strong reason to change it.
2. Prefer small, focused changes with a clear playtest path.
3. Match the existing style: vanilla JS IIFE, typed arrays for particles, glass UI.
4. Do not claim numerical-relativity accuracy for the educational lab.

---

## Provenance

Started as a Grok 4.5 generative demo; evolved into a dual-layer playground (forces + living metric), then a dual-mode app with an educational Schwarzschild / weak-field relativity lab.

---

## License

[MIT](./LICENSE) — use it, fork it, bend space with it.

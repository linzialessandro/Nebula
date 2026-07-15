# Nebula

**An interactive generative physics playground** — built in one shot by **Grok 4.5**.

No install. No build step. No API keys. Open `index.html` and shape a universe with your cursor.

![Free-tier friendly · zero dependencies · pure HTML/CSS/JS]

## Quick start

```bash
# Option A — just open it
open index.html

# Option B — local server (optional)
python3 -m http.server 8765
# then visit http://localhost:8765
```

## What it is

A real-time particle field with:

| Feature | Details |
|--------|---------|
| **6 force modes** | Attract, Repel, Orbit, Vortex, Stars (constellation), Paint |
| **6 palettes** | Aurora, Ember, Ocean, Mint, Mono, Neon |
| **Presets** | Big Bang, Galaxy, Meteor Rain, Still Pond |
| **Live parameters** | Count (200–4000), force, trail fade, size, friction |
| **Juice** | Bloom glow, neighbor links, spatial hash, FPS meter |
| **Audio** | Optional procedural ambient tone (Web Audio) |
| **Export** | PNG snapshot with seed watermark |
| **Seeds** | Deterministic layouts via mulberry32 PRNG |

## Controls

| Input | Action |
|-------|--------|
| Move cursor | Shape the force field |
| Click / hold | Stronger force |
| `1`–`6` | Switch modes |
| `Space` | Pause |
| `R` | Reset particles |
| `C` | Clear trails |
| `N` | New seed |
| `E` | Export PNG |
| `T` | Toggle ambient tone |
| `F` | Fullscreen |
| `H` / `?` | Help |
| `[` / `]` | Toggle side panels |

## Why this exists

A free-tier showcase for Grok 4.5: one session, finished software, polished UI, real physics, zero tooling friction. Open the file. Play.

## Files

```
index.html   structure + accessibility hooks
styles.css   glass UI, responsive panels, motion
app.js       particle engine, spatial hash, audio, export
README.md    you are here
```

## License

MIT — do whatever you want with it.

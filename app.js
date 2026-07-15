/**
 * Nebula — generative physics playground
 * Built in one shot by Grok 4.5
 *
 * Real-time particle field with multiple force modes, palettes,
 * presets, procedural audio, seed-based layout, and PNG export.
 * No build step. No dependencies. Open index.html.
 */

(() => {
  "use strict";

  // ─── Seeded PRNG (mulberry32) ───────────────────────────────────
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function randomSeed() {
    return Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0");
  }

  // ─── Palettes ───────────────────────────────────────────────────
  const PALETTES = {
    aurora: [
      [94, 234, 212],
      [167, 139, 250],
      [244, 114, 182],
      [125, 211, 252],
    ],
    ember: [
      [251, 191, 36],
      [249, 115, 22],
      [239, 68, 68],
      [252, 165, 165],
    ],
    ocean: [
      [34, 211, 238],
      [59, 130, 246],
      [99, 102, 241],
      [147, 197, 253],
    ],
    mint: [
      [74, 222, 128],
      [45, 212, 191],
      [56, 189, 248],
      [167, 243, 208],
    ],
    mono: [
      [248, 250, 252],
      [148, 163, 184],
      [100, 116, 139],
      [226, 232, 240],
    ],
    neon: [
      [240, 171, 252],
      [34, 211, 238],
      [163, 230, 53],
      [251, 113, 133],
    ],
  };

  const GLOW_COLORS = {
    aurora: ["rgba(167,139,250,0.45)", "rgba(94,234,212,0.35)"],
    ember: ["rgba(249,115,22,0.4)", "rgba(239,68,68,0.3)"],
    ocean: ["rgba(59,130,246,0.4)", "rgba(34,211,238,0.3)"],
    mint: ["rgba(45,212,191,0.4)", "rgba(74,222,128,0.3)"],
    mono: ["rgba(148,163,184,0.35)", "rgba(248,250,252,0.15)"],
    neon: ["rgba(240,171,252,0.4)", "rgba(34,211,238,0.35)"],
  };

  // ─── DOM ────────────────────────────────────────────────────────
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const els = {
    splash: document.getElementById("splash"),
    pauseOverlay: document.getElementById("pause-overlay"),
    helpModal: document.getElementById("help-modal"),
    toast: document.getElementById("toast"),
    seedDisplay: document.getElementById("seed-display"),
    statFps: document.getElementById("stat-fps"),
    statParticles: document.getElementById("stat-particles"),
    statLinks: document.getElementById("stat-links"),
    statMode: document.getElementById("stat-mode"),
    panelLeft: document.getElementById("panel-left"),
    panelRight: document.getElementById("panel-right"),
    glowA: document.querySelector(".glow-a"),
    glowB: document.querySelector(".glow-b"),
    valCount: document.getElementById("val-count"),
    valForce: document.getElementById("val-force"),
    valTrail: document.getElementById("val-trail"),
    valSize: document.getElementById("val-size"),
    valFriction: document.getElementById("val-friction"),
    btnSound: document.getElementById("btn-sound"),
  };

  // ─── State ──────────────────────────────────────────────────────
  const state = {
    seed: randomSeed(),
    rng: null,
    mode: "attract",
    palette: "aurora",
    count: 1200,
    force: 1.0,
    trail: 0.08,
    size: 1.6,
    friction: 0.985,
    links: true,
    bloom: true,
    cursorField: true,
    drift: false,
    paused: false,
    started: false,
    soundOn: false,
    width: 0,
    height: 0,
    dpr: 1,
    mouse: { x: 0, y: 0, px: 0, py: 0, down: false, inside: false },
    particles: null,
    // typed arrays for speed
    x: null,
    y: null,
    vx: null,
    vy: null,
    life: null,
    hue: null,
    linkCount: 0,
    fps: 0,
    frames: 0,
    lastFpsTime: 0,
    time: 0,
  };

  // Spatial hash for links
  const CELL = 48;
  let grid = new Map();

  // Audio
  let audioCtx = null;
  let masterGain = null;
  let oscA = null;
  let oscB = null;
  let lfo = null;

  // ─── Particle system ────────────────────────────────────────────
  function allocParticles(n) {
    state.count = n;
    state.x = new Float32Array(n);
    state.y = new Float32Array(n);
    state.vx = new Float32Array(n);
    state.vy = new Float32Array(n);
    state.life = new Float32Array(n);
    state.hue = new Uint8Array(n);
    els.statParticles.textContent = String(n);
  }

  function scatterParticles(preset = "default") {
    const { width: w, height: h, count: n } = state;
    const rng = state.rng;
    const cx = w / 2;
    const cy = h / 2;

    for (let i = 0; i < n; i++) {
      state.hue[i] = (rng() * 4) | 0;

      if (preset === "bigbang") {
        const a = rng() * Math.PI * 2;
        const r = rng() * 20;
        state.x[i] = cx + Math.cos(a) * r;
        state.y[i] = cy + Math.sin(a) * r;
        const sp = 2 + rng() * 8;
        state.vx[i] = Math.cos(a) * sp;
        state.vy[i] = Math.sin(a) * sp;
      } else if (preset === "galaxy") {
        const arm = (i % 3) * ((Math.PI * 2) / 3);
        const t = rng();
        const r = 40 + t * Math.min(w, h) * 0.38;
        const a = arm + t * 4.5 + (rng() - 0.5) * 0.4;
        state.x[i] = cx + Math.cos(a) * r;
        state.y[i] = cy + Math.sin(a) * r * 0.55;
        const tang = a + Math.PI / 2;
        const sp = 0.6 + (1 - t) * 1.4;
        state.vx[i] = Math.cos(tang) * sp;
        state.vy[i] = Math.sin(tang) * sp * 0.55;
      } else if (preset === "rain") {
        state.x[i] = rng() * w;
        state.y[i] = rng() * h * 0.3;
        state.vx[i] = (rng() - 0.5) * 0.5;
        state.vy[i] = 1 + rng() * 3;
      } else if (preset === "calm") {
        state.x[i] = rng() * w;
        state.y[i] = rng() * h;
        state.vx[i] = (rng() - 0.5) * 0.15;
        state.vy[i] = (rng() - 0.5) * 0.15;
      } else {
        state.x[i] = rng() * w;
        state.y[i] = rng() * h;
        state.vx[i] = (rng() - 0.5) * 1.2;
        state.vy[i] = (rng() - 0.5) * 1.2;
      }

      state.life[i] = 0.5 + rng() * 0.5;
    }
  }

  function setSeed(seed, preset = "default") {
    state.seed = seed;
    state.rng = mulberry32(hashString(seed));
    els.seedDisplay.textContent = seed;
    scatterParticles(preset);
  }

  // ─── Canvas sizing ──────────────────────────────────────────────
  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = state.width + "px";
    canvas.style.height = state.height + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    // fill base so trails have a dark ground
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, state.width, state.height);
  }

  // ─── Physics ────────────────────────────────────────────────────
  function applyForces(i, mx, my, strength, mode, t) {
    const dx = mx - state.x[i];
    const dy = my - state.y[i];
    const distSq = dx * dx + dy * dy + 40;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const falloff = strength / distSq;

    switch (mode) {
      case "attract": {
        const f = falloff * 1800 * state.force;
        state.vx[i] += nx * f;
        state.vy[i] += ny * f;
        break;
      }
      case "repel": {
        const f = falloff * 2200 * state.force;
        state.vx[i] -= nx * f;
        state.vy[i] -= ny * f;
        break;
      }
      case "orbit": {
        const tang = falloff * 2400 * state.force;
        state.vx[i] += -ny * tang + nx * falloff * 400 * state.force;
        state.vy[i] += nx * tang + ny * falloff * 400 * state.force;
        break;
      }
      case "vortex": {
        const spin = falloff * 2800 * state.force;
        const pull = falloff * 600 * state.force;
        state.vx[i] += -ny * spin + nx * pull;
        state.vy[i] += nx * spin + ny * pull;
        break;
      }
      case "constellation": {
        // gentle settle toward mouse, then slow
        const f = falloff * 900 * state.force;
        state.vx[i] += nx * f * 0.4;
        state.vy[i] += ny * f * 0.4;
        break;
      }
      case "paint": {
        if (state.mouse.down && dist < 120) {
          const pdx = mx - state.mouse.px;
          const pdy = my - state.mouse.py;
          const influence = (1 - dist / 120) * state.force * 0.35;
          state.vx[i] += pdx * influence;
          state.vy[i] += pdy * influence;
        }
        break;
      }
    }

    // soft auto-drift noise field
    if (state.drift) {
      const n1 = Math.sin(state.x[i] * 0.008 + t * 0.4) * Math.cos(state.y[i] * 0.007 - t * 0.3);
      const n2 = Math.cos(state.x[i] * 0.006 - t * 0.25) * Math.sin(state.y[i] * 0.009 + t * 0.35);
      state.vx[i] += n1 * 0.04;
      state.vy[i] += n2 * 0.04;
    }
  }

  function integrate() {
    const { count: n, width: w, height: h, friction, mode } = state;
    const mx = state.mouse.x;
    const my = state.mouse.y;
    const useCursor = state.cursorField && state.mouse.inside;
    const strength = state.mouse.down ? 2.2 : 1;
    const t = state.time;

    // rebuild spatial hash
    grid.clear();

    for (let i = 0; i < n; i++) {
      if (useCursor) {
        applyForces(i, mx, my, strength, mode, t);
      } else if (state.drift || mode === "constellation") {
        // still apply soft center pull for constellation without cursor
        if (mode === "constellation") {
          applyForces(i, w / 2, h / 2, 0.35, mode, t);
        } else if (state.drift) {
          applyForces(i, mx, my, 0, mode, t);
        }
      }

      state.vx[i] *= friction;
      state.vy[i] *= friction;

      // soft speed cap
      const sp = state.vx[i] * state.vx[i] + state.vy[i] * state.vy[i];
      if (sp > 100) {
        const s = 10 / Math.sqrt(sp);
        state.vx[i] *= s;
        state.vy[i] *= s;
      }

      state.x[i] += state.vx[i];
      state.y[i] += state.vy[i];

      // wrap edges (toroidal universe)
      if (state.x[i] < 0) state.x[i] += w;
      else if (state.x[i] >= w) state.x[i] -= w;
      if (state.y[i] < 0) state.y[i] += h;
      else if (state.y[i] >= h) state.y[i] -= h;

      if (state.links) {
        const cx = (state.x[i] / CELL) | 0;
        const cy = (state.y[i] / CELL) | 0;
        const key = cx + "," + cy;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(i);
      }
    }

    state.mouse.px = mx;
    state.mouse.py = my;
  }

  // ─── Render ─────────────────────────────────────────────────────
  function render() {
    const { width: w, height: h, count: n, size, trail, bloom, links, mode } = state;
    const colors = PALETTES[state.palette];

    // trail fade (motion blur style)
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(5, 5, 15, ${trail})`;
    ctx.fillRect(0, 0, w, h);

    // links
    let linkCount = 0;
    if (links) {
      const linkDist = mode === "constellation" ? 72 : 52;
      const linkDistSq = linkDist * linkDist;
      ctx.lineWidth = mode === "constellation" ? 0.7 : 0.45;
      ctx.globalCompositeOperation = bloom ? "lighter" : "source-over";

      for (const [key, bucket] of grid) {
        const [cx, cy] = key.split(",").map(Number);
        // neighbor cells
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const nKey = cx + ox + "," + (cy + oy);
            const other = grid.get(nKey);
            if (!other) continue;

            for (let a = 0; a < bucket.length; a++) {
              const i = bucket[a];
              // only check each pair once: when other is same cell, j > a; when other is different, always if key < nKey lexicographically… simplify: always check i < j
              const startJ = other === bucket ? a + 1 : 0;
              for (let b = startJ; b < other.length; b++) {
                const j = other[b];
                if (i >= j && other === bucket) continue;
                // avoid double-count across cells: only connect if i < j
                if (i >= j) continue;

                const dx = state.x[i] - state.x[j];
                const dy = state.y[i] - state.y[j];
                const d2 = dx * dx + dy * dy;
                if (d2 < linkDistSq && d2 > 0) {
                  const alpha = (1 - Math.sqrt(d2) / linkDist) * (mode === "constellation" ? 0.45 : 0.22);
                  const c = colors[state.hue[i] % colors.length];
                  ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
                  ctx.beginPath();
                  ctx.moveTo(state.x[i], state.y[i]);
                  ctx.lineTo(state.x[j], state.y[j]);
                  ctx.stroke();
                  linkCount++;
                  // budget: skip remaining if too many links this frame
                  if (linkCount > 3500) {
                    ox = 2;
                    oy = 2;
                    a = bucket.length;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
    state.linkCount = linkCount;

    // particles
    ctx.globalCompositeOperation = bloom ? "lighter" : "source-over";

    for (let i = 0; i < n; i++) {
      const c = colors[state.hue[i] % colors.length];
      const speed = Math.sqrt(state.vx[i] * state.vx[i] + state.vy[i] * state.vy[i]);
      const alpha = Math.min(0.95, 0.35 + speed * 0.12);
      const r = size * (0.7 + Math.min(speed * 0.15, 1.5));

      if (bloom && speed > 1.5) {
        const glow = r * 2.2;
        const g = ctx.createRadialGradient(state.x[i], state.y[i], 0, state.x[i], state.y[i], glow);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.35})`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(state.x[i], state.y[i], glow, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(state.x[i], state.y[i], r, 0, Math.PI * 2);
      ctx.fill();
    }

    // cursor field indicator
    if (state.cursorField && state.mouse.inside && !state.paused) {
      const pulse = 18 + Math.sin(state.time * 3) * 4 + (state.mouse.down ? 10 : 0);
      const c = colors[0];
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${state.mouse.down ? 0.45 : 0.2})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(state.mouse.x, state.mouse.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      if (state.mouse.down) {
        ctx.beginPath();
        ctx.arc(state.mouse.x, state.mouse.y, pulse * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.12)`;
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  // ─── Main loop ──────────────────────────────────────────────────
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!state.started) return;

    state.frames++;
    if (!state.lastFpsTime) state.lastFpsTime = ts;
    if (ts - state.lastFpsTime >= 500) {
      state.fps = Math.round((state.frames * 1000) / (ts - state.lastFpsTime));
      state.frames = 0;
      state.lastFpsTime = ts;
      els.statFps.textContent = String(state.fps);
      els.statLinks.textContent = String(state.linkCount);
    }

    if (state.paused) return;

    state.time = ts * 0.001;
    integrate();
    render();
    updateAudio();
  }

  // ─── Audio (procedural ambient) ─────────────────────────────────
  function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    oscA = audioCtx.createOscillator();
    oscB = audioCtx.createOscillator();
    lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    oscA.type = "sine";
    oscB.type = "triangle";
    lfo.type = "sine";
    oscA.frequency.value = 110;
    oscB.frequency.value = 164.81;
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 18;
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.7;

    lfo.connect(lfoGain);
    lfoGain.connect(oscA.frequency);
    lfoGain.connect(oscB.frequency);

    const gA = audioCtx.createGain();
    const gB = audioCtx.createGain();
    gA.gain.value = 0.12;
    gB.gain.value = 0.06;
    oscA.connect(gA);
    oscB.connect(gB);
    gA.connect(filter);
    gB.connect(filter);
    filter.connect(masterGain);

    oscA.start();
    oscB.start();
    lfo.start();
  }

  function setSound(on) {
    state.soundOn = on;
    els.btnSound.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      initAudio();
      if (audioCtx?.state === "suspended") audioCtx.resume();
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.22, audioCtx.currentTime + 0.8);
      }
      toast("Ambient tone on");
    } else if (masterGain && audioCtx) {
      masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
      toast("Ambient tone off");
    }
  }

  function updateAudio() {
    if (!state.soundOn || !audioCtx || !oscA) return;
    // map avg speed / mouse to gentle pitch drift
    let avg = 0;
    const sample = Math.min(80, state.count);
    for (let i = 0; i < sample; i++) {
      avg += Math.abs(state.vx[i]) + Math.abs(state.vy[i]);
    }
    avg /= sample;
    const base = 90 + avg * 8 + (state.mouse.down ? 20 : 0);
    oscA.frequency.setTargetAtTime(base, audioCtx.currentTime, 0.4);
    oscB.frequency.setTargetAtTime(base * 1.5, audioCtx.currentTime, 0.4);
  }

  // ─── UI helpers ─────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function setMode(mode) {
    state.mode = mode;
    els.statMode.textContent = mode;
    document.querySelectorAll(".mode-card").forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    toast(`Mode: ${mode}`);
  }

  function setPalette(name) {
    state.palette = name;
    document.querySelectorAll(".swatch").forEach((s) => {
      s.classList.toggle("active", s.dataset.palette === name);
    });
    const g = GLOW_COLORS[name] || GLOW_COLORS.aurora;
    if (els.glowA) els.glowA.style.background = `radial-gradient(circle, ${g[0]}, transparent 70%)`;
    if (els.glowB) els.glowB.style.background = `radial-gradient(circle, ${g[1]}, transparent 70%)`;
    toast(`Palette: ${name}`);
  }

  function applyPreset(name) {
    const configs = {
      bigbang: { mode: "repel", force: 1.4, trail: 0.06, friction: 0.992, drift: false },
      galaxy: { mode: "orbit", force: 0.8, trail: 0.05, friction: 0.99, drift: false },
      rain: { mode: "attract", force: 0.6, trail: 0.12, friction: 0.978, drift: true },
      calm: { mode: "constellation", force: 0.5, trail: 0.15, friction: 0.96, drift: true },
    };
    const c = configs[name];
    if (!c) return;

    setMode(c.mode);
    state.force = c.force;
    state.trail = c.trail;
    state.friction = c.friction;
    state.drift = c.drift;

    document.getElementById("ctrl-force").value = c.force;
    document.getElementById("ctrl-trail").value = c.trail;
    document.getElementById("ctrl-friction").value = c.friction;
    document.getElementById("ctrl-drift").checked = c.drift;
    els.valForce.textContent = c.force.toFixed(1);
    els.valTrail.textContent = c.trail.toFixed(2);
    els.valFriction.textContent = c.friction.toFixed(3);

    setSeed(state.seed, name);
    // hard clear for dramatic preset entrance
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, state.width, state.height);
    toast(`Preset: ${name}`);
  }

  function clearTrails() {
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, state.width, state.height);
    toast("Trails cleared");
  }

  function resetField() {
    setSeed(state.seed, "default");
    clearTrails();
    toast("Field reset");
  }

  function reseed() {
    setSeed(randomSeed(), "default");
    toast(`New seed ${state.seed}`);
  }

  function exportPng() {
    // composite onto opaque background for clean export
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ex = exportCanvas.getContext("2d");
    ex.fillStyle = "#05050f";
    ex.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ex.drawImage(canvas, 0, 0);

    // watermark
    ex.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ex.font = "12px JetBrains Mono, monospace";
    ex.fillStyle = "rgba(255,255,255,0.35)";
    ex.fillText(`Nebula · seed ${state.seed} · Grok 4.5`, 16, state.height - 16);

    const link = document.createElement("a");
    link.download = `nebula-${state.seed}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
    toast("Exported PNG");
  }

  function togglePause() {
    if (!state.started) return;
    state.paused = !state.paused;
    els.pauseOverlay.hidden = !state.paused;
    if (!state.paused) {
      // avoid jump after long pause
      state.lastFpsTime = 0;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  function showHelp(show) {
    els.helpModal.hidden = !show;
  }

  function enterField() {
    els.splash.classList.add("gone");
    state.paused = false;
    els.pauseOverlay.hidden = true;
    state.mouse.inside = true;
    toast("Move your cursor · click to push harder");
  }

  // ─── Events ─────────────────────────────────────────────────────
  function pointerPos(e) {
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e) {
    const p = pointerPos(e);
    state.mouse.x = p.x;
    state.mouse.y = p.y;
    state.mouse.inside = true;
  }

  function onPointerDown(e) {
    if (e.target.closest(".panel, .topbar, .hud, .modal, .splash, .overlay")) return;
    const p = pointerPos(e);
    state.mouse.x = p.x;
    state.mouse.y = p.y;
    state.mouse.px = p.x;
    state.mouse.py = p.y;
    state.mouse.down = true;
    state.mouse.inside = true;
  }

  function onPointerUp() {
    state.mouse.down = false;
  }

  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      onPointerMove(e);
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.target === canvas) e.preventDefault();
      onPointerDown(e);
    },
    { passive: false }
  );
  window.addEventListener("touchend", onPointerUp);
  canvas.addEventListener("mouseleave", () => {
    state.mouse.inside = false;
  });
  canvas.addEventListener("mouseenter", () => {
    state.mouse.inside = true;
  });

  window.addEventListener("resize", () => {
    const oldW = state.width;
    const oldH = state.height;
    resize();
    // rescale particle positions
    if (oldW && oldH && state.x) {
      const sx = state.width / oldW;
      const sy = state.height / oldH;
      for (let i = 0; i < state.count; i++) {
        state.x[i] *= sx;
        state.y[i] *= sy;
      }
    }
  });

  // Mode buttons
  document.querySelectorAll(".mode-card").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  // Palette
  document.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => setPalette(btn.dataset.palette));
  });

  // Presets
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  // Sliders
  const bindSlider = (id, key, valEl, fmt) => {
    const input = document.getElementById(id);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (key === "count") {
        const n = Math.round(v);
        allocParticles(n);
        scatterParticles("default");
        valEl.textContent = String(n);
      } else {
        state[key] = v;
        valEl.textContent = fmt(v);
      }
    });
  };

  bindSlider("ctrl-count", "count", els.valCount, (v) => String(Math.round(v)));
  bindSlider("ctrl-force", "force", els.valForce, (v) => v.toFixed(1));
  bindSlider("ctrl-trail", "trail", els.valTrail, (v) => v.toFixed(2));
  bindSlider("ctrl-size", "size", els.valSize, (v) => v.toFixed(1));
  bindSlider("ctrl-friction", "friction", els.valFriction, (v) => v.toFixed(3));

  // Toggles
  document.getElementById("ctrl-links").addEventListener("change", (e) => {
    state.links = e.target.checked;
  });
  document.getElementById("ctrl-bloom").addEventListener("change", (e) => {
    state.bloom = e.target.checked;
  });
  document.getElementById("ctrl-cursor").addEventListener("change", (e) => {
    state.cursorField = e.target.checked;
  });
  document.getElementById("ctrl-drift").addEventListener("change", (e) => {
    state.drift = e.target.checked;
  });

  // Buttons
  document.getElementById("btn-start").addEventListener("click", enterField);
  document.getElementById("btn-help-splash").addEventListener("click", () => showHelp(true));
  document.getElementById("btn-help").addEventListener("click", () => showHelp(true));
  document.getElementById("btn-reset").addEventListener("click", resetField);
  document.getElementById("btn-clear").addEventListener("click", clearTrails);
  document.getElementById("btn-reseed").addEventListener("click", reseed);
  document.getElementById("btn-export").addEventListener("click", exportPng);
  document.getElementById("btn-fullscreen").addEventListener("click", toggleFullscreen);
  document.getElementById("btn-sound").addEventListener("click", () => setSound(!state.soundOn));

  document.querySelectorAll("[data-close-help]").forEach((el) => {
    el.addEventListener("click", () => showHelp(false));
  });

  // Keyboard
  const MODE_KEYS = {
    "1": "attract",
    "2": "repel",
    "3": "orbit",
    "4": "vortex",
    "5": "constellation",
    "6": "paint",
  };

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;

    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (!els.splash.classList.contains("gone")) enterField();
      else togglePause();
      return;
    }

    if (e.key === "Escape") {
      if (!els.helpModal.hidden) showHelp(false);
      else if (state.paused) togglePause();
      return;
    }

    if (MODE_KEYS[e.key]) {
      setMode(MODE_KEYS[e.key]);
      return;
    }

    switch (e.key.toLowerCase()) {
      case "r":
        resetField();
        break;
      case "c":
        clearTrails();
        break;
      case "n":
        reseed();
        break;
      case "e":
        exportPng();
        break;
      case "t":
        setSound(!state.soundOn);
        break;
      case "f":
        toggleFullscreen();
        break;
      case "h":
      case "?":
        showHelp(els.helpModal.hidden);
        break;
      case "[":
        els.panelLeft.classList.toggle("hidden-left");
        break;
      case "]":
        els.panelRight.classList.toggle("hidden-right");
        break;
      case "enter":
        if (!els.splash.classList.contains("gone")) enterField();
        break;
    }
  });

  // ─── Boot ───────────────────────────────────────────────────────
  resize();
  allocParticles(state.count);
  setSeed(state.seed, "galaxy");
  state.mode = "orbit";
  els.statMode.textContent = "orbit";
  document.querySelectorAll(".mode-card").forEach((btn) => {
    const active = btn.dataset.mode === "orbit";
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", active ? "true" : "false");
  });
  state.cursorField = true;
  state.mouse.x = state.width * 0.5;
  state.mouse.y = state.height * 0.45;
  state.mouse.inside = true;
  state.started = true;
  requestAnimationFrame(frame);

  // Auto-demo: orbit the field while splash is visible
  let demoAngle = 0;
  const demoInterval = setInterval(() => {
    if (els.splash.classList.contains("gone")) {
      clearInterval(demoInterval);
      return;
    }
    demoAngle += 0.02;
    const cx = state.width / 2;
    const cy = state.height / 2;
    const rx = Math.min(state.width, state.height) * 0.22;
    state.mouse.x = cx + Math.cos(demoAngle) * rx;
    state.mouse.y = cy + Math.sin(demoAngle * 0.85) * rx * 0.7;
    state.mouse.inside = true;
  }, 16);
})();

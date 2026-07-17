/**
 * Nebula — generative physics playground
 *
 * Force fields + living metric (rubber-sheet geometry), discovery coach,
 * shareable experiment links, palettes, audio, and PNG export.
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

  // ─── Geometry state (living metric) ───────────────────────────
  // Height amplitude converts user-facing mass (~1) into pixel-scale
  // gradients so free particles actually curve on the rubber sheet.
  const GEO_AMP = 55;

  state.geometry = {
    enabled: true,           // master switch
    tool: "well",            // "well" | "paint-down" | "paint-up" | "erase" | "none"
    interaction: "force",    // "force" | "geometry" — what pointer does
    strength: 1.0,           // geodesic curvature scale
    surfaceG: 0.75,          // rubber-sheet "roll downhill" strength
    opticalDepth: 0.35,      // time-dilation-ish slowdown in wells
    showGrid: true,          // show metric grid overlay
    brushRadius: 48,
    brushStrength: 0.12,
    wellMass: 1.0,
    wellRadius: 90,
    maxWells: 16,
    wells: [],               // {x, y, mass, radius, spin}
    hasPaint: false,         // any non-zero paint on the height grid
    // grid
    gw: 0, gh: 0,            // grid dimensions (cells)
    cell: 0,                 // cell size in pixels
    h: null,                 // Float32Array gw*gh painted height
    // bake (dirty-driven)
    dirty: true,
    hBake: null,             // baked total height at grid resolution
    hxBake: null,            // ∂h/∂x at grid resolution
    hyBake: null,            // ∂h/∂y at grid resolution
    // optional cosmology
    hubble: 0,               // expansion rate; 0 = off
  };

  // ─── Geometry engine ────────────────────────────────────────────

  /** Allocate / reallocate the height grid to match canvas size */
  function initGeometryGrid(w, h) {
    const geo = state.geometry;
    const shortSide = Math.min(w, h);
    const GRID_TARGET = 96; // cells across shorter side
    geo.cell = Math.max(4, Math.floor(shortSide / GRID_TARGET));
    geo.gw = Math.ceil(w / geo.cell) + 1;
    geo.gh = Math.ceil(h / geo.cell) + 1;
    const total = geo.gw * geo.gh;
    // Preserve painted data if possible (simple reset for now)
    geo.h = new Float32Array(total);
    geo.hBake = new Float32Array(total);
    geo.hxBake = new Float32Array(total);
    geo.hyBake = new Float32Array(total);
    geo.dirty = true;
  }

  /** Clear all geometry (wells + painted height) */
  function clearGeometry() {
    const geo = state.geometry;
    geo.wells.length = 0;
    if (geo.h) geo.h.fill(0);
    geo.hasPaint = false;
    geo.dirty = true;
    geo.hubble = 0;
  }

  /** True if any wells or paint exist */
  function hasGeometryContent() {
    const geo = state.geometry;
    return geo.wells.length > 0 || geo.hasPaint;
  }

  /** Ensure bake is current (also safe to call from render while paused) */
  function ensureGeometryBaked() {
    if (state.geometry.enabled && state.geometry.dirty) {
      bakeGeometry();
    }
  }

  /**
   * Bake total height field = painted grid + analytic well Gaussians.
   * Also compute finite-difference gradients hx, hy at grid resolution.
   * Only called when dirty flag is set.
   */
  function bakeGeometry() {
    const geo = state.geometry;
    if (!geo.dirty || !geo.hBake) return;
    geo.dirty = false;

    const { gw, gh, cell, wells } = geo;
    const bake = geo.hBake;
    const hx = geo.hxBake;
    const hy = geo.hyBake;

    // Step 1: Copy painted grid as base
    for (let i = 0, len = gw * gh; i < len; i++) {
      bake[i] = geo.h[i];
    }

    // Step 2: Add analytic Gaussian wells
    for (let k = 0; k < wells.length; k++) {
      const well = wells[k];
      const wx = well.x;
      const wy = well.y;
      const mass = well.mass;
      const sigma = well.radius / 2.5; // radius ≈ 2.5σ visual edge
      const invTwoSigSq = 1 / (2 * sigma * sigma);

      // Only affect grid cells within ~3σ
      const reach = Math.ceil((sigma * 3) / cell);
      const gxc = wx / cell;
      const gyc = wy / cell;
      const gi0 = Math.max(0, Math.floor(gxc) - reach);
      const gi1 = Math.min(gw - 1, Math.ceil(gxc) + reach);
      const gj0 = Math.max(0, Math.floor(gyc) - reach);
      const gj1 = Math.min(gh - 1, Math.ceil(gyc) + reach);

      for (let gj = gj0; gj <= gj1; gj++) {
        for (let gi = gi0; gi <= gi1; gi++) {
          const px = gi * cell;
          const py = gj * cell;
          // Toroidal distance
          let dx = px - wx;
          let dy = py - wy;
          if (dx > state.width * 0.5) dx -= state.width;
          else if (dx < -state.width * 0.5) dx += state.width;
          if (dy > state.height * 0.5) dy -= state.height;
          else if (dy < -state.height * 0.5) dy += state.height;
          const rSq = dx * dx + dy * dy;
          // Wells are depressions: positive mass → h goes negative (GEO_AMP scales feel)
          bake[gj * gw + gi] += -mass * GEO_AMP * Math.exp(-rSq * invTwoSigSq);
        }
      }
    }

    // Step 3: Finite-difference gradients (with wrap)
    for (let gj = 0; gj < gh; gj++) {
      for (let gi = 0; gi < gw; gi++) {
        const idx = gj * gw + gi;
        // Wrap-aware neighbors
        const giL = gi > 0 ? gi - 1 : gw - 1;
        const giR = gi < gw - 1 ? gi + 1 : 0;
        const gjU = gj > 0 ? gj - 1 : gh - 1;
        const gjD = gj < gh - 1 ? gj + 1 : 0;
        // Central differences / cell
        hx[idx] = (bake[gj * gw + giR] - bake[gj * gw + giL]) / (2 * cell);
        hy[idx] = (bake[gjD * gw + gi] - bake[gjU * gw + gi]) / (2 * cell);
      }
    }
  }

  /**
   * Sample metric fields at (x,y) using bilinear interpolation of baked grid.
   * Returns { h, hx, hy, hxx, hxy, hyy } — all needed for geodesic step.
   * Toroidal-wrap aware.
   */
  function sampleMetric(px, py) {
    const geo = state.geometry;
    const { gw, gh, cell } = geo;
    const bake = geo.hBake;
    const hxB = geo.hxBake;
    const hyB = geo.hyBake;

    // Wrap coordinates
    let x = px % state.width;
    let y = py % state.height;
    if (x < 0) x += state.width;
    if (y < 0) y += state.height;

    // Grid coordinates (fractional)
    const gx = x / cell;
    const gy = y / cell;
    const gi = Math.floor(gx);
    const gj = Math.floor(gy);
    const fx = gx - gi;
    const fy = gy - gj;

    // Four corners with wrap (positive modulo — JS % is signed)
    const wrap = (i, n) => ((i % n) + n) % n;
    const i0 = wrap(gi, gw);
    const i1 = wrap(gi + 1, gw);
    const j0 = wrap(gj, gh);
    const j1 = wrap(gj + 1, gh);

    const idx00 = j0 * gw + i0;
    const idx10 = j0 * gw + i1;
    const idx01 = j1 * gw + i0;
    const idx11 = j1 * gw + i1;

    // Bilinear interpolation helper
    const bilerp = (arr) =>
      arr[idx00] * (1 - fx) * (1 - fy) +
      arr[idx10] * fx * (1 - fy) +
      arr[idx01] * (1 - fx) * fy +
      arr[idx11] * fx * fy;

    const h = bilerp(bake);
    const hxVal = bilerp(hxB);
    const hyVal = bilerp(hyB);

    // Second derivatives via finite differences of first derivatives
    const eps = cell * 0.5; // half-cell step
    // We can compute second derivatives from the baked grads directly
    // hxx ≈ (hx(i+1) - hx(i-1)) / (2*cell), etc.
    // For speed, use the 4-tap neighborhood
    const hx_R = hxB[j0 * gw + i1] * (1 - fy) + hxB[j1 * gw + i1] * fy;
    const hx_L = hxB[j0 * gw + i0] * (1 - fy) + hxB[j1 * gw + i0] * fy;
    const hy_D = hyB[j1 * gw + i0] * (1 - fx) + hyB[j1 * gw + i1] * fx;
    const hy_U = hyB[j0 * gw + i0] * (1 - fx) + hyB[j0 * gw + i1] * fx;

    const hxx = (hx_R - hx_L) / Math.max(cell, 1);
    const hyy = (hy_D - hy_U) / Math.max(cell, 1);

    // Cross derivative: ∂²h/∂x∂y
    const hx_D = hxB[j1 * gw + i0] * (1 - fx) + hxB[j1 * gw + i1] * fx;
    const hx_U = hxB[j0 * gw + i0] * (1 - fx) + hxB[j0 * gw + i1] * fx;
    const hxy = (hx_D - hx_U) / Math.max(cell, 1);

    return { h, hx: hxVal, hy: hyVal, hxx, hxy, hyy };
  }

  // ─── Analytic Gaussian gradients for wells (optional fast path) ─

  // ─── Geodesic motion ────────────────────────────────────────────

  /**
   * Apply geometry / metric deflection to particle i.
   * Geodesic curvature correction + rubber-sheet surface gravity.
   * Returns optical speed scale for the position step (time-dilation-ish).
   */
  function applyGeometry(i) {
    const geo = state.geometry;
    if (!geo.enabled || !geo.hBake) return 1;

    const m = sampleMetric(state.x[i], state.y[i]);
    const { h, hx, hy, hxx, hxy, hyy } = m;
    const vx = state.vx[i];
    const vy = state.vy[i];

    // Soft clamps keep FD noise and deep wells from exploding
    const cl = (v, lim) => (v > lim ? lim : v < -lim ? -lim : v);
    const hxC = cl(hx, 8);
    const hyC = cl(hy, 8);
    const hxxC = cl(hxx, 0.5);
    const hyyC = cl(hyy, 0.5);
    const hxyC = cl(hxy, 0.5);

    const gradSq = hxC * hxC + hyC * hyC;
    const denom = 1 + gradSq + 0.05;

    // Geodesic curvature: bends trajectories that cross height contours
    const vHv = hxxC * vx * vx + 2 * hxyC * vx * vy + hyyC * vy * vy;
    let ax = -geo.strength * vHv * hxC / denom;
    let ay = -geo.strength * vHv * hyC / denom;

    // Rubber-sheet gravity: free particles roll downhill (−∇h)
    const sG = geo.surfaceG;
    ax += -sG * hxC / denom;
    ay += -sG * hyC / denom;

    // Soft frame-drag from spinning wells (stretch goal — cheap & visible)
    const wells = geo.wells;
    for (let k = 0; k < wells.length; k++) {
      const w = wells[k];
      if (!w.spin) continue;
      let dx = state.x[i] - w.x;
      let dy = state.y[i] - w.y;
      if (dx > state.width * 0.5) dx -= state.width;
      else if (dx < -state.width * 0.5) dx += state.width;
      if (dy > state.height * 0.5) dy -= state.height;
      else if (dy < -state.height * 0.5) dy += state.height;
      const rSq = dx * dx + dy * dy + 40;
      const fall = w.spin * w.mass * GEO_AMP * 0.0004 / rSq;
      ax += -dy * fall;
      ay += dx * fall;
    }

    const maxGeoAccel = 5.5;
    const aMagSq = ax * ax + ay * ay;
    if (aMagSq > maxGeoAccel * maxGeoAccel) {
      const scale = maxGeoAccel / Math.sqrt(aMagSq);
      ax *= scale;
      ay *= scale;
    }

    state.vx[i] += ax;
    state.vy[i] += ay;

    // Optical depth: slow proper motion deep in wells (h < 0)
    const depth = Math.max(0, -h / GEO_AMP);
    return 1 / (1 + geo.opticalDepth * depth);
  }

  // ─── Geometry authoring ─────────────────────────────────────────

  /** Place a gravity well at (x,y). Pass quiet=true to suppress toast (presets). */
  function placeWell(x, y, mass, radius, spin, quiet) {
    const geo = state.geometry;
    if (geo.wells.length >= geo.maxWells) {
      geo.wells.shift();
    }
    geo.wells.push({
      x: x,
      y: y,
      mass: mass != null ? mass : geo.wellMass,
      radius: radius != null ? radius : geo.wellRadius,
      spin: spin || 0,
    });
    geo.dirty = true;
    if (!quiet) toast(`Well placed (${geo.wells.length}/${geo.maxWells})`);
  }

  /**
   * Paint geometry: add/subtract height at (px,py) within brush radius.
   * sign: +1 = hill, -1 = valley/well, 0 = erase toward zero
   * Erase also removes analytic wells whose centers fall under the brush.
   */
  function paintGeometry(px, py, sign) {
    const geo = state.geometry;
    if (!geo.h) return;
    const { gw, gh, cell, brushRadius, brushStrength } = geo;
    const reach = Math.ceil(brushRadius / cell);
    const gxc = px / cell;
    const gyc = py / cell;
    const gi0 = Math.max(0, Math.floor(gxc) - reach);
    const gi1 = Math.min(gw - 1, Math.ceil(gxc) + reach);
    const gj0 = Math.max(0, Math.floor(gyc) - reach);
    const gj1 = Math.min(gh - 1, Math.ceil(gyc) + reach);
    const brSq = brushRadius * brushRadius;

    // Paint heights share units with well bake (GEO_AMP * mass scale)
    const paintAmp = GEO_AMP * 0.22;

    for (let gj = gj0; gj <= gj1; gj++) {
      for (let gi = gi0; gi <= gi1; gi++) {
        const dx = gi * cell - px;
        const dy = gj * cell - py;
        const dSq = dx * dx + dy * dy;
        if (dSq > brSq) continue;
        const falloff = 1 - Math.sqrt(dSq) / brushRadius;
        const idx = gj * gw + gi;
        if (sign === 0) {
          geo.h[idx] *= 1 - falloff * brushStrength * 2.5;
          if (Math.abs(geo.h[idx]) < 1e-4) geo.h[idx] = 0;
        } else {
          geo.h[idx] += sign * brushStrength * falloff * paintAmp;
        }
      }
    }

    if (sign === 0) {
      // Remove wells under the eraser
      const before = geo.wells.length;
      geo.wells = geo.wells.filter((w) => {
        let dx = w.x - px;
        let dy = w.y - py;
        if (dx > state.width * 0.5) dx -= state.width;
        else if (dx < -state.width * 0.5) dx += state.width;
        if (dy > state.height * 0.5) dy -= state.height;
        else if (dy < -state.height * 0.5) dy += state.height;
        return dx * dx + dy * dy > brSq * 0.35;
      });
      if (geo.wells.length !== before) {
        // keep going; toast only on full clear via button
      }
    }

    geo.hasPaint = true;
    geo.dirty = true;
  }

  /** Set the interaction layer: "force" or "geometry" */
  function setInteractionLayer(layer, quiet) {
    state.geometry.interaction = layer;
    document.querySelectorAll(".layer-btn").forEach((btn) => {
      const on = btn.dataset.layer === layer;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    // Geometry layer owns the pointer — forces stay off while editing space
    if (layer === "geometry") {
      canvas.style.cursor = "cell";
    } else {
      canvas.style.cursor = "crosshair";
    }
    updateHudHint();
    if (!quiet) toast(layer === "geometry" ? "Geometry layer — sculpt space" : "Force layer — push particles");
  }

  function updateHudHint() {
    const hint = document.getElementById("hud-hint");
    if (!hint) return;
    if (state.geometry.interaction === "geometry") {
      hint.innerHTML =
        "<kbd>Click</kbd> place / paint space · <kbd>G</kbd> back to force · <kbd>M</kbd> grid · <kbd>?</kbd> help";
    } else {
      hint.innerHTML =
        "<kbd>G</kbd> geometry · <kbd>1</kbd>–<kbd>6</kbd> modes · move cursor to push · <kbd>?</kbd> help";
    }
  }

  /** Set the active geometry tool (also switches to geometry layer) */
  function setGeometryTool(tool, quiet) {
    state.geometry.tool = tool;
    document.querySelectorAll(".geo-tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.geotool === tool);
    });
    if (state.geometry.interaction !== "geometry") {
      setInteractionLayer("geometry", true);
    }
    if (!quiet) {
      const labels = {
        well: "Well",
        "paint-down": "Paint valleys",
        "paint-up": "Paint hills",
        erase: "Erase",
      };
      toast(`Tool: ${labels[tool] || tool}`);
    }
  }

  /** Apply a geometry preset */
  function applyGeometryPreset(name) {
    const geo = state.geometry;
    clearGeometry();
    const cx = state.width / 2;
    const cy = state.height / 2;
    const r = Math.min(state.width, state.height);

    switch (name) {
      case "rubber-sheet": {
        // One central well, low friction, cursor field off
        placeWell(cx, cy, 1.5, r * 0.18, 0, true);
        state.cursorField = false;
        document.getElementById("ctrl-cursor").checked = false;
        state.friction = 0.996;
        document.getElementById("ctrl-friction").value = 0.996;
        els.valFriction.textContent = "0.996";
        // Mild tangential velocity so trails form orbits
        for (let i = 0; i < state.count; i++) {
          const dx = state.x[i] - cx;
          const dy = state.y[i] - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const speed = 1.1 + state.rng() * 0.7;
          state.vx[i] = -dy / dist * speed;
          state.vy[i] = dx / dist * speed;
        }
        break;
      }
      case "binary-lens": {
        const sep = r * 0.15;
        placeWell(cx - sep, cy, 1.2, r * 0.12, 0, true);
        placeWell(cx + sep, cy, 1.2, r * 0.12, 0, true);
        state.cursorField = false;
        document.getElementById("ctrl-cursor").checked = false;
        state.friction = 0.994;
        document.getElementById("ctrl-friction").value = 0.994;
        els.valFriction.textContent = "0.994";
        for (let i = 0; i < state.count; i++) {
          const angle = state.rng() * Math.PI * 2;
          const sp = 0.6 + state.rng() * 1.2;
          state.vx[i] = Math.cos(angle) * sp;
          state.vy[i] = Math.sin(angle) * sp;
        }
        break;
      }
      case "saddle": {
        const sep = r * 0.12;
        placeWell(cx - sep, cy, 1.5, r * 0.14, 0, true);  // well
        placeWell(cx + sep, cy, -1.5, r * 0.14, 0, true); // hill
        state.cursorField = false;
        document.getElementById("ctrl-cursor").checked = false;
        state.friction = 0.992;
        document.getElementById("ctrl-friction").value = 0.992;
        els.valFriction.textContent = "0.992";
        for (let i = 0; i < state.count; i++) {
          state.vx[i] = 0.4 + state.rng() * 0.8;
          state.vy[i] = (state.rng() - 0.5) * 0.6;
        }
        break;
      }
      case "gravity-wave": {
        // Sinusoidal painted ridges (pre-GEO_AMP paint units)
        const { gw: gw2, gh: gh2, cell: c } = geo;
        const freq = 4 * Math.PI / state.width;
        const amp = GEO_AMP * 0.35;
        for (let gj = 0; gj < gh2; gj++) {
          for (let gi = 0; gi < gw2; gi++) {
            const px = gi * c;
            geo.h[gj * gw2 + gi] = amp * Math.sin(px * freq);
          }
        }
        geo.hasPaint = true;
        geo.dirty = true;
        state.cursorField = false;
        document.getElementById("ctrl-cursor").checked = false;
        state.friction = 0.993;
        document.getElementById("ctrl-friction").value = 0.993;
        els.valFriction.textContent = "0.993";
        break;
      }
      case "horizon-garden": {
        // Deep well + high optical depth
        placeWell(cx, cy, 3.0, r * 0.15, 0, true);
        geo.opticalDepth = 0.8;
        document.getElementById("ctrl-optical-depth").value = 0.8;
        document.getElementById("val-optical-depth").textContent = "0.80";
        state.cursorField = false;
        document.getElementById("ctrl-cursor").checked = false;
        state.friction = 0.998;
        document.getElementById("ctrl-friction").value = 0.998;
        els.valFriction.textContent = "0.998";
        // Give particles scattered initial velocities
        for (let i = 0; i < state.count; i++) {
          const angle = state.rng() * Math.PI * 2;
          const sp = 0.5 + state.rng() * 2;
          state.vx[i] = Math.cos(angle) * sp;
          state.vy[i] = Math.sin(angle) * sp;
        }
        break;
      }
    }

    // Clear trails for clean preset entrance
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, state.width, state.height);
    geo.showGrid = true;
    document.getElementById("ctrl-show-grid").checked = true;
    setInteractionLayer("force", true); // observe free motion after sculpting
    geo.enabled = true;
    document.getElementById("ctrl-geo-enabled").checked = true;
    ensureGeometryBaked();
    toast(`Geometry: ${name.replace(/-/g, " ")}`);
  }

  // ─── Metric visualization ──────────────────────────────────────

  /** Draw the warped coordinate grid overlay */
  function drawMetricGrid(ctx2d) {
    const geo = state.geometry;
    if (!geo.showGrid || !geo.enabled || !hasGeometryContent()) return;
    if (state.fps > 0 && state.fps < 28) return; // degrade under load
    ensureGeometryBaked();
    if (!geo.hBake) return;

    const w = state.width;
    const h = state.height;
    const colors = PALETTES[state.palette];
    const c = colors[2] || colors[0];

    // Grid lines: ~20 lines per axis; denser sampling along each line
    const spacing = Math.max(48, Math.min(w, h) / 18);
    // ∇h is O(1) after GEO_AMP; warp in pixels
    const warpScale = 10;

    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    ctx2d.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.14)`;
    ctx2d.lineWidth = 0.65;

    const step = spacing * 0.45;

    // Horizontal lines
    for (let row = spacing * 0.5; row < h; row += spacing) {
      ctx2d.beginPath();
      let first = true;
      for (let col = 0; col <= w; col += step) {
        const m = sampleMetric(col, row);
        const dx = m.hx * warpScale;
        const dy = m.hy * warpScale;
        if (first) {
          ctx2d.moveTo(col + dx, row + dy);
          first = false;
        } else {
          ctx2d.lineTo(col + dx, row + dy);
        }
      }
      ctx2d.stroke();
    }

    // Vertical lines
    for (let col = spacing * 0.5; col < w; col += spacing) {
      ctx2d.beginPath();
      let first = true;
      for (let row = 0; row <= h; row += step) {
        const m = sampleMetric(col, row);
        const dx = m.hx * warpScale;
        const dy = m.hy * warpScale;
        if (first) {
          ctx2d.moveTo(col + dx, row + dy);
          first = false;
        } else {
          ctx2d.lineTo(col + dx, row + dy);
        }
      }
      ctx2d.stroke();
    }

    ctx2d.restore();
  }

  /** Draw well glyphs (rings + glow at well centers) */
  function drawWells(ctx2d) {
    const geo = state.geometry;
    if (!geo.enabled) return;
    const wells = geo.wells;
    if (wells.length === 0) return;

    const colors = PALETTES[state.palette];
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";

    for (let k = 0; k < wells.length; k++) {
      const w = wells[k];
      const isHill = w.mass < 0;
      const c = isHill ? colors[3] || colors[0] : colors[1] || colors[0];
      const absM = Math.abs(w.mass);
      const alpha = Math.min(0.6, 0.15 + absM * 0.15);

      // Glow
      const glowR = w.radius * 0.6;
      const grad = ctx2d.createRadialGradient(w.x, w.y, 0, w.x, w.y, glowR);
      grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.5})`);
      grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.arc(w.x, w.y, glowR, 0, Math.PI * 2);
      ctx2d.fill();

      // Ring(s)
      ctx2d.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.6})`;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.arc(w.x, w.y, w.radius * 0.4, 0, Math.PI * 2);
      ctx2d.stroke();

      if (absM > 0.8) {
        ctx2d.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.3})`;
        ctx2d.beginPath();
        ctx2d.arc(w.x, w.y, w.radius * 0.7, 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }

    ctx2d.restore();
  }

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
    // Init / resize geometry height grid (paint is reset; wells stay in place)
    initGeometryGrid(state.width, state.height);
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
    const geo = state.geometry;
    // While sculpting space, the cursor is a geometry tool — not a force field
    const forceLayer = geo.interaction === "force";
    const useCursor = forceLayer && state.cursorField && state.mouse.inside;
    const strength = state.mouse.down ? 2.2 : 1;
    const t = state.time;

    ensureGeometryBaked();

    // Hubble expansion (optional cosmological term)
    const useHubble = geo.enabled && geo.hubble > 0;
    const hCx = w / 2;
    const hCy = h / 2;
    const geoActive = geo.enabled && geo.hBake && hasGeometryContent();

    // rebuild spatial hash
    grid.clear();

    for (let i = 0; i < n; i++) {
      // 1. Forces — only on the force interaction layer
      if (useCursor) {
        applyForces(i, mx, my, strength, mode, t);
      } else if (forceLayer && (state.drift || mode === "constellation")) {
        if (mode === "constellation") {
          applyForces(i, w / 2, h / 2, 0.35, mode, t);
        } else if (state.drift) {
          applyForces(i, mx, my, 0, mode, t);
        }
      }

      // 2. Geometry step (metric / geodesic) — independent of cursor field
      let speedScale = 1;
      if (geoActive) {
        speedScale = applyGeometry(i);
      }

      // 3. Friction
      state.vx[i] *= friction;
      state.vy[i] *= friction;

      // Soft speed cap
      const sp = state.vx[i] * state.vx[i] + state.vy[i] * state.vy[i];
      if (sp > 100) {
        const s = 10 / Math.sqrt(sp);
        state.vx[i] *= s;
        state.vy[i] *= s;
      }

      // 4. Position step (optical depth applied once, from applyGeometry)
      state.x[i] += state.vx[i] * speedScale;
      state.y[i] += state.vy[i] * speedScale;

      // Hubble expansion
      if (useHubble) {
        state.x[i] = hCx + (state.x[i] - hCx) * (1 + geo.hubble * 0.001);
        state.y[i] = hCy + (state.y[i] - hCy) * (1 + geo.hubble * 0.001);
      }

      // 5. Wrap edges (toroidal universe)
      if (state.x[i] < 0) state.x[i] += w;
      else if (state.x[i] >= w) state.x[i] -= w;
      if (state.y[i] < 0) state.y[i] += h;
      else if (state.y[i] >= h) state.y[i] -= h;

      // 6. Spatial hash for links
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

    // Metric grid overlay (drawn after trail fade, before particles)
    drawMetricGrid(ctx);
    drawWells(ctx);

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

    // cursor / tool indicator
    if (state.mouse.inside && !state.paused) {
      const geo = state.geometry;
      const c = colors[0];
      ctx.globalCompositeOperation = "lighter";

      if (geo.interaction === "geometry") {
        // Geometry brush / well ghost
        const r =
          geo.tool === "well"
            ? geo.wellRadius * 0.4
            : geo.brushRadius;
        const alpha = state.mouse.down ? 0.4 : 0.18;
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
        ctx.lineWidth = 1.1;
        ctx.setLineDash(geo.tool === "erase" ? [4, 4] : []);
        ctx.beginPath();
        ctx.arc(state.mouse.x, state.mouse.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (geo.tool === "well") {
          ctx.beginPath();
          ctx.arc(state.mouse.x, state.mouse.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
          ctx.fill();
        }
      } else if (state.cursorField) {
        const pulse = 18 + Math.sin(state.time * 3) * 4 + (state.mouse.down ? 10 : 0);
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

    // Keep drawing while paused so geometry edits / grid stay visible
    if (!state.paused) {
      state.time = ts * 0.001;
      integrate();
      updateAudio();
    }
    render();
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

  function setMode(mode, quiet) {
    state.mode = mode;
    els.statMode.textContent = mode;
    document.querySelectorAll(".mode-card").forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (!quiet) toast(`Mode: ${mode}`);
  }

  function setPalette(name, quiet) {
    state.palette = name;
    document.querySelectorAll(".swatch").forEach((s) => {
      s.classList.toggle("active", s.dataset.palette === name);
    });
    const g = GLOW_COLORS[name] || GLOW_COLORS.aurora;
    if (els.glowA) els.glowA.style.background = `radial-gradient(circle, ${g[0]}, transparent 70%)`;
    if (els.glowB) els.glowB.style.background = `radial-gradient(circle, ${g[1]}, transparent 70%)`;
    if (!quiet) toast(`Palette: ${name}`);
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

  function clearTrails(quiet) {
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, state.width, state.height);
    if (!quiet) toast("Trails cleared");
  }

  /** Rescatter particles only — geometry stays */
  function resetField() {
    setSeed(state.seed, "default");
    clearTrails();
    toast("Particles reset");
  }

  /** Full universe reset: particles + geometry */
  function resetUniverse() {
    clearGeometry();
    setSeed(state.seed, "default");
    clearTrails();
    toast("Universe reset");
  }

  function reseed() {
    setSeed(randomSeed(), "default");
    toast(`New seed ${state.seed}`);
  }

  // ─── Shareable experiment links ─────────────────────────────────
  /**
   * Encode seed + mode + wells + key params into location hash.
   * Format: #s=SEED&m=MODE&g=w:nx,ny,mass,r;...&p=f:FRIC,c:0|1,t:TRAIL,pal:NAME,gs:STR
   */
  function encodeExperimentHash() {
    const parts = [];
    parts.push("s=" + encodeURIComponent(state.seed));
    parts.push("m=" + encodeURIComponent(state.mode));
    const w = state.width || 1;
    const h = state.height || 1;
    const wells = state.geometry.wells;
    if (wells.length) {
      const g = wells
        .map((well) => {
          const nx = (well.x / w).toFixed(4);
          const ny = (well.y / h).toFixed(4);
          return `w:${nx},${ny},${well.mass},${Math.round(well.radius)}`;
        })
        .join(";");
      parts.push("g=" + encodeURIComponent(g));
    }
    const p = [
      "f:" + state.friction,
      "c:" + (state.cursorField ? 1 : 0),
      "t:" + state.trail,
      "pal:" + state.palette,
      "gs:" + state.geometry.strength,
      "sg:" + state.geometry.surfaceG,
      "n:" + state.count,
    ].join(",");
    parts.push("p=" + encodeURIComponent(p));
    return "#" + parts.join("&");
  }

  function buildShareUrl() {
    const base = location.href.split("#")[0];
    return base + encodeExperimentHash();
  }

  function copyShareLink() {
    const url = buildShareUrl();
    const done = () => {
      try {
        history.replaceState(null, "", encodeExperimentHash());
      } catch (_) {}
      toast("Experiment link copied");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {
        window.prompt("Copy experiment link:", url);
        done();
      });
    } else {
      window.prompt("Copy experiment link:", url);
      done();
    }
  }

  /**
   * Apply experiment from URL hash. Returns true if a hash was consumed.
   */
  function applyExperimentFromHash() {
    const raw = location.hash.replace(/^#/, "").trim();
    if (!raw || !raw.includes("=")) return false;

    const params = {};
    raw.split("&").forEach((pair) => {
      const i = pair.indexOf("=");
      if (i < 0) return;
      params[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
    });

    if (params.s) {
      setSeed(params.s, "default");
    }
    if (params.m) {
      const known = ["attract", "repel", "orbit", "vortex", "constellation", "paint"];
      if (known.includes(params.m)) setMode(params.m, true);
    }

    if (params.p) {
      params.p.split(",").forEach((bit) => {
        const [k, v] = bit.split(":");
        if (k === "f" && v != null) {
          state.friction = parseFloat(v);
          const el = document.getElementById("ctrl-friction");
          if (el) el.value = state.friction;
          els.valFriction.textContent = state.friction.toFixed(3);
        } else if (k === "c" && v != null) {
          state.cursorField = v === "1";
          const el = document.getElementById("ctrl-cursor");
          if (el) el.checked = state.cursorField;
        } else if (k === "t" && v != null) {
          state.trail = parseFloat(v);
          const el = document.getElementById("ctrl-trail");
          if (el) el.value = state.trail;
          els.valTrail.textContent = state.trail.toFixed(2);
        } else if (k === "pal" && v && PALETTES[v]) {
          setPalette(v, true);
        } else if (k === "gs" && v != null) {
          state.geometry.strength = parseFloat(v);
          const el = document.getElementById("ctrl-geo-strength");
          if (el) el.value = state.geometry.strength;
          const val = document.getElementById("val-geo-strength");
          if (val) val.textContent = state.geometry.strength.toFixed(1);
        } else if (k === "sg" && v != null) {
          state.geometry.surfaceG = parseFloat(v);
          const el = document.getElementById("ctrl-surface-g");
          if (el) el.value = state.geometry.surfaceG;
          const val = document.getElementById("val-surface-g");
          if (val) val.textContent = state.geometry.surfaceG.toFixed(2);
        } else if (k === "n" && v != null) {
          const n = Math.max(200, Math.min(4000, Math.round(parseFloat(v))));
          if (n !== state.count) {
            allocParticles(n);
            scatterParticles("default");
            const el = document.getElementById("ctrl-count");
            if (el) el.value = n;
            els.valCount.textContent = String(n);
          }
        }
      });
    }

    if (params.g) {
      clearGeometry();
      const w = state.width;
      const h = state.height;
      params.g.split(";").forEach((token) => {
        if (!token.startsWith("w:")) return;
        const nums = token.slice(2).split(",").map(parseFloat);
        if (nums.length < 4 || nums.some((x) => Number.isNaN(x))) return;
        placeWell(nums[0] * w, nums[1] * h, nums[2], nums[3], 0, true);
      });
      ensureGeometryBaked();
    }

    return true;
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
    const wellN = state.geometry.wells.length;
    const geoNote = wellN ? ` · ${wellN} well${wellN === 1 ? "" : "s"}` : "";
    ex.fillText(`Nebula · seed ${state.seed}${geoNote}`, 16, state.height - 16);

    const link = document.createElement("a");
    link.download = `nebula-${state.seed}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
    toast("Exported PNG");
  }

  // ─── First-run discovery coach ──────────────────────────────────
  const DISCOVERY_KEY = "nebula_discovery_v1";
  const discoverySteps = [
    {
      step: "1 / 3",
      title: "Forces push particles",
      body: "Move your cursor — the field follows you. Click or hold for a stronger push. This is the Force layer.",
      enter() {
        setInteractionLayer("force", true);
        state.cursorField = true;
        document.getElementById("ctrl-cursor").checked = true;
      },
    },
    {
      step: "2 / 3",
      title: "Space itself can bend",
      body: "Cursor field is off. A well reshapes the rubber sheet — particles fall free without your push. Watch the trails.",
      enter() {
        setInteractionLayer("force", true);
        state.cursorField = false;
        document.getElementById("ctrl-cursor").checked = false;
        clearGeometry();
        const cx = state.width / 2;
        const cy = state.height / 2;
        const r = Math.min(state.width, state.height);
        placeWell(cx, cy, 1.6, r * 0.16, 0, true);
        ensureGeometryBaked();
        state.geometry.showGrid = true;
        document.getElementById("ctrl-show-grid").checked = true;
        // mild tangential seed so geodesics read immediately
        for (let i = 0; i < state.count; i++) {
          const dx = state.x[i] - cx;
          const dy = state.y[i] - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const speed = 1.0 + (state.rng ? state.rng() : Math.random()) * 0.6;
          state.vx[i] = (-dy / dist) * speed;
          state.vy[i] = (dx / dist) * speed;
        }
        clearTrails(true);
      },
    },
    {
      step: "3 / 3",
      title: "Invent experiments",
      body: "Press G to sculpt space, try Rubber Sheet, or copy a share link. Trails are your lab notebook.",
      enter() {
        setInteractionLayer("force", true);
      },
    },
  ];
  let discoveryIndex = 0;

  function discoverySeen() {
    try {
      return localStorage.getItem(DISCOVERY_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markDiscoverySeen() {
    try {
      localStorage.setItem(DISCOVERY_KEY, "1");
    } catch (_) {}
  }

  function showDiscoveryStep(i) {
    const el = document.getElementById("discovery");
    if (!el) return;
    discoveryIndex = i;
    const s = discoverySteps[i];
    if (!s) {
      endDiscovery();
      return;
    }
    document.getElementById("discovery-step").textContent = s.step;
    document.getElementById("discovery-title").textContent = s.title;
    document.getElementById("discovery-body").textContent = s.body;
    document.getElementById("btn-discovery-next").textContent =
      i >= discoverySteps.length - 1 ? "Start exploring" : "Next";
    el.hidden = false;
    if (s.enter) s.enter();
  }

  function endDiscovery() {
    const el = document.getElementById("discovery");
    if (el) el.hidden = true;
    markDiscoverySeen();
    updateHudHint();
  }

  function startDiscoveryIfNeeded(force) {
    if (!force && discoverySeen()) return;
    // If URL brought a shared experiment, skip coach
    if (!force && location.hash.includes("s=")) {
      markDiscoverySeen();
      return;
    }
    showDiscoveryStep(0);
  }

  function enterWithRubberSheet() {
    els.splash.classList.add("gone");
    state.paused = false;
    els.pauseOverlay.hidden = true;
    state.mouse.inside = true;
    markDiscoverySeen();
    applyGeometryPreset("rubber-sheet");
    updateHudHint();
    toast("Rubber Sheet — free-fall on curved space");
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
    updateHudHint();
    if (!discoverySeen() && !location.hash.includes("s=")) {
      startDiscoveryIfNeeded(true);
    } else {
      toast("Force pushes · Geometry bends space · press G to switch");
    }
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
    // Geometry painting while dragging
    if (state.mouse.down && state.geometry.interaction === "geometry") {
      const tool = state.geometry.tool;
      if (tool === "paint-down") {
        paintGeometry(p.x, p.y, -1);
      } else if (tool === "paint-up") {
        paintGeometry(p.x, p.y, 1);
      } else if (tool === "erase") {
        paintGeometry(p.x, p.y, 0);
      }
    }
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

    // Geometry tool actions on click
    if (state.geometry.interaction === "geometry") {
      const tool = state.geometry.tool;
      if (tool === "well") {
        const mass = e.shiftKey ? -state.geometry.wellMass : state.geometry.wellMass;
        placeWell(p.x, p.y, mass, state.geometry.wellRadius, 0);
      } else if (tool === "paint-down") {
        paintGeometry(p.x, p.y, -1);
      } else if (tool === "paint-up") {
        paintGeometry(p.x, p.y, 1);
      } else if (tool === "erase") {
        paintGeometry(p.x, p.y, 0);
      }
    }
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
    // rescale particle positions and well anchors
    if (oldW && oldH && state.x) {
      const sx = state.width / oldW;
      const sy = state.height / oldH;
      for (let i = 0; i < state.count; i++) {
        state.x[i] *= sx;
        state.y[i] *= sy;
      }
      const wells = state.geometry.wells;
      for (let k = 0; k < wells.length; k++) {
        wells[k].x *= sx;
        wells[k].y *= sy;
        wells[k].radius *= (sx + sy) * 0.5;
      }
      if (wells.length) state.geometry.dirty = true;
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

  // Particle presets (exclude geometry presets which also use .preset-btn styling)
  document.querySelectorAll(".preset-btn:not(.geo-preset-btn)").forEach((btn) => {
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
  document.getElementById("btn-start-rubber")?.addEventListener("click", enterWithRubberSheet);
  document.getElementById("btn-help-splash").addEventListener("click", () => showHelp(true));
  document.getElementById("btn-help").addEventListener("click", () => showHelp(true));
  document.getElementById("btn-reset").addEventListener("click", resetField);
  document.getElementById("btn-reset-universe")?.addEventListener("click", resetUniverse);
  document.getElementById("btn-clear").addEventListener("click", clearTrails);
  document.getElementById("btn-reseed").addEventListener("click", reseed);
  document.getElementById("btn-export").addEventListener("click", exportPng);
  document.getElementById("btn-share")?.addEventListener("click", copyShareLink);
  document.getElementById("btn-fullscreen").addEventListener("click", toggleFullscreen);
  document.getElementById("btn-sound").addEventListener("click", () => setSound(!state.soundOn));
  document.getElementById("btn-rubber-sheet")?.addEventListener("click", () => {
    applyGeometryPreset("rubber-sheet");
  });
  document.getElementById("btn-discovery-next")?.addEventListener("click", () => {
    if (discoveryIndex >= discoverySteps.length - 1) endDiscovery();
    else showDiscoveryStep(discoveryIndex + 1);
  });
  document.getElementById("btn-discovery-skip")?.addEventListener("click", endDiscovery);

  document.querySelectorAll("[data-close-help]").forEach((el) => {
    el.addEventListener("click", () => showHelp(false));
  });

  // ─── Geometry UI bindings ──────────────────────────────────────

  // Layer toggle (Force / Geometry)
  document.querySelectorAll(".layer-btn").forEach((btn) => {
    btn.addEventListener("click", () => setInteractionLayer(btn.dataset.layer));
  });

  // Geometry tool buttons
  document.querySelectorAll(".geo-tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => setGeometryTool(btn.dataset.geotool));
  });

  // Geometry sliders
  document.getElementById("ctrl-well-mass").addEventListener("input", (e) => {
    state.geometry.wellMass = parseFloat(e.target.value);
    document.getElementById("val-well-mass").textContent = state.geometry.wellMass.toFixed(1);
  });
  document.getElementById("ctrl-well-radius").addEventListener("input", (e) => {
    state.geometry.wellRadius = parseFloat(e.target.value);
    document.getElementById("val-well-radius").textContent = String(Math.round(state.geometry.wellRadius));
  });
  document.getElementById("ctrl-geo-strength").addEventListener("input", (e) => {
    state.geometry.strength = parseFloat(e.target.value);
    document.getElementById("val-geo-strength").textContent = state.geometry.strength.toFixed(1);
  });
  document.getElementById("ctrl-surface-g").addEventListener("input", (e) => {
    state.geometry.surfaceG = parseFloat(e.target.value);
    document.getElementById("val-surface-g").textContent = state.geometry.surfaceG.toFixed(2);
  });
  document.getElementById("ctrl-optical-depth").addEventListener("input", (e) => {
    state.geometry.opticalDepth = parseFloat(e.target.value);
    document.getElementById("val-optical-depth").textContent = state.geometry.opticalDepth.toFixed(2);
  });
  document.getElementById("ctrl-brush-radius").addEventListener("input", (e) => {
    state.geometry.brushRadius = parseFloat(e.target.value);
    document.getElementById("val-brush-radius").textContent = String(Math.round(state.geometry.brushRadius));
  });

  // Geometry toggles
  document.getElementById("ctrl-show-grid").addEventListener("change", (e) => {
    state.geometry.showGrid = e.target.checked;
  });
  document.getElementById("ctrl-geo-enabled").addEventListener("change", (e) => {
    state.geometry.enabled = e.target.checked;
  });

  // Geometry presets
  document.querySelectorAll(".geo-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyGeometryPreset(btn.dataset.geopreset));
  });

  // Clear geometry
  document.getElementById("btn-clear-geo").addEventListener("click", () => {
    clearGeometry();
    toast("Geometry cleared");
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
      const disc = document.getElementById("discovery");
      if (disc && !disc.hidden) {
        endDiscovery();
        return;
      }
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
      // ─── Geometry shortcuts ───
      case "g":
        setInteractionLayer(
          state.geometry.interaction === "force" ? "geometry" : "force"
        );
        break;
      case "m":
        state.geometry.showGrid = !state.geometry.showGrid;
        document.getElementById("ctrl-show-grid").checked = state.geometry.showGrid;
        toast(state.geometry.showGrid ? "Metric grid on" : "Metric grid off");
        break;
      case "x":
        clearGeometry();
        toast("Geometry cleared");
        break;
      case "7":
        setGeometryTool("well");
        break;
      case "8":
        setGeometryTool("paint-down");
        break;
      case "9":
        setGeometryTool("paint-up");
        break;
      case "0":
        setGeometryTool("erase");
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
  updateHudHint();

  // Shared experiment from URL (after canvas sized)
  const loadedFromShare = applyExperimentFromHash();
  if (loadedFromShare) {
    // Skip splash for shared links — land straight in the experiment
    els.splash.classList.add("gone");
    markDiscoverySeen();
    toast("Loaded shared experiment");
  }

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

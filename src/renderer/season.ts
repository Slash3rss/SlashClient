/**
 * The seasonal looks. Around Halloween (25 October – 2 November) the launcher turns orange and violet,
 * bats fly over the sky, pumpkins glow at the bottom of the side bar and cobwebs hang at the top. Around
 * Poland's Independence Day (8 – 12 November) it turns white and red: bunting hangs across the top,
 * white and red confetti drifts down the sky and a flag waves at the bottom of the side bar over
 * "POLSKA GUROM!". On by itself in that time; a player switches it off in Settings ("Wygląd sezonowy"),
 * an admin for everyone in the panel (Funkcje → "Wygląd sezonowy"). With fewer animations nothing moves.
 */

import { t as tr } from '../shared/i18n';

export type SeasonId = 'halloween' | 'independence';

/** The season of the day (the player's own calendar), or null outside them. */
export function seasonOf(d = new Date()): SeasonId | null {
  const month = d.getMonth();
  const day = d.getDate();
  if ((month === 9 && day >= 25) || (month === 10 && day <= 2)) return 'halloween';
  if (month === 10 && day >= 8 && day <= 12) return 'independence';
  return null;
}

/** Whether the day is in the Halloween season. */
export function halloweenSeason(d = new Date()): boolean {
  return seasonOf(d) === 'halloween';
}

interface Bat { x: number; y: number; vx: number; vy: number; size: number; phase: number; speed: number }
/** A scrap of confetti: white or red, turning as it falls. */
interface Scrap { x: number; y: number; vy: number; drift: number; size: number; phase: number; spin: number; red: boolean }

interface SeasonDeps {
  /** The player's setting (on unless switched off). */
  settingOn: () => boolean;
  /** The admin's switch (on unless the server says otherwise); undefined until the server has answered. */
  featureOn: () => boolean | undefined;
  /** Fewer animations: the bats and the confetti are drawn once and stay. */
  reduced: () => boolean;
  /** The window's (and the taskbar's) icon: a picture as a PNG data URL, or null for the usual one. */
  setWindowIcon?: (dataUrl: string | null) => unknown;
  /** Tells the game whether the look is allowed (the next game started gets it). */
  setAllowed?: (on: boolean) => unknown;
}

const WEB = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
  <path d="M0 0 L120 120 M0 0 L60 120 M0 0 L120 60 M0 0 L0 120 M0 0 L120 0"/>
  <path d="M0 24 Q14 18 24 0 M0 48 Q28 36 34 26 Q40 14 48 0 M0 76 Q30 64 44 50 Q56 34 62 24 Q68 12 76 0 M0 104 Q36 92 56 72 Q72 52 82 42 Q92 24 104 0"/>
</svg>`;

/** White and red bunting: a cord sagging across the top with pennants hanging from it, one colour after the other. */
function bunting(): string {
  // the cord: a curve from (0, 3) through (480, 37) to (960, 3); its height at any x along it
  const cord = (x: number) => {
    const s = x / 960;
    return 3 + 68 * s * (1 - s);
  };
  const flags: string[] = [];
  for (let i = 0; i < 24; i++) {
    const x = 10 + i * 40;
    // both top corners on the cord, the tip hanging straight down from between them
    const y1 = cord(x), y2 = cord(x + 28);
    flags.push(`<path d="M${x} ${y1.toFixed(1)} L${x + 28} ${y2.toFixed(1)} L${x + 14} ${((y1 + y2) / 2 + 24).toFixed(1)} Z" fill="${i % 2 ? '#dc2626' : '#f8fafc'}"/>`);
  }
  return `<svg viewBox="0 0 960 48" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 3 Q480 37 960 3" fill="none" stroke="rgba(226, 232, 240, .5)" stroke-width="1.5"/>${flags.join('')}
</svg>`;
}

/** Whether the look was allowed last time (the player's setting and the admin's switch), for the splash before either is known. */
const REMEMBER = 'slashclient.season';
function remembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER) !== 'off';
  } catch {
    return true;
  }
}

export function initSeason(deps: SeasonDeps) {
  const root = document.documentElement;
  // the splash already in the season's colours, from the first frame
  const today = seasonOf();
  if (today && remembered()) root.classList.add(`season-${today}`);
  const canvas = document.createElement('canvas');
  canvas.className = 'season-sky';
  canvas.setAttribute('aria-hidden', 'true');
  // the pumpkins (or the flag) sit in the side bar's empty bottom, where the panels do not cover them
  const patch = document.createElement('canvas');
  patch.className = 'season-pumpkins';
  patch.setAttribute('aria-hidden', 'true');
  const PATCH_W = 150, PATCH_H = 72;
  const webs = ['left', 'right'].map((side) => {
    const web = document.createElement('div');
    web.className = `season-web season-web-${side}`;
    web.setAttribute('aria-hidden', 'true');
    web.innerHTML = WEB;
    return web;
  });
  const garland = document.createElement('div');
  garland.className = 'season-bunting';
  garland.setAttribute('aria-hidden', 'true');
  garland.innerHTML = bunting();
  const ctx = canvas.getContext('2d');
  const pctx = patch.getContext('2d');
  let bats: Bat[] = [];
  let scraps: Scrap[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let on: SeasonId | null = null;
  let last = performance.now();

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    patch.width = PATCH_W * dpr;
    patch.height = PATCH_H * dpr;
    patch.style.width = `${PATCH_W}px`;
    patch.style.height = `${PATCH_H}px`;
    pctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitPatch();
    const count = Math.max(4, Math.min(9, Math.round(innerWidth / 180)));
    bats = Array.from({ length: count }, () => ({
      x: Math.random() * innerWidth,
      y: 40 + Math.random() * innerHeight * 0.55,
      vx: (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 18),
      vy: (Math.random() - 0.5) * 6,
      size: 11 + Math.random() * 9,
      phase: Math.random() * Math.PI * 2,
      speed: 7 + Math.random() * 5,
    }));
    scraps = Array.from({ length: Math.max(14, Math.min(40, Math.round(innerWidth / 40))) }, (_, i) => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vy: 14 + Math.random() * 20,
      drift: 6 + Math.random() * 10,
      size: 3 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
      spin: 1.5 + Math.random() * 3,
      red: i % 2 === 1,
    }));
  };

  /** The logo in the season's colours with its sign in the corner (made once per season, from logo.png). */
  const logos = new Map<SeasonId, Promise<string | undefined>>();
  const makeLogo = async (season: SeasonId): Promise<string | undefined> => {
    const img = new Image();
    img.src = 'logo.png';
    await img.decode();
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x) return undefined;
    // Halloween: the blue turned orange, the night sky purple, a pumpkin in the corner
    if (season === 'halloween') {
      x.filter = 'hue-rotate(170deg) saturate(1.25)';
      x.drawImage(img, 0, 0, size, size);
      x.filter = 'none';
      pumpkin(x, size * 0.8, size * 0.8, size * 0.14, 0, false);
    } else {
      x.drawImage(img, 0, 0, size, size);
      const plain = x.getImageData(0, 0, size, size);
      x.clearRect(0, 0, size, size);
      x.filter = 'hue-rotate(145deg) saturate(3) brightness(1.15)';
      x.drawImage(img, 0, 0, size, size);
      x.filter = 'none';
      whiteAndRed(x, size, plain);
    }
    return c.toDataURL('image/png');
  };
  /**
   * Independence Day's logo: the tile turned red (drawn so on `x`) and the letter's light upper part white
   * (where the usual logo, `plain`, is light), so it reads white and red.
   */
  function whiteAndRed(x: CanvasRenderingContext2D, size: number, plain: ImageData) {
    const image = x.getImageData(0, 0, size, size);
    const d = image.data, p = plain.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
      if (lum <= 0.55) continue;
      const white = 235 + lum * 20;
      d[i] = d[i + 1] = d[i + 2] = white;
    }
    x.putImageData(image, 0, 0);
  }

  /** The logos on the page (the side bar's, the splash's) and the window's icon: the season's, or back to the usual. */
  let logoShown: SeasonId | null = null;
  async function logo(season: SeasonId | null) {
    logoShown = season;
    let url: string | undefined;
    if (season) {
      if (!logos.has(season)) logos.set(season, makeLogo(season).catch(() => undefined));
      url = await logos.get(season);
    }
    // switched again while the picture was being made: the later call decides
    if (logoShown !== season) return;
    for (const img of document.querySelectorAll<HTMLImageElement>('.brand-logo, .splash-logo')) img.src = url ?? 'logo.png';
    deps.setWindowIcon?.(url ?? null);
  }

  /** The pumpkins or the flag only where the side bar has room under its menu: they never cover a button. */
  function fitPatch() {
    const bar = patch.parentElement;
    const last = bar ? [...bar.children].filter((c) => c !== patch).at(-1) : undefined;
    if (!bar || !last) return;
    const free = bar.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
    patch.hidden = free < PATCH_H + 14;
  }

  /** A bat's silhouette: a small body and two wings that beat (`flap` from -1 to 1). */
  function bat(b: Bat, flap: number) {
    if (!ctx) return;
    const s = b.size;
    const lift = flap * s * 0.55;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.vx < 0) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(12, 8, 20, .85)';
    ctx.strokeStyle = 'rgba(251, 146, 60, .35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // the right wing, scalloped along its lower edge
    ctx.quadraticCurveTo(s * 0.6, -s * 0.5 - lift, s * 1.6, -s * 0.2 - lift);
    ctx.quadraticCurveTo(s * 1.3, s * 0.1 - lift * 0.4, s * 1.1, s * 0.2 - lift * 0.2);
    ctx.quadraticCurveTo(s * 0.8, 0, s * 0.6, s * 0.3);
    ctx.quadraticCurveTo(s * 0.4, s * 0.1, 0, s * 0.35);
    // and the left one
    ctx.quadraticCurveTo(-s * 0.4, s * 0.1, -s * 0.6, s * 0.3);
    ctx.quadraticCurveTo(-s * 0.8, 0, -s * 1.1, s * 0.2 - lift * 0.2);
    ctx.quadraticCurveTo(-s * 1.3, s * 0.1 - lift * 0.4, -s * 1.6, -s * 0.2 - lift);
    ctx.quadraticCurveTo(-s * 0.6, -s * 0.5 - lift, 0, 0);
    ctx.fill();
    ctx.stroke();
    // the head with its ears
    ctx.beginPath();
    ctx.arc(0, -s * 0.05, s * 0.22, 0, Math.PI * 2);
    ctx.moveTo(-s * 0.15, -s * 0.2);
    ctx.lineTo(-s * 0.1, -s * 0.45);
    ctx.lineTo(-s * 0.02, -s * 0.22);
    ctx.moveTo(s * 0.15, -s * 0.2);
    ctx.lineTo(s * 0.1, -s * 0.45);
    ctx.lineTo(s * 0.02, -s * 0.22);
    ctx.fill();
    ctx.restore();
  }

  /** A pumpkin glowing on the ground: ribs, a stem and a carved face lit from inside. */
  function pumpkin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, glowing = true) {
    const flicker = deps.reduced() || !glowing ? 1 : 0.85 + 0.15 * Math.sin(t / 180 + x);
    // the glow around it (not in the icon: the picture's edge would cut it into a square)
    if (glowing) {
      const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3);
      glow.addColorStop(0, `rgba(249, 115, 22, ${0.28 * flicker})`);
      glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    for (const [dx, w] of [[-0.45, 0.6], [0.45, 0.6], [0, 0.7]] as const) {
      ctx.beginPath();
      ctx.ellipse(x + dx * r, y, r * w, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = dx === 0 ? '#f97316' : '#ea580c';
      ctx.fill();
    }
    ctx.fillStyle = '#4d7c0f';
    ctx.fillRect(x - r * 0.08, y - r * 1.05, r * 0.16, r * 0.3);
    ctx.fillStyle = `rgba(254, 240, 138, ${0.9 * flicker})`;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y - r * 0.2);
    ctx.lineTo(x - r * 0.22, y - r * 0.42);
    ctx.lineTo(x - r * 0.12, y - r * 0.15);
    ctx.moveTo(x + r * 0.42, y - r * 0.2);
    ctx.lineTo(x + r * 0.22, y - r * 0.42);
    ctx.lineTo(x + r * 0.12, y - r * 0.15);
    ctx.moveTo(x - r * 0.45, y + r * 0.15);
    ctx.lineTo(x - r * 0.2, y + r * 0.4);
    ctx.lineTo(x, y + r * 0.25);
    ctx.lineTo(x + r * 0.2, y + r * 0.4);
    ctx.lineTo(x + r * 0.45, y + r * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Poland's flag on its pole, `w` wide from the pole at (x, y), white over red, waving (`t` in ms; still in
   * the icon and with fewer animations).
   */
  function flag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number, still: boolean) {
    const h = w * 0.62;
    // the pole
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x - w * 0.05, y - h * 0.15, w * 0.05, h * 1.45);
    ctx.beginPath();
    ctx.arc(x - w * 0.025, y - h * 0.18, w * 0.045, 0, Math.PI * 2);
    ctx.fill();
    // the cloth in thin strips, each lifted by the wave further from the pole
    const strips = 24;
    for (let i = 0; i < strips; i++) {
      const sx = x + (i / strips) * w;
      const wave = still ? Math.sin(i / 4) * h * 0.04 : Math.sin(t / 260 - i / 3.2) * h * 0.07 * (i / strips);
      const shade = 1 - (still ? 0 : 0.12 * (0.5 + 0.5 * Math.sin(t / 260 - i / 3.2 + 1)));
      ctx.fillStyle = `rgb(${Math.round(248 * shade)}, ${Math.round(250 * shade)}, ${Math.round(252 * shade)})`;
      ctx.fillRect(sx, y + wave, w / strips + 0.6, h / 2);
      ctx.fillStyle = `rgb(${Math.round(220 * shade)}, ${Math.round(38 * shade)}, ${Math.round(38 * shade)})`;
      ctx.fillRect(sx, y + wave + h / 2, w / strips + 0.6, h / 2);
    }
  }

  /**
   * A line on fire: flames licking up from behind its letters, the letters themselves yellow at the top,
   * orange and red below, glowing and flickering (`t` in ms; still with fewer animations).
   */
  function burning(ctx: CanvasRenderingContext2D, text: string, cx: number, baseline: number, t: number, still: boolean) {
    ctx.save();
    ctx.font = '800 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width;
    // the fire: one soft, rolling edge along the line (lower at its ends), an orange-red body and a
    // shorter yellow heart inside it
    const left = cx - w / 2 - 3, right = cx + w / 2 + 3, foot = baseline - 1;
    const edge = (x: number, scale: number) => {
      const n = still ? 0.6 * Math.sin(x * 0.35) + 0.4 * Math.sin(x * 0.9)
        : 0.5 * Math.sin(x * 0.35 + t / 110) + 0.3 * Math.sin(x * 0.8 - t / 70) + 0.2 * Math.sin(x * 1.7 + t / 45);
      const taper = Math.pow(Math.max(0, Math.sin((Math.PI * (x - left)) / (right - left))), 0.5);
      return foot - (10 + 9 * (0.5 + 0.5 * n)) * scale * taper;
    };
    ctx.filter = 'blur(0.7px)';
    for (const [scale, from, mid, to] of [[1, 'rgba(220, 38, 38, .9)', 'rgba(249, 115, 22, .75)', 'rgba(251, 146, 60, 0)'], [0.5, 'rgba(253, 224, 71, .95)', 'rgba(254, 240, 138, .6)', 'rgba(254, 249, 195, 0)']] as const) {
      const fire = ctx.createLinearGradient(0, foot, 0, foot - 20 * scale);
      fire.addColorStop(0, from);
      fire.addColorStop(0.55, mid);
      fire.addColorStop(1, to);
      ctx.fillStyle = fire;
      ctx.beginPath();
      ctx.moveTo(left, foot);
      for (let x = left; x <= right; x += 1.5) ctx.lineTo(x, edge(x, scale));
      ctx.lineTo(right, foot);
      ctx.closePath();
      ctx.fill();
    }
    ctx.filter = 'none';
    // the letters, hot at the top, glowing
    const flicker = still ? 1 : 0.75 + 0.25 * Math.sin(t / 70) * Math.sin(t / 113);
    const hot = ctx.createLinearGradient(0, baseline - 10, 0, baseline + 1);
    hot.addColorStop(0, '#fef08a');
    hot.addColorStop(0.5, '#fb923c');
    hot.addColorStop(1, '#dc2626');
    ctx.shadowColor = `rgba(249, 115, 22, ${(0.9 * flicker).toFixed(2)})`;
    ctx.shadowBlur = 3 + 3 * flicker;
    // a dark red outline keeps the letters readable in the fire
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(69, 10, 10, .95)';
    ctx.strokeText(text, cx, baseline);
    ctx.shadowBlur = 0;
    ctx.fillStyle = hot;
    ctx.fillText(text, cx, baseline);
    ctx.restore();
  }

  function draw(t: number) {
    if (!ctx) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    const still = deps.reduced();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (on === 'halloween') {
      for (const b of bats) {
        if (!still) {
          b.x += b.vx * dt;
          b.y += (b.vy + Math.sin(t / 700 + b.phase) * 8) * dt;
          // off one side: back in on the other, at another height
          if (b.x < -40) b.x = innerWidth + 30;
          if (b.x > innerWidth + 40) b.x = -30;
          if (b.y < 30 || b.y > innerHeight * 0.7) b.vy = -b.vy;
        }
        bat(b, still ? 0.3 : Math.sin(t / 1000 * b.speed + b.phase));
      }
    } else {
      for (const s of scraps) {
        if (!still) {
          s.y += s.vy * dt;
          s.x += Math.sin(t / 900 + s.phase) * s.drift * dt;
          // through the bottom: again from the top, somewhere else
          if (s.y > innerHeight + 10) {
            s.y = -10;
            s.x = Math.random() * innerWidth;
          }
        }
        // turning as it falls: narrower and wider
        const turn = still ? 0.8 : Math.abs(Math.cos(t / 1000 * s.spin + s.phase));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.phase);
        ctx.fillStyle = s.red ? 'rgba(220, 38, 38, .55)' : 'rgba(248, 250, 252, .5)';
        ctx.fillRect(-s.size / 2, (-s.size * turn) / 2, s.size, Math.max(0.6, s.size * turn));
        ctx.restore();
      }
    }
    if (pctx) {
      pctx.clearRect(0, 0, PATCH_W, PATCH_H);
      if (on === 'halloween') {
        pumpkin(pctx, PATCH_W / 2 - 22, 50, 15, t);
        pumpkin(pctx, PATCH_W / 2 + 18, 55, 10, t + 400);
      } else {
        flag(pctx, PATCH_W / 2 - 18, 4, 40, t, still);
        burning(pctx, tr('POLSKA GUROM!'), PATCH_W / 2, 66, t, still);
      }
    }
  }

  const tick = () => {
    draw(performance.now());
    timer = !on || document.hidden || deps.reduced() ? undefined : setTimeout(tick, document.hasFocus() ? 33 : 250);
  };

  /** Turns the look on or off as the day, the setting and the switch say; again on any change of them. */
  function apply() {
    // before the server's switches are known (or offline): as decided last time, so an admin's "off" does not flash
    const feature = deps.featureOn();
    const allowed = deps.settingOn() && (feature ?? remembered());
    deps.setAllowed?.(allowed);
    if (feature !== undefined) {
      try {
        localStorage.setItem(REMEMBER, allowed ? 'on' : 'off');
      } catch {
        // nothing to remember it in: the splash goes by the date alone
      }
    }
    const next = allowed ? seasonOf() : null;
    root.classList.toggle('season-halloween', next === 'halloween');
    root.classList.toggle('season-independence', next === 'independence');
    clearTimeout(timer);
    timer = undefined;
    if (next !== logoShown) void logo(next);
    if (next !== on) {
      canvas.remove();
      patch.remove();
      for (const w of webs) w.remove();
      garland.remove();
      if (next) {
        document.body.append(canvas, ...(next === 'halloween' ? webs : [garland]));
        document.querySelector('.sidebar')?.append(patch);
        fitPatch();
        resize();
      }
    }
    on = next;
    if (on) {
      last = performance.now();
      tick();
    }
  }

  addEventListener('resize', () => {
    if (!on) return;
    resize();
    draw(performance.now());
  });
  const wake = () => {
    if (on && timer === undefined) tick();
  };
  document.addEventListener('visibilitychange', wake);
  addEventListener('focus', () => {
    clearTimeout(timer);
    timer = undefined;
    wake();
  });
  // the season may start or end while the launcher stays open
  setInterval(apply, 60 * 60_000);
  // and its logo
  if (today && root.classList.contains(`season-${today}`)) void logo(today);
  return { apply };
}

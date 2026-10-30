/**
 * The seasonal look: around Halloween (25 October – 2 November) the launcher turns orange and violet,
 * bats fly over the sky, pumpkins glow at the bottom of the side bar and cobwebs hang at the top. On by itself in
 * that time; a player switches it off in Settings ("Wygląd sezonowy"), an admin for everyone in the
 * panel (Funkcje → "Wygląd sezonowy"). With fewer animations the bats stay where they are.
 */

/** Whether the day is in the Halloween season (the player's own calendar). */
export function halloweenSeason(d = new Date()): boolean {
  const month = d.getMonth();
  const day = d.getDate();
  return (month === 9 && day >= 25) || (month === 10 && day <= 2);
}

interface Bat { x: number; y: number; vx: number; vy: number; size: number; phase: number; speed: number }

interface SeasonDeps {
  /** The player's setting (on unless switched off). */
  settingOn: () => boolean;
  /** The admin's switch (on unless the server says otherwise); undefined until the server has answered. */
  featureOn: () => boolean | undefined;
  /** Fewer animations: the bats are drawn once and stay. */
  reduced: () => boolean;
  /** The window's (and the taskbar's) icon: a picture as a PNG data URL, or null for the usual one. */
  setWindowIcon?: (dataUrl: string | null) => unknown;
}

const WEB = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
  <path d="M0 0 L120 120 M0 0 L60 120 M0 0 L120 60 M0 0 L0 120 M0 0 L120 0"/>
  <path d="M0 24 Q14 18 24 0 M0 48 Q28 36 34 26 Q40 14 48 0 M0 76 Q30 64 44 50 Q56 34 62 24 Q68 12 76 0 M0 104 Q36 92 56 72 Q72 52 82 42 Q92 24 104 0"/>
</svg>`;

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
  if (halloweenSeason() && remembered()) root.classList.add('season-halloween');
  const canvas = document.createElement('canvas');
  canvas.className = 'season-sky';
  canvas.setAttribute('aria-hidden', 'true');
  // the pumpkins sit in the side bar's empty bottom, where the panels do not cover them
  const patch = document.createElement('canvas');
  patch.className = 'season-pumpkins';
  patch.setAttribute('aria-hidden', 'true');
  const PATCH_W = 150, PATCH_H = 56;
  const webs = ['left', 'right'].map((side) => {
    const web = document.createElement('div');
    web.className = `season-web season-web-${side}`;
    web.setAttribute('aria-hidden', 'true');
    web.innerHTML = WEB;
    return web;
  });
  const ctx = canvas.getContext('2d');
  const pctx = patch.getContext('2d');
  let bats: Bat[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let on = false;
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
  };

  /** The logo in the season's colours with a pumpkin in its corner (made once, from logo.png). */
  let seasonLogo: Promise<string | undefined> | undefined;
  const makeLogo = async (): Promise<string | undefined> => {
    const img = new Image();
    img.src = 'logo.png';
    await img.decode();
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x) return undefined;
    // the blue turned orange, the night sky purple
    x.filter = 'hue-rotate(170deg) saturate(1.25)';
    x.drawImage(img, 0, 0, size, size);
    x.filter = 'none';
    pumpkin(x, size * 0.8, size * 0.8, size * 0.14, 0, false);
    return c.toDataURL('image/png');
  };
  /** The logos on the page (the side bar's, the splash's) and the window's icon: the season's, or back to the usual. */
  let logoShown = false;
  async function logo(season: boolean) {
    logoShown = season;
    const url = season ? await (seasonLogo ??= makeLogo().catch(() => undefined)) : undefined;
    // switched again while the picture was being made: the later call decides
    if (logoShown !== season) return;
    for (const img of document.querySelectorAll<HTMLImageElement>('.brand-logo, .splash-logo')) img.src = url ?? 'logo.png';
    deps.setWindowIcon?.(url ?? null);
  }

  /** The pumpkins only where the side bar has room under its menu: they never cover a button. */
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

  function draw(t: number) {
    if (!ctx) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    const still = deps.reduced();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
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
    if (pctx) {
      pctx.clearRect(0, 0, PATCH_W, PATCH_H);
      pumpkin(pctx, PATCH_W / 2 - 22, 34, 15, t);
      pumpkin(pctx, PATCH_W / 2 + 18, 39, 10, t + 400);
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
    if (feature !== undefined) {
      try {
        localStorage.setItem(REMEMBER, allowed ? 'on' : 'off');
      } catch {
        // nothing to remember it in: the splash goes by the date alone
      }
    }
    const next = halloweenSeason() && allowed;
    root.classList.toggle('season-halloween', next);
    clearTimeout(timer);
    timer = undefined;
    if (next !== logoShown) void logo(next);
    if (next && !on) {
      document.body.append(canvas, ...webs);
      document.querySelector('.sidebar')?.append(patch);
      fitPatch();
      resize();
    } else if (!next && on) {
      canvas.remove();
      patch.remove();
      for (const w of webs) w.remove();
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
  if (root.classList.contains('season-halloween')) void logo(true);
  return { apply };
}

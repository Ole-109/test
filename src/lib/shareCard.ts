/**
 * Renders a shareable wish summary as a PNG (1200×675). Icons come from the
 * game asset CDN, which sends CORS headers, so the canvas stays exportable.
 */
import { iconUrl } from '../data/characters';

export interface ShareStat {
  label: string;
  value: string;
  sub?: string;
}

export interface ShareItem {
  name: string;
  icon?: string;
  pity: number;
  soft: boolean;
  badge?: string;
}

export interface ShareCardInput {
  title: string;
  subtitle: string;
  stats: ShareStat[];
  banners: { name: string; total: string; five: string; pity: string }[];
  recentLabel: string;
  recent: ShareItem[];
  footer: string;
}

const W = 1200;
const H = 675;
const C = {
  bg: '#1a1918',
  surface: '#232120',
  border: '#33302c',
  text: '#ede7de',
  text2: '#b8afa4',
  muted: '#8b8379',
  accent: '#d69c82',
  r5: '#d9ae74',
  tileA: '#94704e',
  tileB: '#c3a07b',
};

function loadImage(src: string, timeout = 5000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.ready;
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  const serif = (size: number) => `400 ${size}px "Instrument Serif", Georgia, serif`;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = C.accent;
  ctx.font = serif(22);
  ctx.fillText('Waypoint', 48, 58);
  ctx.fillStyle = C.text;
  ctx.font = serif(44);
  ctx.fillText(fit(ctx, input.title, 760), 48, 104);
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 17);
  ctx.fillText(fit(ctx, input.subtitle, 760), 48, 132);

  // Stat tiles
  const tileW = (W - 96 - 3 * 12) / 4;
  input.stats.slice(0, 4).forEach((s, i) => {
    const x = 48 + i * (tileW + 12);
    const y = 162;
    ctx.fillStyle = C.surface;
    roundRect(ctx, x, y, tileW, 104, 10);
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 15);
    ctx.fillText(fit(ctx, s.label, tileW - 32), x + 16, y + 30);
    ctx.fillStyle = C.text;
    ctx.font = serif(42);
    ctx.fillText(fit(ctx, s.value, tileW - 32), x + 16, y + 72);
    if (s.sub) {
      ctx.fillStyle = C.text2;
      ctx.font = font(500, 14);
      ctx.fillText(fit(ctx, s.sub, tileW - 32), x + 16, y + 92);
    }
  });

  // Banner table
  const by = 296;
  ctx.font = font(600, 14);
  input.banners.forEach((b, i) => {
    const x = 48 + i * (tileW + 12);
    ctx.fillStyle = C.text2;
    ctx.font = font(600, 15);
    ctx.fillText(fit(ctx, b.name, tileW), x, by);
    ctx.fillStyle = C.text;
    ctx.font = font(600, 15);
    ctx.fillText(fit(ctx, `${b.total} · ${b.five} · ${b.pity}`, tileW), x, by + 24);
  });

  // Recent 5★ strip
  ctx.fillStyle = C.text2;
  ctx.font = font(600, 16);
  ctx.fillText(input.recentLabel, 48, 372);
  const size = 84;
  const gap = 12;
  const perRow = Math.floor((W - 96 + gap) / (size + gap));
  const items = input.recent.slice(0, perRow * 2);
  const images = await Promise.all(items.map((it) => (it.icon ? loadImage(iconUrl(it.icon)!) : Promise.resolve(null))));
  items.forEach((it, i) => {
    const x = 48 + (i % perRow) * (size + gap);
    const y = 390 + Math.floor(i / perRow) * (size + 34);
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, C.tileA);
    grad.addColorStop(1, C.tileB);
    ctx.save();
    roundRect(ctx, x, y, size, size, 8);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);
    const img = images[i];
    if (img) ctx.drawImage(img, x, y, size, size);
    else {
      ctx.fillStyle = '#fff';
      ctx.font = font(700, 26);
      ctx.textAlign = 'center';
      ctx.fillText(it.name.slice(0, 2).toUpperCase(), x + size / 2, y + size / 2 + 9);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    // Pity badge
    ctx.font = font(700, 15);
    ctx.fillStyle = it.soft ? C.r5 : C.text;
    ctx.textAlign = 'center';
    ctx.fillText(`${it.pity}${it.badge ?? ''}`, x + size / 2, y + size + 22);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = C.muted;
  ctx.font = font(500, 13);
  ctx.fillText(input.footer, 48, H - 24);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

import { Droplet, Flame, Gem, Leaf, Snowflake, Sparkles, Wind, Zap } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import type { CharacterDef, Element } from '../lib/types';

const ELEMENT_ICON: Record<Element, typeof Flame> = {
  pyro: Flame,
  hydro: Droplet,
  anemo: Wind,
  electro: Zap,
  dendro: Leaf,
  cryo: Snowflake,
  geo: Gem,
  adaptive: Sparkles,
};

export function ElementIcon({ element, size = 14, title }: { element: Element; size?: number; title?: string }) {
  const Icon = ELEMENT_ICON[element];
  return (
    <span className={`el-icon el-${element}`} title={title} aria-label={title} role={title ? 'img' : undefined}>
      <Icon size={size} strokeWidth={2.2} aria-hidden />
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Character portrait placeholder: element-tinted crest with initials. */
export function CharacterCrest({ c, size = 56, dim }: { c: CharacterDef; size?: number; dim?: boolean }) {
  return (
    <div
      className={`crest crest-${c.rarity} el-${c.element} ${dim ? 'is-dim' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      <span>{initials(c.name)}</span>
    </div>
  );
}

/** Anime cover with graceful fallback when the image is missing or fails to load. */
export function Cover({
  src,
  title,
  color,
  className = '',
}: {
  src?: string;
  title: string;
  color?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = color ? ({ '--cover-tint': color } as CSSProperties) : undefined;
  return (
    <div className={`cover ${className}`} style={style}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="cover-fallback" aria-hidden>
          <span>{initials(title).slice(0, 2)}</span>
        </div>
      )}
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  // Unique gradient id: two logos render at once (sidebar + mobile bar) and one may be hidden.
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3dfb0" />
          <stop offset="1" stopColor="#c49a53" />
        </linearGradient>
      </defs>
      <path d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z" fill={`url(#${id})`} />
      <circle cx="32" cy="32" r="4.5" fill="var(--bg)" />
    </svg>
  );
}

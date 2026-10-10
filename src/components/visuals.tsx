import { Droplet, Flame, Gem, Leaf, Snowflake, Sparkles, Wind, Zap } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { iconUrl } from '../data/characters';
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

/** In-game element icon names (UI_Buff_Element_*). */
const ELEMENT_ASSET: Partial<Record<Element, string>> = {
  pyro: 'Fire',
  hydro: 'Water',
  anemo: 'Wind',
  electro: 'Electric',
  dendro: 'Grass',
  cryo: 'Ice',
  geo: 'Rock',
};

/** The game's element symbol; falls back to a drawn glyph if the image can't load. */
export function ElementIcon({ element, size = 14, title }: { element: Element; size?: number; title?: string }) {
  const [failed, setFailed] = useState(false);
  const asset = ELEMENT_ASSET[element];
  const Icon = ELEMENT_ICON[element];
  return (
    <span className={`el-icon el-${element}`} title={title} aria-label={title} role={title ? 'img' : undefined}>
      {asset && !failed ? (
        <img
          src={iconUrl(`UI_Buff_Element_${asset}`)}
          alt=""
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          aria-hidden
        />
      ) : (
        <Icon size={size} strokeWidth={2.2} aria-hidden />
      )}
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

/** Game-style item tile: icon on a rarity background, with graceful fallback to initials. */
export function ItemIcon({
  icon,
  name,
  rarity,
  size = 56,
  dim,
  badge,
  className = '',
}: {
  icon?: string;
  name: string;
  rarity: number;
  size?: number;
  dim?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = iconUrl(icon);
  return (
    <div className={`item-icon r${Math.min(5, Math.max(1, rarity))} ${dim ? 'is-dim' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span style={{ fontSize: size * 0.32 }}>{initials(name)}</span>
      )}
      {badge != null && <span className="item-badge">{badge}</span>}
    </div>
  );
}

export function CharacterIcon({ c, size = 56, dim, badge }: { c: CharacterDef; size?: number; dim?: boolean; badge?: ReactNode }) {
  return <ItemIcon icon={c.icon} name={c.name} rarity={c.rarity} size={size} dim={dim} badge={badge} />;
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
  // A fine four-point star in the accent colour.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo" fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round">
      <path d="M32 6 C34 24 40 30 58 32 C40 34 34 40 32 58 C30 40 24 34 6 32 C24 30 30 24 32 6 Z" />
      <circle cx="32" cy="32" r="3" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

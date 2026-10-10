import { Check, ChevronDown, Plus, Star } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { Cover } from '../../components/visuals';
import { useT } from '../../i18n';
import type { AniMedia } from '../../lib/anilist';
import { STATUSES } from '../../lib/anime';
import type { AnimeStatus } from '../../lib/types';
import { metaLine } from './labels';

export function mediaTitle(m: AniMedia, pref: string) {
  return (pref === 'english' ? m.title.english : pref === 'native' ? m.title.native : null) || m.title.romaji;
}

/** One AniList result: cover, score, title, meta line and an add button (or "in library"). */
export const MediaCard = memo(function MediaCard({
  m,
  title,
  subtitle,
  owned,
  onOpen,
  onAdd,
}: {
  m: AniMedia;
  title: string;
  /** Second title line, e.g. the English title when sorting by romaji. */
  subtitle?: string;
  owned: boolean;
  onOpen: () => void;
  onAdd: (s: AnimeStatus) => void;
}) {
  const t = useT();
  return (
    <article className="media-card">
      <button type="button" className="media-open" onClick={onOpen} aria-label={title}>
        <Cover src={m.coverImage.extraLarge ?? m.coverImage.large ?? undefined} title={title} color={m.coverImage.color ?? undefined} />
        {m.isAdult && <span className="media-adult">18+</span>}
        {m.averageScore != null && (
          <span className="media-score">
            <Star size={11} fill="currentColor" strokeWidth={0} aria-hidden /> {m.averageScore}%
          </span>
        )}
        <div className="media-info">
          <h3 title={title}>{title}</h3>
          {subtitle && subtitle !== title && (
            <p className="media-sub" title={subtitle}>
              {subtitle}
            </p>
          )}
          <p className="muted small">
            {metaLine(t, {
              format: m.format ?? undefined,
              season: m.season ?? undefined,
              year: m.seasonYear ?? undefined,
              episodes: m.episodes ?? undefined,
            })}
          </p>
        </div>
      </button>
      {owned ? (
        <span className="media-owned">
          <Check size={14} /> {t('discover.inLibrary')}
        </span>
      ) : (
        <AddMenu onAdd={onAdd} />
      )}
    </article>
  );
});

export function AddMenu({ onAdd }: { onAdd: (s: AnimeStatus) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="add-menu" ref={ref}>
      <button type="button" className="add-main" onClick={() => onAdd('planning')}>
        <Plus size={14} /> {t('anime.status.planning')}
      </button>
      <button type="button" className="add-more" aria-label={t('discover.addAs')} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(s);
                setOpen(false);
              }}
            >
              <span className={`status-dot st-${s}`} aria-hidden /> {t(`anime.status.${s}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

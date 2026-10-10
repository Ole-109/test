import { Clock, Heart, Plus, Star } from 'lucide-react';
import { useT } from '../../i18n';
import { patchAnime, stepEpisode } from '../../lib/actions';
import { behindBy, displayTitle, projectedAiring } from '../../lib/anime';
import { useStore } from '../../lib/store';
import { formatDuration } from '../../lib/time';
import type { AnimeEntry } from '../../lib/types';
import { Cover } from '../../components/visuals';
import { toast } from '../../components/toast';
import { metaLine } from './labels';

export function useStepWithToast() {
  const t = useT();
  const titleLang = useStore((s) => s.settings.titleLang);
  return (a: AnimeEntry, delta: number) => {
    const before = a.status;
    const next = stepEpisode(a.id, delta);
    if (next && next.status === 'completed' && before !== 'completed') {
      toast({ message: t('anime.completedToast', { name: displayTitle(next, titleLang) }), tone: 'success' });
    }
  };
}

/** 1–10 buttons to score a show right from the list. */
function QuickRate({ a, title }: { a: AnimeEntry; title: string }) {
  const t = useT();
  return (
    <div className="quick-rate" role="group" aria-label={`${t('anime.rateQuick')}: ${title}`}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          title={`${n}/10`}
          onClick={() => {
            patchAnime(a.id, { score: n });
            toast({
              message: t('anime.rated', { name: title, n }),
              tone: 'success',
              action: { label: t('common.undo'), run: () => patchAnime(a.id, { score: 0 }) },
            });
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function AnimeCard({
  a,
  now,
  onOpen,
  layout,
  quickRate,
}: {
  a: AnimeEntry;
  now: number;
  onOpen: () => void;
  layout: 'grid' | 'list';
  /** Show the 1–10 rating strip (used by the "Unrated" filter). */
  quickRate?: boolean;
}) {
  const t = useT();
  const titleLang = useStore((s) => s.settings.titleLang);
  const step = useStepWithToast();
  const title = displayTitle(a, titleLang);
  const behind = behindBy(a, now);
  const next = projectedAiring(a, now);
  const pct = a.episodes ? Math.min(100, (a.progress / a.episodes) * 100) : a.progress > 0 ? 100 : 0;
  const canStep = !a.episodes || a.progress < a.episodes;
  const showStep = a.status !== 'completed' && canStep;

  const meta = metaLine(t, a);

  return (
    <article className={`anime-card layout-${layout} st-${a.status}`}>
      <button type="button" className="anime-open" onClick={onOpen} aria-label={title}>
        <div className="anime-cover-wrap">
          <Cover src={a.cover} title={title} color={a.color} />
          {layout === 'grid' && behind > 0 && a.status === 'watching' && (
            <span className="badge badge-accent anime-behind">{t.n('home.behind', behind)}</span>
          )}
          {a.favorite && (
            <span className="anime-fav" aria-hidden>
              <Heart size={12} fill="currentColor" />
            </span>
          )}
          <div className="anime-progress" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="anime-info">
          <h3 className="anime-title" title={title}>
            {title}
          </h3>
          <div className="anime-sub">
            <span className={`status-dot st-${a.status}`} aria-hidden />
            <span className="num">
              {a.episodes ? t('anime.episodeOf', { n: a.progress, total: a.episodes }) : t('anime.episode', { n: a.progress })}
            </span>
            {a.score > 0 && (
              <span className="anime-score">
                <Star size={11} fill="currentColor" strokeWidth={0} aria-hidden />
                <span className="num">{a.score}</span>
              </span>
            )}
          </div>
          {layout === 'list' && meta && <div className="muted small">{meta}</div>}
          {next && (a.status === 'watching' || a.status === 'planning') && (
            <div className="anime-next">
              <Clock size={12} aria-hidden />
              <span>{t('anime.nextEp', { n: next.episode, when: t('common.in', { t: formatDuration(next.at - now) }) })}</span>
            </div>
          )}
          {layout === 'list' && behind > 0 && a.status === 'watching' && (
            <span className="badge badge-accent">{t.n('anime.behind', behind)}</span>
          )}
        </div>
      </button>
      {quickRate && <QuickRate a={a} title={title} />}
      {showStep && !quickRate && (
        <button type="button" className="step-btn" onClick={() => step(a, 1)} aria-label={`${t('anime.plusOne')}: ${title}`} title={t('anime.plusOne')}>
          <Plus size={16} strokeWidth={2.5} />
          <span className="num">{a.progress + 1}</span>
        </button>
      )}
    </article>
  );
}

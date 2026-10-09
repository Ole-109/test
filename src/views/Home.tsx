import { ArrowRight, Check, Clock, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ResinCard } from '../components/ResinCard';
import { Ring } from '../components/ui';
import { Cover } from '../components/visuals';
import { useT } from '../i18n';
import { toggleTask } from '../lib/actions';
import { behindBy, displayTitle, occurrences } from '../lib/anime';
import { RULES } from '../lib/gacha';
import { useNow } from '../lib/hooks';
import { href } from '../lib/router';
import { useStore } from '../lib/store';
import { DAY, formatDuration, isTaskDone, nextDailyReset, nextWeeklyReset } from '../lib/time';
import { AnimeSheet } from './anime/AnimeSheet';
import { useStepWithToast } from './anime/AnimeCard';
import { taskLabel } from './genshin/Today';

export function Home() {
  const t = useT();
  const now = useNow(1000);
  const hour = new Date(now).getHours();
  const greet =
    hour < 5 ? t('greet.night') : hour < 12 ? t('greet.morning') : hour < 18 ? t('greet.afternoon') : hour < 23 ? t('greet.evening') : t('greet.night');
  const dateLine = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return (
    <div className="page home">
      <header className="home-hero">
        <div>
          <div className="eyebrow">{dateLine}</div>
          <h1>{greet}</h1>
          <p className="page-sub">{t('home.subtitle')}</p>
        </div>
      </header>

      <div className="grid-home">
        <ResinCard compact />
        <RoutineCard now={now} />
        <PityCard />
        <ContinueCard now={now} />
        <AiringCard now={now} />
      </div>
    </div>
  );
}

function CardLink({ to, label }: { to: Parameters<typeof href>[0]; label: string }) {
  return (
    <a className="card-link" href={href(to)}>
      {label} <ArrowRight size={14} aria-hidden />
    </a>
  );
}

function RoutineCard({ now }: { now: number }) {
  const t = useT();
  const tasks = useStore((s) => s.tasks);
  const server = useStore((s) => s.settings.server);
  const visible = tasks.filter((x) => !x.hidden && x.period !== 'monthly');
  const done = visible.filter((x) => isTaskDone(x, now, server));
  const open = visible.filter((x) => !isTaskDone(x, now, server)).slice(0, 5);
  const left = visible.length - done.length;

  return (
    <section className="card routine-card" aria-labelledby="home-routine">
      <div className="card-head">
        <h2 id="home-routine" className="card-title">
          {t('home.routine')}
        </h2>
        <CardLink to="/teyvat" label={t('common.seeAll')} />
      </div>
      <div className="routine-top">
        <Ring value={done.length} max={visible.length || 1} size={76} stroke={7} label={t('today.progress', { done: done.length, total: visible.length })}>
          <span className="num ring-small">
            {done.length}/{visible.length}
          </span>
        </Ring>
        <div>
          <p className="strong">{left ? t.n('home.routineLeft', left) : t('home.routineDone')}</p>
          <p className="muted small">
            <Clock size={12} aria-hidden /> {t('home.dailyReset')} · {formatDuration(nextDailyReset(now, server) - now)}
          </p>
          <p className="muted small">
            <Clock size={12} aria-hidden /> {t('home.weeklyReset')} · {formatDuration(nextWeeklyReset(now, server) - now)}
          </p>
        </div>
      </div>
      {open.length > 0 && (
        <ul className="task-list compact">
          {open.map((task) => (
            <li key={task.id} className="task">
              <button type="button" className="task-check" role="checkbox" aria-checked={false} onClick={() => toggleTask(task.id, true)}>
                <span className="check-box" />
                <span className="task-label">{taskLabel(t, task)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open.length === 0 && (
        <p className="all-done">
          <Check size={16} /> {t('home.routineDone')}
        </p>
      )}
    </section>
  );
}

function PityCard() {
  const t = useT();
  const banners = useStore((s) => s.banners);
  const keys = ['character', 'weapon', 'standard'] as const;
  return (
    <section className="card pity-mini" aria-labelledby="home-pity">
      <div className="card-head">
        <h2 id="home-pity" className="card-title">
          {t('home.pity')}
        </h2>
        <CardLink to="/teyvat/wishes" label={t('common.seeAll')} />
      </div>
      <ul className="pity-mini-list">
        {keys.map((k) => {
          const b = banners[k];
          const r = RULES[k];
          const soft = b.pity5 + 1 >= r.softStart;
          return (
            <li key={k}>
              <div className="row between">
                <span>{t(`wish.banner.${k}`)}</span>
                <span className="num">
                  {soft && <Sparkles size={12} className="soft-icon" aria-label={t('wish.softPity')} />} <strong>{b.pity5}</strong>
                  <span className="muted">/{r.hard}</span>
                </span>
              </div>
              <div className="pity-track slim">
                <div className="pity-soft-zone" style={{ left: `${((r.softStart - 1) / r.hard) * 100}%` }} />
                <div className="pity-fill" style={{ width: `${(b.pity5 / r.hard) * 100}%` }} />
              </div>
              <span className="muted small">
                {k === 'weapon'
                  ? `${t('wish.fatePoint')} ${b.fatePoints}/1`
                  : b.guaranteed
                    ? t('wish.guaranteed')
                    : t('wish.fiftyFifty')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContinueCard({ now }: { now: number }) {
  const t = useT();
  const anime = useStore((s) => s.anime);
  const titleLang = useStore((s) => s.settings.titleLang);
  const step = useStepWithToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const watching = useMemo(
    () =>
      anime
        .filter((a) => a.status === 'watching')
        .sort((a, b) => Number(behindBy(b, now) > 0) - Number(behindBy(a, now) > 0) || b.updatedAt - a.updatedAt)
        .slice(0, 8),
    [anime, now],
  );

  return (
    <section className="card continue-card" aria-labelledby="home-continue">
      <div className="card-head">
        <h2 id="home-continue" className="card-title">
          {t('home.continue')}
        </h2>
        <CardLink to="/anime" label={t('common.seeAll')} />
      </div>
      {watching.length === 0 ? (
        <p className="muted">
          {t('home.continueEmpty')} <a href={href('/discover')}>{t('nav.discover')} →</a>
        </p>
      ) : (
        <ul className="continue-row">
          {watching.map((a) => {
            const title = displayTitle(a, titleLang);
            const behind = behindBy(a, now);
            const done = !!a.episodes && a.progress >= a.episodes;
            return (
              <li key={a.id} className="continue-item">
                <button type="button" className="continue-open" onClick={() => setOpenId(a.id)} aria-label={title}>
                  <Cover src={a.cover} title={title} color={a.color} />
                  {behind > 0 && <span className="badge badge-accent continue-behind">{t.n('home.behind', behind)}</span>}
                  <div className="continue-progress" aria-hidden>
                    <span style={{ width: `${a.episodes ? (a.progress / a.episodes) * 100 : 0}%` }} />
                  </div>
                </button>
                <div className="continue-meta">
                  <span className="continue-title" title={title}>
                    {title}
                  </span>
                  <span className="muted small num">
                    {a.episodes ? t('anime.episodeOf', { n: a.progress, total: a.episodes }) : t('anime.episode', { n: a.progress })}
                  </span>
                </div>
                {!done && (
                  <button type="button" className="step-btn floating" onClick={() => step(a, 1)} aria-label={`${t('anime.plusOne')}: ${title}`}>
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {openId && <AnimeSheet id={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function AiringCard({ now }: { now: number }) {
  const t = useT();
  const anime = useStore((s) => s.anime);
  const titleLang = useStore((s) => s.settings.titleLang);
  const items = useMemo(
    () =>
      anime
        .filter((a) => a.status === 'watching' || a.status === 'planning')
        .flatMap((a) => occurrences(a, now - 30 * 60_000, now + DAY))
        .sort((a, b) => a.at - b.at)
        .slice(0, 6),
    // Recompute once a minute rather than every second.
    [anime, Math.floor(now / 60_000)],
  );

  return (
    <section className="card airing-card" aria-labelledby="home-airing">
      <div className="card-head">
        <h2 id="home-airing" className="card-title">
          {t('home.airingSoon')}
        </h2>
        <CardLink to="/anime/schedule" label={t('nav.schedule')} />
      </div>
      {items.length === 0 ? (
        <p className="muted">{t('home.airingEmpty')}</p>
      ) : (
        <ul className="airing-list">
          {items.map((o) => {
            const title = displayTitle(o.entry, titleLang);
            return (
              <li key={`${o.entry.id}-${o.at}`}>
                <Cover src={o.entry.cover} title={title} color={o.entry.color} className="airing-cover" />
                <div className="airing-body">
                  <span className="airing-title">{title}</span>
                  <span className="muted small">{o.episode != null ? t('anime.episode', { n: o.episode }) : ''}</span>
                </div>
                <div className="airing-when">
                  <strong className="num">{t.time(o.at)}</strong>
                  <span className="muted small">{o.at > now ? t('common.in', { t: formatDuration(o.at - now) }) : t('schedule.live')}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

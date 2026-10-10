import { ArrowRight, Check, Clock, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ResinCard } from '../components/ResinCard';
import { PageHeader, Ring } from '../components/ui';
import { Cover, ItemIcon } from '../components/visuals';
import { findCharacter } from '../data/characters';
import { itemVisual } from './genshin/Wishes';
import { matName, useFarmToday } from './genshin/Farming';
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
  const dateLine = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return (
    <div className="page home">
      <PageHeader title={t('nav.overview')} subtitle={dateLine} actions={<AccountChip />} />
      <div className="grid-home">
        <ResinCard compact />
        <RoutineCard now={now} />
        <PityCard />
        <ContinueCard now={now} />
        <AiringCard now={now} />
        <FarmTodayCard />
      </div>
    </div>
  );
}

function AccountChip() {
  const t = useT();
  const account = useStore((s) => s.account);
  const uid = account.uid;
  if (!account.uid && !account.nickname) {
    return (
      <a className="btn btn-secondary btn-sm" href={href('/teyvat/import')}>
        {t('nav.import')}
      </a>
    );
  }
  return (
    <div className="account-chip" title={t('home.account')}>
      <strong>{account.nickname ?? 'Traveler'}</strong>
      <span className="muted num">
        {[uid && `UID ${uid}`, account.level && t('home.ar', { n: account.level }), account.worldLevel != null && t('home.wl', { n: account.worldLevel })]
          .filter(Boolean)
          .join(' · ')}
      </span>
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
  const last = banners.character.history[0] ?? banners.weapon.history[0];
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
      {last && (
        <div className="last-five">
          <span className="muted small">{t('home.lastFive')}</span>
          <span className="row gap-sm">
            <ItemIcon {...itemVisual({ name: last.name, itemType: findCharacter(last.name) ? 'character' : 'weapon', rank: 5 })} name={last.name} size={28} />
            <strong>{last.name}</strong>
            <span className="muted num">{last.pity}</span>
          </span>
        </div>
      )}
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

function FarmTodayCard() {
  const t = useT();
  const hasPlan = useStore((s) => s.farming.length > 0);
  const { weekday, open } = useFarmToday();
  if (!hasPlan) return null;
  return (
    <section className="card farm-mini" aria-labelledby="home-farm">
      <div className="card-head">
        <h2 id="home-farm" className="card-title">
          {t('home.farmToday')}
        </h2>
        <CardLink to="/teyvat/farming" label={t('nav.farming')} />
      </div>
      {open.length === 0 ? (
        <p className="muted">{t('farm.todayNone')}</p>
      ) : (
        <ul className="farm-today">
          {open.map(({ book, characters }) => (
            <li key={book.id}>
              <ItemIcon icon={book.icon} name={book.name} rarity={2} size={30} />
              <div className="farm-today-text">
                <strong>{matName(book, t.lang)}</strong>
                <span className="muted small">
                  {book.domain} · {characters.length}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {weekday === 0 && <p className="muted small">{t('farm.todaySunday')}</p>}
    </section>
  );
}

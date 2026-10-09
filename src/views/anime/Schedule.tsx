import { CalendarDays, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Empty, PageHeader } from '../../components/ui';
import { Cover } from '../../components/visuals';
import { useT } from '../../i18n';
import { displayTitle, occurrences, type Occurrence } from '../../lib/anime';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { DAY, formatDuration } from '../../lib/time';
import { syncAiring } from '../../lib/sync';
import { AnimeSheet } from './AnimeSheet';
import { AnimeTabs } from './AnimeTabs';
import { toast } from '../../components/toast';

/** Typical TV episode length used to show the "airing now" state. */
const LIVE_WINDOW = 30 * 60_000;

export function Schedule() {
  const t = useT();
  const now = useNow(30_000);
  const anime = useStore((s) => s.anime);
  const titleLang = useStore((s) => s.settings.titleLang);
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();

  const days = useMemo(() => {
    const active = anime.filter((a) => a.status === 'watching' || a.status === 'planning');
    const all: Occurrence[] = active.flatMap((a) => occurrences(a, from, from + 7 * DAY));
    // Bucket by real calendar days so DST changes don't shift items.
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(from);
      date.setDate(date.getDate() + i);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      return {
        key: date.getTime(),
        date,
        items: all.filter((o) => o.at >= date.getTime() && o.at < end.getTime()).sort((a, b) => a.at - b.at),
      };
    });
  }, [anime, from]);

  const total = days.reduce((s, d) => s + d.items.length, 0);
  const wf = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'long' });
  const df = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' });

  const sync = async () => {
    setSyncing(true);
    const ok = await syncAiring(true);
    setSyncing(false);
    toast(ok ? { message: t('anime.synced'), tone: 'success' } : { message: t('anime.syncFailed'), tone: 'error' });
  };

  return (
    <div className="page">
      <AnimeTabs />
      <PageHeader
        eyebrow={t('nav.anime')}
        title={t('schedule.title')}
        subtitle={t('schedule.subtitle')}
        actions={
          anime.some((a) => a.anilistId) && (
            <Button icon={<RefreshCw size={16} className={syncing ? 'spin' : ''} />} onClick={sync} disabled={syncing}>
              {t('anime.sync')}
            </Button>
          )
        }
      />

      {total === 0 ? (
        <Empty icon={<CalendarDays size={28} />} title={t('schedule.empty')} body={t('schedule.emptyHint')} />
      ) : (
        <div className="week">
          {days.map((d, i) => (
            <section key={d.key} className={`day ${i === 0 ? 'is-today' : ''} ${d.items.length ? '' : 'is-empty'}`} aria-label={wf.format(d.date)}>
              <header className="day-head">
                <span className="day-name">{i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : wf.format(d.date)}</span>
                <span className="muted small">{df.format(d.date)}</span>
              </header>
              <ul className="day-list">
                {d.items.map((o) => {
                  const live = o.at <= now && now < o.at + LIVE_WINDOW;
                  const past = o.at + LIVE_WINDOW <= now;
                  const title = displayTitle(o.entry, titleLang);
                  return (
                    <li key={`${o.entry.id}-${o.at}`}>
                      <button type="button" className={`slot ${past ? 'is-past' : ''} ${live ? 'is-live' : ''}`} onClick={() => setOpenId(o.entry.id)}>
                        <Cover src={o.entry.cover} title={title} color={o.entry.color} className="slot-cover" />
                        <div className="slot-body">
                          <span className="slot-time num">{t.time(o.at)}</span>
                          <span className="slot-title">{title}</span>
                          <span className="muted small">
                            {o.episode != null && t('anime.episode', { n: o.episode })}
                            {live ? ` · ${t('schedule.live')}` : past ? ` · ${t('schedule.aired')}` : ` · ${t('common.in', { t: formatDuration(o.at - now) })}`}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {openId && <AnimeSheet id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

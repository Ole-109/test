import { ChartNoAxesColumn, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Columns, HBars, StackedBar, type Datum } from '../../components/charts';
import { Empty, IconButton, PageHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { STATUSES } from '../../lib/anime';
import { useStore } from '../../lib/store';
import { AnimeTabs } from './AnimeTabs';
import { genreLabel } from './labels';

/** Episodes counted per entry, including rewatches. */
const watched = (a: { progress: number; rewatches: number; episodes?: number }) => a.progress + a.rewatches * (a.episodes ?? 0);

export function Stats() {
  const t = useT();
  const anime = useStore((s) => s.anime);
  const [table, setTable] = useState(false);

  const s = useMemo(() => {
    const episodes = anime.reduce((n, a) => n + watched(a), 0);
    const minutes = anime.reduce((n, a) => n + watched(a) * (a.duration ?? 24), 0);
    const scored = anime.filter((a) => a.score > 0);
    const mean = scored.length ? scored.reduce((n, a) => n + a.score, 0) / scored.length : 0;
    const completed = anime.filter((a) => a.status === 'completed').length;
    const byStatus: Datum[] = STATUSES.map((st) => ({
      key: st,
      label: t(`anime.status.${st}`),
      value: anime.filter((a) => a.status === st).length,
      color: `var(--st-${st})`,
    }));
    const genreMap = new Map<string, number>();
    for (const a of anime) for (const g of a.genres) genreMap.set(g, (genreMap.get(g) ?? 0) + watched(a));
    const genres: Datum[] = [...genreMap]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g, v]) => ({ key: g, label: genreLabel(t, g), value: v }));
    const scores: Datum[] = Array.from({ length: 10 }, (_, i) => ({
      key: String(i + 1),
      label: String(i + 1),
      value: anime.filter((a) => a.score === i + 1).length,
    }));
    return { episodes, minutes, mean, completed, byStatus, genres, scores, scoredCount: scored.length };
  }, [anime, t]);

  const pct = (v: number) => t.num(v, { style: 'percent', maximumFractionDigits: 0 });
  const days = s.minutes / 1440;

  return (
    <div className="page">
      <AnimeTabs />
      <PageHeader
       
        title={t('stats.title')}
        subtitle={t('stats.subtitle')}
        actions={
          anime.length > 0 && (
            <IconButton label={table ? t('stats.chart') : t('stats.table')} onClick={() => setTable((x) => !x)} active={table}>
              {table ? <ChartNoAxesColumn size={18} /> : <Table2 size={18} />}
            </IconButton>
          )
        }
      />

      {anime.length === 0 ? (
        <Empty icon={<ChartNoAxesColumn size={28} />} title={t('stats.empty')} />
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="muted small">{t('stats.episodes')}</span>
              <strong>{t.num(s.episodes)}</strong>
            </div>
            <div className="stat-tile">
              <span className="muted small">{t('stats.time')}</span>
              <strong>
                {days >= 1
                  ? t.n('stats.days', Math.round(days * 10) / 10, { n: t.num(days, { maximumFractionDigits: 1 }) })
                  : t('stats.hours', { n: t.num(s.minutes / 60, { maximumFractionDigits: 1 }) })}
              </strong>
            </div>
            <div className="stat-tile">
              <span className="muted small">{t('stats.meanScore')}</span>
              <strong>{s.scoredCount ? t.num(s.mean, { maximumFractionDigits: 1 }) : '—'}</strong>
            </div>
            <div className="stat-tile">
              <span className="muted small">{t('stats.completed')}</span>
              <strong>{t.num(s.completed)}</strong>
            </div>
          </div>

          <div className="grid-stats">
            <section className="card" aria-labelledby="st-status">
              <h2 id="st-status" className="card-title">
                {t('stats.byStatus')}
              </h2>
              {table ? (
                <DataTable head={[t('anime.status'), t('stats.titles'), t('stats.share')]} rows={s.byStatus.map((d) => [d.label, t.num(d.value), pct(d.value / (anime.length || 1))])} />
              ) : (
                <StackedBar data={s.byStatus} label={t('stats.byStatus')} format={(d, share) => `${t.num(d.value)} · ${pct(share)}`} />
              )}
            </section>

            {s.genres.length > 0 && (
              <section className="card" aria-labelledby="st-genres">
                <h2 id="st-genres" className="card-title">
                  {t('stats.genres')}
                </h2>
                <p className="muted small">{t('stats.genresHint')}</p>
                {table ? (
                  <DataTable head={[t('anime.genres'), t('stats.episodes')]} rows={s.genres.map((d) => [d.label, t.num(d.value)])} />
                ) : (
                  <HBars data={s.genres} label={t('stats.genres')} format={(v) => t.num(v)} />
                )}
              </section>
            )}

            {s.scoredCount > 0 && (
              <section className="card" aria-labelledby="st-scores">
                <h2 id="st-scores" className="card-title">
                  {t('stats.scores')}
                </h2>
                <p className="muted small">{t('stats.scoresHint')}</p>
                {table ? (
                  <DataTable head={[t('anime.score'), t('stats.titles')]} rows={s.scores.map((d) => [d.label, t.num(d.value)])} />
                ) : (
                  <Columns data={s.scores} label={t('stats.scores')} tip={(d) => `${d.label}/10 · ${t.num(d.value)}`} />
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={i > 0 ? 'num' : ''}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])}>
            {r.map((c, i) => (
              <td key={i} className={i > 0 ? 'num' : ''}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

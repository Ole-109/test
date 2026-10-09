import { ChevronLeft, ChevronRight, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Empty, IconButton, PageHeader } from '../../components/ui';
import { ItemIcon } from '../../components/visuals';
import { findCharacter, findWeapon, localName } from '../../data/characters';
import { useT, type T } from '../../i18n';
import { analyzePool, POOL_OF, sortRecords, type PoolStats, type PulledItem } from '../../core/wishStats';
import { RULES } from '../../lib/gacha';
import { setWishOverride } from '../../lib/importActions';
import { href, navigate } from '../../lib/router';
import { useStore } from '../../lib/store';
import type { BannerKey, WishRecord } from '../../lib/types';
import { PityCard } from './ManualPity';
import { pct } from './Planner';
import { TeyvatTabs } from './TeyvatTabs';

const BANNERS: BannerKey[] = ['character', 'weapon', 'standard', 'chronicled'];
const PAGE = 30;

export function itemVisual(r: Pick<WishRecord, 'name' | 'itemType' | 'rank'>) {
  if (r.itemType === 'character') {
    const c = findCharacter(r.name);
    return { icon: c?.icon, rarity: c?.rarity ?? r.rank };
  }
  const w = findWeapon(r.name);
  return { icon: w?.icon, rarity: w?.rarity ?? r.rank };
}

function shortDate(t: T, time: string) {
  const d = new Date(time.replace(' ', 'T'));
  return new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function BannerSummary({ pool, stats, active, onSelect }: { pool: BannerKey; stats: PoolStats; active: boolean; onSelect: () => void }) {
  const t = useT();
  const manual = useStore((s) => s.banners[pool]);
  const rules = RULES[pool];
  const pity5 = stats.total ? stats.pity5 : manual.pity5;
  const pity4 = stats.total ? stats.pity4 : manual.pity4;
  const total = stats.total || manual.total;
  const soft = pity5 + 1 >= rules.softStart;
  return (
    <button type="button" className={`banner-sum ${active ? 'is-active' : ''}`} onClick={onSelect} aria-pressed={active}>
      <div className="banner-sum-head">
        <span>{t(`wish.banner.${pool}`)}</span>
        <span className="muted small num">{t.num(total)}</span>
      </div>
      <div className="banner-sum-pity">
        <strong className={`num ${soft ? 'text-r5' : ''}`}>{pity5}</strong>
        <span className="muted">/{rules.hard}</span>
        <span className="banner-sum-four num">
          <span className="text-r4">4★</span> {pity4}/10
        </span>
      </div>
      <div className="meter">
        <span style={{ width: `${(pity5 / rules.hard) * 100}%` }} className={soft ? 'soft' : ''} />
        <i style={{ left: `${((rules.softStart - 1) / rules.hard) * 100}%` }} />
      </div>
      <span className="muted small">
        {pool === 'character' || pool === 'chronicled'
          ? (stats.total ? stats.guaranteed : manual.guaranteed)
            ? t('wish.guaranteed')
            : t('wish.fiftyFifty')
          : pool === 'weapon'
            ? `${t('wish.fatePoint')} ${manual.fatePoints}/1`
            : ' '}
      </span>
    </button>
  );
}

function FiveList({ stats, pool }: { stats: PoolStats; pool: BannerKey }) {
  const t = useT();
  const hard = RULES[pool].hard;
  const soft = RULES[pool].softStart;
  if (!stats.five.length) return <p className="muted pad">{t('wish.noFive')}</p>;
  return (
    <ul className="five-list">
      <li className="five-row is-current">
        <span className="five-current muted small">{t('wish.sinceLast', { n: stats.pity5 })}</span>
        <div className="pitybar">
          <span style={{ width: `${(stats.pity5 / hard) * 100}%` }} />
        </div>
        <span className="num">{stats.pity5}</span>
      </li>
      {stats.fiveNewestFirst.map((f: PulledItem) => {
        const v = itemVisual(f.record);
        const cycle = () => setWishOverride(f.record.id, f.outcome === 'won' ? 'lost' : 'won');
        return (
          <li key={f.record.id} className="five-row">
            <ItemIcon icon={v.icon} name={f.record.name} rarity={5} size={40} />
            <div className="five-name">
              <strong>{localName(f.record.name, t.lang)}</strong>
              <span className="muted small">
                {shortDate(t, f.record.time)}
                {f.record.gachaType === '400' && ` · ${t('wish.second')}`}
              </span>
            </div>
            {f.outcome === 'won' || f.outcome === 'lost' ? (
              <button type="button" className={`outcome outcome-${f.outcome}`} onClick={cycle} title={t('wish.overrideHint')}>
                {t(`wish.outcome.${f.outcome}`)}
              </button>
            ) : f.outcome === 'guaranteed' ? (
              <span className="outcome outcome-guaranteed">{t('wish.outcome.guaranteed')}</span>
            ) : (
              <span />
            )}
            <div className="pitybar">
              <span style={{ width: `${(f.pity / hard) * 100}%` }} className={f.pity >= soft ? 'soft' : ''} />
            </div>
            <span className={`num pity-num ${f.pity >= soft ? 'text-r5' : ''}`}>{f.pity}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StatsTable({ stats }: { stats: PoolStats }) {
  const t = useT();
  const total = stats.total || 1;
  const rows: [string, string, string?][] = [
    [t('wish.lifetime'), t.num(stats.total), t('wish.primosSpent', { n: t.num(stats.total * 160) })],
    [`${t('wish.fiveStars')}`, t.num(stats.five.length), pct(stats.five.length / total, t.lang)],
    [`${t('wish.fourStars')}`, t.num(stats.four.length), pct(stats.four.length / total, t.lang)],
    [`${t('wish.threeStars')}`, t.num(stats.threeCount), pct(stats.threeCount / total, t.lang)],
    [t('wish.avgPity') + ' 5★', stats.five.length ? t.num(Math.round(stats.avgPity5 * 10) / 10) : '—'],
    [t('wish.avgPity') + ' 4★', stats.four.length ? t.num(Math.round(stats.avgPity4 * 10) / 10) : '—'],
  ];
  if (stats.pool === 'character') rows.push([t('wish.winRate'), `${stats.fiftyWon} / ${stats.fiftyWon + stats.fiftyLost}`, stats.fiftyWon + stats.fiftyLost ? pct(stats.fiftyWon / (stats.fiftyWon + stats.fiftyLost), t.lang) : undefined]);
  return (
    <table className="kv">
      <tbody>
        {rows.map(([k, v, extra]) => (
          <tr key={k}>
            <th>{k}</th>
            <td className="num">{v}</td>
            <td className="num muted">{extra ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FourSummary({ stats }: { stats: PoolStats }) {
  const counts = useMemo(() => {
    const m = new Map<string, { r: WishRecord; n: number }>();
    for (const f of stats.four) {
      const e = m.get(f.record.name);
      if (e) e.n++;
      else m.set(f.record.name, { r: f.record, n: 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.r.name.localeCompare(b.r.name));
  }, [stats]);
  if (!counts.length) return null;
  return (
    <div className="four-grid">
      {counts.map(({ r, n }) => {
        const v = itemVisual(r);
        return (
          <div key={r.name} className="four-item" title={r.name}>
            <ItemIcon icon={v.icon} name={r.name} rarity={4} size={44} badge={`×${n}`} />
          </div>
        );
      })}
    </div>
  );
}

function PullLog({ records, pool }: { records: WishRecord[]; pool: BannerKey }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [ranks, setRanks] = useState<Set<number>>(new Set([3, 4, 5]));
  const [page, setPage] = useState(0);

  // Pity at each pull (pulls since the previous item of the same or higher rarity).
  const rows = useMemo(() => {
    const asc = sortRecords(records.filter((r) => POOL_OF[r.gachaType] === pool));
    let s5 = 0;
    let s4 = 0;
    const out = asc.map((r) => {
      s5++;
      s4++;
      const pity = r.rank === 5 ? s5 : r.rank === 4 ? s4 : s5;
      if (r.rank === 5) s5 = s4 = 0;
      else if (r.rank === 4) s4 = 0;
      return { r, pity };
    });
    return out.reverse();
  }, [records, pool]);

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(
    ({ r }) => ranks.has(r.rank) && (!needle || r.name.toLowerCase().includes(needle) || localName(r.name, t.lang).toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <section className="card" aria-labelledby="log-h">
      <div className="card-head">
        <h2 id="log-h" className="card-title">
          {t('wish.log')}
        </h2>
        <div className="row gap-sm wrap">
          {[5, 4, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={`chip-toggle text-r${n} ${ranks.has(n) ? 'is-on' : ''}`}
              aria-pressed={ranks.has(n)}
              onClick={() => {
                const next = new Set(ranks);
                if (next.has(n)) next.delete(n);
                else next.add(n);
                setRanks(next);
                setPage(0);
              }}
            >
              {n}★
            </button>
          ))}
          <label className="search search-sm">
            <Search size={14} aria-hidden />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder={t('wish.logSearch')}
              aria-label={t('wish.logSearch')}
            />
          </label>
        </div>
      </div>
      <div className="table-wrap">
        <table className="log-table">
          <thead>
            <tr>
              <th>{t('wish.colItem')}</th>
              <th>{t('wish.colType')}</th>
              <th className="num">{t('wish.colPity')}</th>
              <th>{t('wish.colTime')}</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(({ r, pity }) => {
              const v = itemVisual(r);
              return (
                <tr key={r.id} className={`rank-${r.rank}`}>
                  <td>
                    <span className="log-item">
                      <ItemIcon icon={v.icon} name={r.name} rarity={r.rank} size={26} />
                      <span className={r.rank > 3 ? `text-r${r.rank}` : ''}>{localName(r.name, t.lang)}</span>
                    </span>
                  </td>
                  <td className="muted">{r.itemType === 'character' ? t('wish.character') : t('wish.weapon')}</td>
                  <td className="num">{r.rank > 3 ? pity : ''}</td>
                  <td className="muted num nowrap">{r.time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="muted small">
          {t('wish.showing', { from: filtered.length ? cur * PAGE + 1 : 0, to: cur * PAGE + slice.length, total: t.num(filtered.length) })}
        </span>
        <div className="row gap-xs">
          <IconButton label={t('wish.prev')} disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <span className="num small">
            {cur + 1}/{pages}
          </span>
          <IconButton label={t('wish.next')} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            <ChevronRight size={16} />
          </IconButton>
        </div>
      </div>
    </section>
  );
}

export function Wishes() {
  const t = useT();
  const wishes = useStore((s) => s.wishes);
  const overrides = useStore((s) => s.wishMeta.overrides);
  const [pool, setPool] = useState<BannerKey>('character');
  const stats = useMemo(
    () => Object.fromEntries(BANNERS.map((b) => [b, analyzePool(b, wishes, overrides)])) as Record<BannerKey, PoolStats>,
    [wishes, overrides],
  );
  const st = stats[pool];

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader
        title={t('wish.title')}
        subtitle={t('wish.subtitle')}
        actions={
          <Button icon={<Upload size={16} />} variant={wishes.length ? 'secondary' : 'primary'} onClick={() => navigate('/teyvat/import')}>
            {t('wish.importCta')}
          </Button>
        }
      />

      <div className="banner-sums">
        {BANNERS.map((b) => (
          <BannerSummary key={b} pool={b} stats={stats[b]} active={pool === b} onSelect={() => setPool(b)} />
        ))}
      </div>

      {st.total === 0 ? (
        <>
          {wishes.length === 0 && (
            <Empty
              icon={<Upload size={26} />}
              title={t('wish.emptyTitle')}
              body={t('wish.emptyBody')}
              action={
                <a className="btn btn-primary btn-md" href={href('/teyvat/import')}>
                  <Upload size={16} />
                  <span>{t('wish.importCta')}</span>
                </a>
              }
            />
          )}
          <PityCard banner={pool} />
        </>
      ) : (
        <>
          <div className="wish-grid">
            <section className="card" aria-labelledby="five-h">
              <h2 id="five-h" className="card-title">
                {t('wish.history')} · {t(`wish.banner.${pool}`)}
              </h2>
              <FiveList stats={st} pool={pool} />
            </section>
            <div className="stack">
              <section className="card" aria-label={t('wish.title')}>
                <StatsTable stats={st} />
              </section>
              {st.four.length > 0 && (
                <section className="card" aria-labelledby="four-h">
                  <h2 id="four-h" className="card-title">
                    {t('wish.fourList')}
                  </h2>
                  <FourSummary stats={st} />
                </section>
              )}
            </div>
          </div>
          <PullLog records={wishes} pool={pool} />
          <details className="card manual-details">
            <summary className="card-title">{t('wish.manual')}</summary>
            <p className="muted small">{t('wish.manualHint')}</p>
            <PityCard banner={pool} />
          </details>
        </>
      )}
    </div>
  );
}

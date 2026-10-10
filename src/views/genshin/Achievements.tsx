import { BookOpen, Check, Download, Loader2, RotateCcw, Search, Trophy, Upload } from 'lucide-react';
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from '../../components/toast';
import { Button, Empty, PageHeader, Ring, Segmented } from '../../components/ui';
import { iconUrl } from '../../data/characters';
import {
  hoyowikiUrl,
  loadAchievements,
  progressOf,
  stepsDone,
  toUiaf,
  type Achievement,
  type AchievementCategory,
  type AchievementData,
  type Done,
} from '../../core/achievements';
import { useT, type T } from '../../i18n';
import { resetAchievements, restore, setAchievementSteps, snapshot } from '../../lib/actions';
import { navigate } from '../../lib/router';
import { useStore } from '../../lib/store';
import { TeyvatTabs } from './TeyvatTabs';

type Filter = 'all' | 'open' | 'done';
const PRIMO = iconUrl('UI_ItemIcon_201');
const verKey = (v: string) => v.split('.').map(Number);
const cmpVer = (a: string, b: string) => {
  const x = verKey(a);
  const y = verKey(b);
  return x[0] - y[0] || (x[1] ?? 0) - (y[1] ?? 0);
};

function useAchievementData() {
  const [data, setData] = useState<AchievementData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAchievements().then(
      (d) => alive && setData(d),
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { data, error };
}

const title = (a: Achievement, de: boolean) => (de ? a.titleDe : a.title);
const catName = (c: AchievementCategory, de: boolean) => (de ? c.nameDe : c.name);

function download(name: string, json: unknown) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Row = memo(function Row({ a, n, t, category, completedAt }: { a: Achievement; n: number; t: T; category?: string; completedAt?: number }) {
  const de = t.lang === 'de';
  const tiers = a.steps.length;
  const complete = n === tiers;
  // Show the next open tier; finished achievements show their last tier.
  const step = a.steps[Math.min(n, tiers - 1)];
  const stepTitle = (de ? step.titleDe : step.title) ?? title(a, de);
  const desc = de ? step.descDe : step.desc;
  const reward = complete ? a.steps.reduce((s, x) => s + x.reward, 0) : step.reward;
  const df = new Intl.DateTimeFormat(de ? 'de-DE' : 'en-US', { dateStyle: 'medium' });
  const doneTitle = complete && completedAt ? t('ach.completedOn', { date: df.format(completedAt) }) : undefined;
  return (
    <li className={`ach ${complete ? 'is-done' : ''}`} title={doneTitle}>
      <button
        type="button"
        role="checkbox"
        aria-checked={complete ? true : n > 0 ? 'mixed' : false}
        aria-label={`${t('ach.markDone')}: ${title(a, de)}`}
        className="ach-check"
        onClick={() => setAchievementSteps(a, complete ? 0 : tiers)}
      >
        {complete ? <Check size={14} strokeWidth={3} /> : n > 0 ? <span className="ach-partial" /> : null}
      </button>
      <div className="ach-body">
        <div className="ach-title">
          <strong>{stepTitle}</strong>
          {category && <span className="ach-cat">{category}</span>}
        </div>
        <p className="ach-desc">{desc}</p>
        {(de ? a.questDe : a.quest) && (
          <p className="ach-quest">
            {t('ach.questLabel')}{' '}
            {a.wiki ? (
              <a href={hoyowikiUrl(a.wiki, t.lang)} target="_blank" rel="noreferrer" className="ach-wiki" title={t('ach.wikiTitle')}>
                {de ? a.questDe : a.quest}
                <span className="ach-wiki-tag">
                  <BookOpen size={11} aria-hidden />
                  HoYoWiki
                </span>
              </a>
            ) : (
              <span>{de ? a.questDe : a.quest}</span>
            )}
          </p>
        )}
      </div>
      {tiers > 1 && (
        <div className="ach-tiers" role="group" aria-label={title(a, de)}>
          {a.steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={i < n}
              className={i < n ? 'is-on' : ''}
              title={`${t('ach.tier', { n: i + 1 })} · ${de ? s.descDe : s.desc} · ${s.reward}`}
              onClick={() => setAchievementSteps(a, n === i + 1 ? i : i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <span className="ach-ver" title={t('ach.versionN', { v: a.ver })}>
        {a.ver}
      </span>
      <span className="ach-reward num">
        <img src={PRIMO} alt="" width={18} height={18} loading="lazy" />
        {reward}
      </span>
    </li>
  );
});

function CategoryList({
  categories,
  done,
  active,
  onPick,
  t,
}: {
  categories: AchievementCategory[];
  done: Done;
  active: number | 'all';
  onPick: (id: number | 'all') => void;
  t: T;
}) {
  const de = t.lang === 'de';
  return (
    <nav className="ach-cats card" aria-label={t('ach.category')}>
      <ul>
        {categories.map((c) => {
          const p = progressOf(c.items, done);
          const full = p.done === p.steps;
          return (
            <li key={c.id}>
              <button type="button" className={`ach-cat-btn ${active === c.id ? 'is-active' : ''}`} aria-current={active === c.id || undefined} onClick={() => onPick(c.id)}>
                <img src={iconUrl(c.icon)} alt="" width={30} height={30} loading="lazy" />
                <span className="ach-cat-text">
                  <span className="ach-cat-name">{catName(c, de)}</span>
                  <span className="ach-cat-bar" aria-hidden>
                    <span style={{ width: `${(p.done / Math.max(1, p.steps)) * 100}%` }} className={full ? 'is-full' : ''} />
                  </span>
                </span>
                <span className="ach-cat-count num">
                  {p.done}/{p.steps}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Achievements() {
  const t = useT();
  const de = t.lang === 'de';
  const { data, error } = useAchievementData();
  const done = useStore((s) => s.achievements.done);
  const meta = useStore((s) => s.achievements);
  const [active, setActive] = useState<number | 'all'>(() => {
    try {
      const v = sessionStorage.getItem('waypoint:ach-cat');
      return v == null || v === 'all' ? 'all' : Number(v);
    } catch {
      return 'all';
    }
  });
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());
  const [filter, setFilter] = useState<Filter>('open');
  const [version, setVersion] = useState('');

  const pick = (id: number | 'all') => {
    setActive(id);
    try {
      sessionStorage.setItem('waypoint:ach-cat', String(id));
    } catch {
      /* private mode */
    }
    document.querySelector('.ach-main')?.scrollIntoView({ block: 'nearest' });
  };

  const versions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const c of data.categories) for (const a of c.items) set.add(a.ver);
    return [...set].sort((a, b) => cmpVer(b, a));
  }, [data]);

  const total = useMemo(() => (data ? progressOf(data.categories.flatMap((c) => c.items), done) : null), [data, done]);

  const rows = useMemo(() => {
    if (!data) return [];
    // A search looks through every category.
    const cats = query || active === 'all' ? data.categories : data.categories.filter((c) => c.id === active);
    const out: { a: Achievement; n: number; cat?: string }[] = [];
    for (const c of cats) {
      for (const a of c.items) {
        if (version && a.ver !== version) continue;
        const n = stepsDone(a, done);
        const complete = n === a.steps.length;
        if (filter === 'open' && complete) continue;
        if (filter === 'done' && n === 0) continue;
        if (query) {
          const hay = `${a.title} ${a.titleDe} ${a.steps.map((s) => (de ? s.descDe : s.desc)).join(' ')} ${(de ? a.questDe : a.quest) ?? ''}`.toLowerCase();
          if (!hay.includes(query)) continue;
        }
        out.push({ a, n, cat: query || active === 'all' ? catName(c, de) : undefined });
      }
    }
    return out;
  }, [data, active, query, filter, version, done, de]);

  const activeCat = data && active !== 'all' ? data.categories.find((c) => c.id === active) : undefined;
  const activeProgress = activeCat ? progressOf(activeCat.items, done) : total;
  const latest = versions[0];
  const df = new Intl.DateTimeFormat(de ? 'de-DE' : 'en-US', { dateStyle: 'medium' });

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader
        title={t('ach.title')}
        subtitle={t('ach.subtitle')}
        actions={
          <>
            <Button
              icon={<Upload size={16} />}
              onClick={() => {
                try {
                  sessionStorage.setItem('waypoint:import-tab', 'file');
                } catch {
                  /* private mode: the import page opens on its first tab */
                }
                navigate('/teyvat/import');
              }}
            >
              {t('ach.import')}
            </Button>
            <Button
              icon={<Download size={16} />}
              disabled={!data || !Object.keys(done).length}
              onClick={() => data && download(`uiaf-waypoint-${new Date().toISOString().slice(0, 10)}.json`, toUiaf(data, done))}
            >
              {t('ach.exportUiaf')}
            </Button>
          </>
        }
      />

      {!data ? (
        <div className="card ach-loading" role="status">
          {error ? t('settings.importFailed') : <><Loader2 size={16} className="spin" /> {t('ach.loading')}</>}
        </div>
      ) : (
        <>
          <section className="card ach-summary" aria-label={t('ach.title')}>
            <Ring value={total!.done} max={total!.steps} size={64} stroke={6} label={t('ach.progress', { done: total!.done, total: total!.steps })}>
              <span className="ach-pct num">{Math.floor((total!.done / Math.max(1, total!.steps)) * 100)}%</span>
            </Ring>
            <div>
              <p className="ach-summary-main">{t('ach.progress', { done: t.num(total!.done), total: t.num(total!.steps) })}</p>
              <p className="ach-summary-sub">
                <img src={PRIMO} alt="" width={18} height={18} />
                {t('ach.primos', { done: t.num(total!.primosDone), total: t.num(total!.primos) })}
              </p>
              {meta.importedAt && meta.source && (
                <p className="muted small">{t('ach.imported', { source: meta.source, date: df.format(meta.importedAt) })}</p>
              )}
            </div>
            {Object.keys(done).length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="ach-reset"
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  if (!window.confirm(t('ach.resetConfirm'))) return;
                  const before = snapshot();
                  resetAchievements();
                  toast({ message: t('ach.resetDone'), action: { label: t('common.undo'), run: () => restore(before) } });
                }}
              >
                {t('ach.reset')}
              </Button>
            )}
          </section>

          <div className="ach-layout">
            <div className="ach-side">
              <button type="button" className={`ach-cat-btn ach-all ${active === 'all' ? 'is-active' : ''}`} onClick={() => pick('all')}>
                <Trophy size={18} />
                <span className="ach-cat-text">
                  <span className="ach-cat-name">{t('ach.all')}</span>
                </span>
                <span className="ach-cat-count num">
                  {total!.done}/{total!.steps}
                </span>
              </button>
              <CategoryList categories={data.categories} done={done} active={active} onPick={pick} t={t} />
            </div>

            <section className="ach-main" aria-label={activeCat ? catName(activeCat, de) : t('ach.all')}>
              <div className="toolbar">
                <select
                  className="select ach-cat-select"
                  value={String(active)}
                  onChange={(e) => pick(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  aria-label={t('ach.category')}
                >
                  <option value="all">{t('ach.all')}</option>
                  {data.categories.map((c) => {
                    const p = progressOf(c.items, done);
                    return (
                      <option key={c.id} value={c.id}>
                        {catName(c, de)} ({p.done}/{p.steps})
                      </option>
                    );
                  })}
                </select>
                <label className="search">
                  <Search size={16} aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ach.search')} aria-label={t('ach.search')} type="search" />
                </label>
                <Segmented
                  label={t('ach.title')}
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'open', label: t('ach.filter.open') },
                    { value: 'done', label: t('ach.filter.done') },
                    { value: 'all', label: t('ach.filter.all') },
                  ]}
                />
                <select className="select" value={version} onChange={(e) => setVersion(e.target.value)} aria-label={t('ach.allVersions')}>
                  <option value="">{t('ach.allVersions')}</option>
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                      {v === latest ? ` · ${t('ach.versionNew')}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ach-head">
                <h2 className="card-title">{query ? t.n('ach.resultCount', rows.length) : activeCat ? catName(activeCat, de) : t('ach.all')}</h2>
                {!query && activeProgress && (
                  <span className="muted small num">
                    {activeProgress.done}/{activeProgress.steps} · <img src={PRIMO} alt="" width={14} height={14} /> {t.num(activeProgress.primosDone)}/
                    {t.num(activeProgress.primos)}
                  </span>
                )}
              </div>

              {rows.length === 0 ? (
                <Empty icon={<Trophy size={26} />} title={t('ach.empty')} body={t('ach.emptyBody')} />
              ) : (
                <ul className="ach-list card">
                  {rows.map(({ a, n, cat }) => (
                    <Row key={a.id} a={a} n={n} t={t} category={cat} completedAt={done[a.steps[a.steps.length - 1].id]} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

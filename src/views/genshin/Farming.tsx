import { CalendarCheck, Pickaxe, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, IconButton, PageHeader, Stepper } from '../../components/ui';
import { CharacterIcon, ItemIcon } from '../../components/visuals';
import { BASE_CHARACTERS } from '../../data/characters';
import {
  bookSeriesOf,
  combine,
  haveOf,
  isOpenOn,
  keyMaterials,
  MATERIALS,
  requirementFor,
  resinEstimate,
  type MatKind,
  type MaterialDef,
} from '../../core/farming';
import { useT, type T } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { addFarmTarget, patchFarmTarget, removeFarmTarget } from '../../lib/actions';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { serverWeekday } from '../../lib/time';
import { setUI } from '../../lib/ui';
import type { CharacterDef } from '../../lib/types';
import { TeyvatTabs } from './TeyvatTabs';

const KIND_ORDER: MatKind[] = ['book', 'crown', 'weekly', 'boss', 'gem', 'local', 'common', 'other'];

export const matName = (m: MaterialDef, lang: string) => (lang === 'de' ? m.nameDe : m.name);

export function dayNames(t: T, days: number[]) {
  const f = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' });
  // 2023-01-01 was a Sunday.
  return days
    .filter((d) => d !== 0)
    .map((d) => f.format(new Date(2023, 0, 1 + d)))
    .join('/');
}

/** Talent book domains open today for the characters in the plan. */
export function useFarmToday() {
  const now = useNow(60_000);
  const server = useStore((s) => s.settings.server);
  const farming = useStore((s) => s.farming);
  const characters = useStore((s) => s.characters);
  const materials = useStore((s) => s.inventory.materials);
  const weekday = serverWeekday(now, server);
  const open = useMemo(() => {
    const out = new Map<string, { book: MaterialDef; characters: string[] }>();
    for (const f of farming) {
      const cur = characters[f.id];
      const req = requirementFor(f.id, { level: cur?.level ?? 1, ascension: cur?.ascension, talents: cur?.talents ?? [1, 1, 1] }, f);
      // Book series this character still needs (after what's in the inventory).
      const needed = new Set<string>();
      for (const [id, n] of req.items) {
        const m = MATERIALS[id];
        if (m?.kind === 'book' && n > haveOf(materials, id)) needed.add(String(Number(id) - (m.rank - 2)));
      }
      for (const green of bookSeriesOf(f.id)) {
        if (!needed.has(green)) continue;
        const book = MATERIALS[green];
        if (!book || !isOpenOn(book, weekday)) continue;
        const e = out.get(green) ?? { book, characters: [] };
        e.characters.push(f.id);
        out.set(green, e);
      }
    }
    return [...out.values()];
  }, [farming, characters, materials, weekday]);
  return { weekday, open };
}

function TodayCard() {
  const t = useT();
  const { weekday, open } = useFarmToday();
  const byId = useMemo(() => new Map(BASE_CHARACTERS.map((c) => [c.id, c])), []);
  return (
    <section className="card" aria-labelledby="farm-today">
      <h2 id="farm-today" className="card-title">
        <CalendarCheck size={16} /> {t('farm.today')}
      </h2>
      {weekday === 0 && <p className="muted small">{t('farm.todaySunday')}</p>}
      {open.length === 0 ? (
        <p className="muted">{t('farm.todayNone')}</p>
      ) : (
        <ul className="farm-today">
          {open.map(({ book, characters }) => (
            <li key={book.id}>
              <ItemIcon icon={book.icon} name={book.name} rarity={2} size={34} />
              <div className="farm-today-text">
                <strong>{matName(book, t.lang)}</strong>
                <span className="muted small">{book.domain}</span>
              </div>
              <span className="farm-today-chars">
                {characters.map((id) => {
                  const c = byId.get(id);
                  return c ? <CharacterIcon key={id} c={c} size={26} /> : null;
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanRow({ c }: { c: CharacterDef }) {
  const t = useT();
  const target = useStore((s) => s.farming.find((f) => f.id === c.id))!;
  const cur = useStore((s) => s.characters[c.id]);
  const curLevel = cur?.level ?? 1;
  const curTalents = cur?.talents ?? [1, 1, 1];
  const keys = keyMaterials(c.id);
  const talentLabels: MessageKey[] = ['chars.talentNA', 'chars.talentE', 'chars.talentQ'];

  return (
    <li className="plan-row">
      <CharacterIcon c={c} size={48} />
      <div className="plan-main">
        <div className="plan-head">
          <strong>{t.lang === 'de' && c.nameDe ? c.nameDe : c.name}</strong>
          <span className="plan-keys">
            {keys.map((m) => (
              <span key={m.id} className="plan-key" title={`${matName(m, t.lang)}${m.days ? ` · ${dayNames(t, m.days)}` : m.from ? ` · ${m.from}` : ''}`}>
                <ItemIcon icon={m.icon} name={m.name} rarity={m.rank} size={22} />
                {m.days && <span className="muted small">{dayNames(t, m.days)}</span>}
              </span>
            ))}
          </span>
        </div>
        {cur?.detailsKnown === false && (
          <button type="button" className="plan-hint" onClick={() => setUI({ characterId: c.id })}>
            {t('farm.unknownLevel')}
          </button>
        )}
        <div className="plan-goals">
          <label className="plan-goal">
            <span className="muted small">
              {t('farm.level')} {curLevel} →
            </span>
            <select
              className="select select-sm"
              value={target.level}
              onChange={(e) => patchFarmTarget(c.id, { level: Number(e.target.value) })}
              aria-label={t('farm.level')}
            >
              {[...new Set([40, 50, 60, 70, 80, 90, target.level])]
                .filter((l) => l >= curLevel || l === target.level)
                .sort((a, b) => a - b)
                .map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
            </select>
          </label>
          {talentLabels.map((k, i) => (
            <label key={k} className="plan-goal">
              <span className="muted small">
                {t(k)} {curTalents[i]} →
              </span>
              <Stepper
                size="sm"
                label={t(k)}
                value={target.talents[i]}
                min={curTalents[i]}
                max={10}
                onChange={(v) => {
                  const talents = [...target.talents] as [number, number, number];
                  talents[i] = v;
                  patchFarmTarget(c.id, { talents });
                }}
              />
            </label>
          ))}
        </div>
      </div>
      <IconButton label={t('farm.remove')} onClick={() => removeFarmTarget(c.id)}>
        <Trash2 size={16} />
      </IconButton>
    </li>
  );
}

export function Farming() {
  const t = useT();
  const farming = useStore((s) => s.farming);
  const characters = useStore((s) => s.characters);
  const materials = useStore((s) => s.inventory.materials);
  const [pick, setPick] = useState('');
  const hasInventory = Object.keys(materials).length > 0;
  const byId = useMemo(() => new Map(BASE_CHARACTERS.map((c) => [c.id, c])), []);

  const total = useMemo(
    () =>
      combine(
        farming.map((f) => {
          const cur = characters[f.id];
          return requirementFor(f.id, { level: cur?.level ?? 1, ascension: cur?.ascension, talents: cur?.talents ?? [1, 1, 1] }, f);
        }),
      ),
    [farming, characters],
  );

  const rows = useMemo(() => {
    const list = [...total.items].map(([id, need]) => {
      const m = MATERIALS[id];
      const have = haveOf(materials, id);
      return { m, need, have, missing: Math.max(0, need - have) };
    });
    return list
      .filter((r) => r.m)
      .sort((a, b) => KIND_ORDER.indexOf(a.m.kind) - KIND_ORDER.indexOf(b.m.kind) || Number(a.m.id) - Number(b.m.id));
  }, [total, materials]);

  const missing = new Map(rows.map((r) => [r.m.id, r.missing]));
  const witHave = materials.HerosWit ?? 0;
  const moraHave = materials.Mora ?? 0;
  const estimate = resinEstimate(missing, total.heroWit - witHave);

  const candidates = Object.keys(characters)
    .filter((id) => !farming.some((f) => f.id === id) && byId.has(id) && id !== 'traveler')
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name));

  const groups = KIND_ORDER.map((k) => ({ kind: k, rows: rows.filter((r) => r.m.kind === k) })).filter((g) => g.rows.length);

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader
        title={t('farm.title')}
        subtitle={t('farm.subtitle')}
        actions={
          <select
            className="select"
            value={pick}
            aria-label={t('farm.add')}
            onChange={(e) => {
              if (e.target.value) addFarmTarget(e.target.value);
              setPick('');
            }}
          >
            <option value="">{t('farm.add')}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {t.lang === 'de' && c.nameDe ? c.nameDe : c.name}
              </option>
            ))}
          </select>
        }
      />

      {farming.length === 0 ? (
        <Empty icon={<Pickaxe size={26} />} title={t('farm.empty')} body={t('farm.emptyBody')} />
      ) : (
        <>
          <div className="farm-grid">
            <section className="card" aria-label={t('farm.title')}>
              <ul className="plan-list">
                {farming.map((f) => {
                  const c = byId.get(f.id);
                  return c ? <PlanRow key={f.id} c={c} /> : null;
                })}
              </ul>
            </section>
            <div className="stack">
              <TodayCard />
              <section className="card" aria-labelledby="farm-resin">
                <h2 id="farm-resin" className="card-title">
                  {t('farm.resin')}
                </h2>
                <p className="farm-resin">{t('farm.resinBody', { resin: t.num(estimate.resin), days: t.num(estimate.days) })}</p>
                <p className="muted small">{t('farm.runs', { book: estimate.bookRuns, boss: estimate.bossRuns, ley: estimate.leyRuns })}</p>
                <p className="muted small">{t('farm.resinNote')}</p>
              </section>
            </div>
          </div>

          <section className="card" aria-labelledby="farm-mats">
            <div className="card-head">
              <h2 id="farm-mats" className="card-title">
                {t('farm.materials')}
              </h2>
              {!hasInventory && <span className="muted small">{t('farm.noInventory')}</span>}
            </div>
            <div className="mat-groups">
              <div className="mat-group">
                <h3 className="group-title">{t('farm.kind.basics')}</h3>
                <div className="mat-grid">
                  <MatTile icon="UI_ItemIcon_202" name={t('farm.mora')} rarity={3} need={total.mora} have={moraHave} />
                  <MatTile icon="UI_ItemIcon_104003" name={t('farm.exp')} rarity={4} need={total.heroWit} have={witHave} />
                </div>
              </div>
              {groups.map((g) => (
                <div key={g.kind} className="mat-group">
                  <h3 className="group-title">{t(`farm.kind.${g.kind}` as MessageKey)}</h3>
                  <div className="mat-grid">
                    {g.rows.map((r) => (
                      <MatTile
                        key={r.m.id}
                        icon={r.m.icon}
                        name={matName(r.m, t.lang)}
                        rarity={r.m.rank}
                        need={r.need}
                        have={r.have}
                        hint={r.m.days ? dayNames(t, r.m.days) : r.m.from}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MatTile({ icon, name, rarity, need, have, hint }: { icon: string; name: string; rarity: number; need: number; have: number; hint?: string }) {
  const t = useT();
  const done = have >= need;
  const compact = (n: number) => t.num(n, n >= 100_000 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined);
  return (
    <div className={`mat ${done ? 'is-done' : ''}`} title={hint ? `${name} · ${hint}` : name}>
      <ItemIcon icon={icon} name={name} rarity={rarity} size={52} />
      <span className="mat-count num">
        {have > 0 && <span className="muted">{compact(Math.min(have, need))}/</span>}
        {compact(need)}
      </span>
      <span className="mat-name">{name}</span>
    </div>
  );
}

import { Package, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import { ItemIcon } from '../../components/visuals';
import { findArtifactSet, findCharacter, findWeapon, WEAPONS } from '../../data/characters';
import { critValue, fromGoodKey, isPercentStat, STAT_LABEL } from '../../core/good';
import { weaponCopies, type WeaponCopies } from '../../core/wishStats';
import { useT } from '../../i18n';
import { href } from '../../lib/router';
import { useStore } from '../../lib/store';
import type { ArtifactSlot, InvArtifact, Weapon } from '../../lib/types';
import { TeyvatTabs } from './TeyvatTabs';

type Tab = 'weapons' | 'pulled' | 'artifacts' | 'materials';
const SLOTS: ArtifactSlot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

const fmtStat = (key: string, v: number) => (isPercentStat(key) ? `${v.toFixed(1)}%` : String(Math.round(v)));

function Owner({ location }: { location: string }) {
  const t = useT();
  if (!location) return <span className="muted">{t('inv.unequipped')}</span>;
  const c = findCharacter(location) ?? findCharacter(fromGoodKey(location));
  return (
    <span className="owner">
      {c && <ItemIcon icon={c.icon} name={c.name} rarity={c.rarity} size={22} />}
      <span>{c?.name ?? fromGoodKey(location)}</span>
    </span>
  );
}

function Weapons() {
  const t = useT();
  const weapons = useStore((s) => s.inventory.weapons);
  const [q, setQ] = useState('');
  const [type, setType] = useState<Weapon | ''>('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return weapons
      .map((w) => ({ w, def: findWeapon(w.key) ?? findWeapon(w.name) }))
      .filter(({ w, def }) => (!needle || w.name.toLowerCase().includes(needle)) && (!type || def?.type === type))
      .sort((a, b) => (b.def?.rarity ?? 0) - (a.def?.rarity ?? 0) || b.w.level - a.w.level || a.w.name.localeCompare(b.w.name));
  }, [weapons, q, type]);

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inv.search')} aria-label={t('inv.search')} />
        </label>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as Weapon | '')} aria-label={t('chars.weapon')}>
          <option value="">{t('inv.allTypes')}</option>
          {WEAPONS.map((w) => (
            <option key={w} value={w}>
              {t(`wp.${w}`)}
            </option>
          ))}
        </select>
        <span className="muted small">{t('inv.count', { n: t.num(rows.length) })}</span>
      </div>
      <div className="card table-card">
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>{t('inv.weapons')}</th>
                <th className="num">{t('inv.level')}</th>
                <th className="num">R</th>
                <th>{t('inv.equippedBy')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, def }, i) => (
                <tr key={`${w.key}-${i}`}>
                  <td>
                    <span className="log-item">
                      <ItemIcon icon={def?.icon} name={w.name} rarity={def?.rarity ?? 3} size={30} />
                      <span className={def && def.rarity >= 4 ? `text-r${def.rarity}` : ''}>{(t.lang === 'de' && def?.nameDe) || def?.name || w.name}</span>
                    </span>
                  </td>
                  <td className="num">{w.level}</td>
                  <td className="num">{w.refinement}</td>
                  <td>
                    <Owner location={w.location} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Artifacts() {
  const t = useT();
  const artifacts = useStore((s) => s.inventory.artifacts);
  const [set, setSet] = useState('');
  const [slot, setSlot] = useState<ArtifactSlot | ''>('');
  const [minRarity, setMinRarity] = useState(5);
  const [sort, setSort] = useState<'cv' | 'level'>('cv');

  const sets = useMemo(() => [...new Set(artifacts.map((a) => a.setKey))].sort(), [artifacts]);
  const rows = useMemo(
    () =>
      artifacts
        .filter((a) => (!set || a.setKey === set) && (!slot || a.slotKey === slot) && a.rarity >= minRarity)
        .map((a) => ({ a, cv: critValue(a) }))
        .sort((x, y) => (sort === 'cv' ? y.cv - x.cv : y.a.level - x.a.level || y.cv - x.cv)),
    [artifacts, set, slot, minRarity, sort],
  );

  const setName = (key: string) => {
    const def = findArtifactSet(key);
    return def ? (t.lang === 'de' ? def.nameDe : def.name) : fromGoodKey(key);
  };

  return (
    <>
      <div className="toolbar">
        <select className="select" value={set} onChange={(e) => setSet(e.target.value)} aria-label={t('inv.set')}>
          <option value="">{t('inv.allSets')}</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {setName(s)}
            </option>
          ))}
        </select>
        <select className="select" value={slot} onChange={(e) => setSlot(e.target.value as ArtifactSlot | '')} aria-label={t('inv.slot')}>
          <option value="">{t('inv.allSlots')}</option>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {t(`slot.${s}`)}
            </option>
          ))}
        </select>
        <Segmented
          size="sm"
          label="Rarity"
          value={minRarity}
          onChange={setMinRarity}
          options={[5, 4, 1].map((n) => ({ value: n, label: n === 1 ? t('common.all') : t('inv.minRarity', { n }) }))}
        />
        <Segmented
          size="sm"
          label={t('common.sort')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'cv', label: t('inv.cv') },
            { value: 'level', label: t('inv.level') },
          ]}
        />
        <span className="muted small">{t('inv.count', { n: t.num(rows.length) })}</span>
      </div>
      <div className="artifact-grid">
        {rows.slice(0, 300).map(({ a, cv }, i) => (
          <ArtifactCard key={i} a={a} cv={cv} setName={setName(a.setKey)} />
        ))}
      </div>
      {rows.length > 300 && <p className="muted small center">{t('inv.truncated', { n: 300, total: t.num(rows.length) })}</p>}
    </>
  );
}

function ArtifactCard({ a, cv, setName }: { a: InvArtifact; cv: number; setName: string }) {
  const t = useT();
  const def = findArtifactSet(a.setKey);
  // Set icons end in the flower piece ("_4"); swap the suffix for the slot.
  const pieceIcon = def?.icon.replace(/_\d$/, `_${{ flower: 4, plume: 2, sands: 5, goblet: 1, circlet: 3 }[a.slotKey]}`);
  return (
    <article className="artifact">
      <div className="artifact-head">
        <ItemIcon icon={pieceIcon} name={setName} rarity={a.rarity} size={44} badge={`+${a.level}`} />
        <div className="artifact-title">
          <strong title={setName}>{setName}</strong>
          <span className="muted small">
            {t(`slot.${a.slotKey}`)} · {STAT_LABEL[a.mainStatKey] ?? a.mainStatKey}
          </span>
        </div>
        <span className={`cv ${cv >= 40 ? 'hi' : cv >= 25 ? 'mid' : ''}`} title={t('inv.cv')}>
          {cv.toFixed(1)}
        </span>
      </div>
      <ul className="subs">
        {a.substats.map((s) => (
          <li key={s.key} className={s.key.startsWith('crit') ? 'crit' : ''}>
            <span>{STAT_LABEL[s.key] ?? s.key}</span>
            <span className="num">{fmtStat(s.key, s.value)}</span>
          </li>
        ))}
      </ul>
      <div className="artifact-foot">
        <Owner location={a.location} />
      </div>
    </article>
  );
}

function Materials() {
  const t = useT();
  const materials = useStore((s) => s.inventory.materials);
  const [q, setQ] = useState('');
  const rows = Object.entries(materials)
    .filter(([k, n]) => n > 0 && (!q || fromGoodKey(k).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inv.search')} aria-label={t('inv.search')} />
        </label>
        <span className="muted small">{t('inv.count', { n: t.num(rows.length) })}</span>
      </div>
      <div className="card table-card">
        <ul className="material-list">
          {rows.map(([k, n]) => (
            <li key={k}>
              <span>{fromGoodKey(k)}</span>
              <span className="num">{t.num(n)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Weapons from the wish history: copies pulled → highest possible refinement. */
function PulledWeapons({ list }: { list: WeaponCopies[] }) {
  const t = useT();
  const df = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium' });
  return (
    <>
      <p className="muted small">{t('inv.pulledHint')}</p>
      <div className="card table-card">
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>{t('inv.weapons')}</th>
                <th className="num">{t('inv.copies')}</th>
                <th className="num">{t('inv.maxRefine')}</th>
                <th>{t('inv.lastPulled')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => {
                const def = findWeapon(w.name);
                return (
                  <tr key={w.name}>
                    <td>
                      <span className="log-item">
                        <ItemIcon icon={def?.icon} name={w.name} rarity={w.rank} size={30} />
                        <span className={`text-r${w.rank}`}>{(t.lang === 'de' && def?.nameDe) || w.name}</span>
                      </span>
                    </td>
                    <td className="num">{w.copies}</td>
                    <td className="num">
                      R{Math.min(5, w.copies)}
                      {w.copies > 5 && <span className="muted"> +{w.copies - 5}</span>}
                    </td>
                    <td className="muted num">{df.format(new Date(w.last.replace(' ', 'T')))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function Inventory() {
  const t = useT();
  const inv = useStore((s) => s.inventory);
  const wishes = useStore((s) => s.wishes);
  const pulled = useMemo(() => weaponCopies(wishes), [wishes]);
  const has = { weapons: inv.weapons.length, pulled: pulled.length, artifacts: inv.artifacts.length, materials: Object.keys(inv.materials).length };
  const [tab, setTab] = useState<Tab>(has.weapons ? 'weapons' : has.pulled ? 'pulled' : has.artifacts ? 'artifacts' : 'weapons');
  const df = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium' });
  const empty = !has.weapons && !has.pulled && !has.artifacts && !has.materials;

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader
        title={t('inv.title')}
        subtitle={inv.importedAt ? t('inv.source', { when: df.format(inv.importedAt), source: inv.source ?? 'GOOD' }) : t('inv.subtitle')}
      />
      {empty ? (
        <Empty
          icon={<Package size={26} />}
          title={t('inv.empty')}
          body={t('inv.emptyBody')}
          action={
            <a className="btn btn-primary btn-md" href={href('/teyvat/import')}>
              <Upload size={16} />
              <span>{t('nav.import')}</span>
            </a>
          }
        />
      ) : (
        <>
          <Segmented
            label={t('inv.title')}
            value={tab}
            onChange={setTab}
            options={[
              ...(has.weapons ? [{ value: 'weapons' as Tab, label: t('inv.weapons'), count: has.weapons }] : []),
              ...(has.pulled ? [{ value: 'pulled' as Tab, label: t('inv.pulled'), count: has.pulled }] : []),
              { value: 'artifacts', label: t('inv.artifacts'), count: has.artifacts },
              { value: 'materials', label: t('inv.materials'), count: has.materials },
            ]}
          />
          {tab === 'weapons' && <Weapons />}
          {tab === 'pulled' && <PulledWeapons list={pulled} />}
          {tab === 'artifacts' && <Artifacts />}
          {tab === 'materials' && <Materials />}
        </>
      )}
    </div>
  );
}


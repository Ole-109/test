import { Heart, Plus, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Empty, Field, PageHeader, Segmented, TextInput } from '../../components/ui';
import { CharacterIcon, ElementIcon } from '../../components/visuals';
import { BASE_CHARACTERS, ELEMENTS, REGIONS, slug, WEAPONS } from '../../data/characters';
import { useT } from '../../i18n';
import { setOwned } from '../../lib/actions';
import { update, useStore } from '../../lib/store';
import type { CharacterDef, Element, Region, Weapon } from '../../lib/types';
import { CharacterSheet } from './CharacterSheet';
import { TeyvatTabs } from './TeyvatTabs';

type Own = 'all' | 'owned' | 'missing';
type Sort = 'name' | 'level' | 'rarity' | 'element' | 'recent';

export function useAllCharacters(): CharacterDef[] {
  const custom = useStore((s) => s.customCharacters);
  return useMemo(() => [...BASE_CHARACTERS, ...custom].sort((a, b) => a.name.localeCompare(b.name)), [custom]);
}

export function Characters() {
  const t = useT();
  const all = useAllCharacters();
  const owned = useStore((s) => s.characters);
  const [q, setQ] = useState('');
  const [own, setOwn] = useState<Own>('all');
  const [els, setEls] = useState<Element[]>([]);
  const [weapon, setWeapon] = useState<Weapon | ''>('');
  const [rarity, setRarity] = useState<0 | 4 | 5>(0);
  const [sort, setSort] = useState<Sort>('name');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const ownedCount = all.filter((c) => owned[c.id]).length;
  const builtCount = all.filter((c) => owned[c.id]?.build === 'built').length;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = all.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle)) &&
        (own === 'all' || (own === 'owned') === !!owned[c.id]) &&
        (!els.length || els.includes(c.element)) &&
        (!weapon || c.weapon === weapon) &&
        (!rarity || c.rarity === rarity),
    );
    const lvl = (c: CharacterDef) => owned[c.id]?.level ?? -1;
    const cmp: Record<Sort, (a: CharacterDef, b: CharacterDef) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      level: (a, b) => lvl(b) - lvl(a) || a.name.localeCompare(b.name),
      rarity: (a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name),
      element: (a, b) => ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element) || a.name.localeCompare(b.name),
      recent: (a, b) => (owned[b.id]?.updatedAt ?? 0) - (owned[a.id]?.updatedAt ?? 0) || a.name.localeCompare(b.name),
    };
    // Favorites float to the top within owned characters.
    return out.sort((a, b) => Number(!!owned[b.id]?.favorite) - Number(!!owned[a.id]?.favorite) || cmp[sort](a, b));
  }, [all, owned, q, own, els, weapon, rarity, sort]);

  const current = open ? all.find((c) => c.id === open) : undefined;

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader
       
        title={t('chars.title')}
        subtitle={t('chars.subtitle', { owned: ownedCount, total: all.length, built: builtCount })}
        actions={
          <Button icon={<UserPlus size={16} />} onClick={() => setAdding(true)} title={t('chars.customHint')}>
            {t('chars.addCustom')}
          </Button>
        }
      />

      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chars.search')} aria-label={t('chars.search')} />
        </label>
        <Segmented
          label={t('chars.owned')}
          value={own}
          onChange={setOwn}
          options={[
            { value: 'all', label: t('chars.everyone') },
            { value: 'owned', label: t('chars.owned'), count: ownedCount },
            { value: 'missing', label: t('chars.missing') },
          ]}
        />
      </div>

      <div className="toolbar toolbar-filters">
        <div className="el-filter" role="group" aria-label={t('chars.element')}>
          {ELEMENTS.map((e) => {
            const on = els.includes(e);
            return (
              <button
                key={e}
                type="button"
                className={`el-toggle el-${e} ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                title={t(`el.${e}`)}
                onClick={() => setEls((cur) => (on ? cur.filter((x) => x !== e) : [...cur, e]))}
              >
                <ElementIcon element={e} size={16} />
                <span className="sr-only">{t(`el.${e}`)}</span>
              </button>
            );
          })}
        </div>
        <select className="select" value={weapon} onChange={(e) => setWeapon(e.target.value as Weapon | '')} aria-label={t('chars.weapon')}>
          <option value="">{t('chars.weapon')}: {t('common.all')}</option>
          {WEAPONS.map((w) => (
            <option key={w} value={w}>
              {t(`wp.${w}`)}
            </option>
          ))}
        </select>
        <Segmented
          size="sm"
          label={t('chars.rarity')}
          value={rarity}
          onChange={setRarity}
          options={[
            { value: 0, label: t('common.all') },
            { value: 5, label: '5★' },
            { value: 4, label: '4★' },
          ]}
        />
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('common.sort')}>
          {(['name', 'level', 'rarity', 'element', 'recent'] as Sort[]).map((s) => (
            <option key={s} value={s}>
              {t(`chars.sort.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Search size={28} />} title={t('chars.empty')} />
      ) : (
        <ul className="char-grid">
          {list.map((c) => {
            const o = owned[c.id];
            return (
              <li key={c.id}>
                <button type="button" className={`char-tile ${o ? 'is-owned' : ''}`} onClick={() => setOpen(c.id)} aria-label={c.name}>
                  <div className="char-tile-art">
                    <CharacterIcon c={c} size={88} dim={!o} />
                    <span className="char-el">
                      <ElementIcon element={c.element} size={13} title={t(`el.${c.element}`)} />
                    </span>
                    {o && <span className="char-cons">C{o.constellation}</span>}
                    {o?.favorite && <Heart size={12} fill="currentColor" className="char-fav" aria-hidden />}
                  </div>
                  <span className="char-tile-name">{t.lang === 'de' && c.nameDe ? c.nameDe : c.name}</span>
                  <span className="char-tile-meta num">
                    {o ? (
                      <>
                        Lv {o.level} · {o.talents.join('/')}
                        <span className={`build-dot build-${o.build}`} title={t(`chars.build.${o.build}`)} />
                      </>
                    ) : (
                      <span className="muted">{t(`wp.${c.weapon}`)}</span>
                    )}
                  </span>
                </button>
                {!o && (
                  <button
                    type="button"
                    className="char-quick"
                    aria-label={`${t('chars.markOwned')}: ${c.name}`}
                    title={t('chars.markOwned')}
                    onClick={() => {
                      setOwned(c.id, true);
                      toast({ message: t('chars.added', { name: c.name }), tone: 'success' });
                    }}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {current && <CharacterSheet c={current} onClose={() => setOpen(null)} />}
      <CustomCharacterSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function CustomCharacterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const all = useAllCharacters();
  const [name, setName] = useState('');
  const [element, setElement] = useState<Element>('pyro');
  const [weapon, setWeapon] = useState<Weapon>('sword');
  const [rarity, setRarity] = useState<4 | 5>(5);
  const [region, setRegion] = useState<Region>('nodkrai');
  const id = slug(name);
  const exists = !!id && all.some((c) => c.id === id);

  const submit = () => {
    if (!name.trim() || exists) return;
    const def: CharacterDef = { id, name: name.trim(), element, weapon, rarity, region, custom: true };
    update('customCharacters', (cs) => [...cs, def]);
    setOwned(id, true);
    toast({ message: t('chars.added', { name: def.name }), tone: 'success' });
    setName('');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('chars.addCustom')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || exists}>
            {t('common.add')}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="muted">{t('chars.customHint')}</p>
        <Field label={t('chars.name')} htmlFor="cc-name" hint={exists ? t('anime.already') : undefined}>
          <TextInput id="cc-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('chars.element')}>
          <div className="el-filter" role="radiogroup" aria-label={t('chars.element')}>
            {ELEMENTS.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={element === e}
                className={`el-toggle el-${e} ${element === e ? 'is-on' : ''}`}
                title={t(`el.${e}`)}
                onClick={() => setElement(e)}
              >
                <ElementIcon element={e} size={16} />
                <span className="sr-only">{t(`el.${e}`)}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="form-row">
          <Field label={t('chars.weapon')} htmlFor="cc-weapon">
            <select id="cc-weapon" className="select" value={weapon} onChange={(e) => setWeapon(e.target.value as Weapon)}>
              {WEAPONS.map((w) => (
                <option key={w} value={w}>
                  {t(`wp.${w}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('chars.region')} htmlFor="cc-region">
            <select id="cc-region" className="select" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`rg.${r}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('chars.rarity')}>
          <Segmented
            label={t('chars.rarity')}
            value={rarity}
            onChange={setRarity}
            options={[
              { value: 5, label: '5★' },
              { value: 4, label: '4★' },
            ]}
          />
        </Field>
      </form>
    </Sheet>
  );
}

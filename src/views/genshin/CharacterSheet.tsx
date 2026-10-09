import { Heart, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Field, IconButton, Rarity, Segmented, Stepper, TextInput } from '../../components/ui';
import { CharacterCrest, ElementIcon } from '../../components/visuals';
import { useT } from '../../i18n';
import { patchCharacter, restore, setOwned, snapshot } from '../../lib/actions';
import { update, useStore } from '../../lib/store';
import type { BuildStatus, CharacterDef } from '../../lib/types';

const LEVEL_PRESETS = [20, 40, 50, 60, 70, 80, 90];

export function CharacterSheet({ c, onClose }: { c: CharacterDef; onClose: () => void }) {
  const t = useT();
  const o = useStore((s) => s.characters[c.id]);

  const hero = (
    <div className={`sheet-hero char-hero el-${c.element}`}>
      <CharacterCrest c={c} size={88} dim={!o} />
      <div>
        <div className="char-hero-meta">
          <ElementIcon element={c.element} size={14} />
          <span>{t(`el.${c.element}`)}</span>
          <span aria-hidden>·</span>
          <span>{t(`wp.${c.weapon}`)}</span>
          <span aria-hidden>·</span>
          <span>{t(`rg.${c.region}`)}</span>
        </div>
        <Rarity n={c.rarity} size={14} />
      </div>
    </div>
  );

  const remove = () => {
    const snap = snapshot();
    setOwned(c.id, false);
    toast({ message: t('chars.removed', { name: c.name }), action: { label: t('common.undo'), run: () => restore(snap) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={c.name}
      hero={hero}
      closeLabel={t('common.close')}
      footer={
        o ? (
          <>
            <Button variant="ghost" icon={<UserMinus size={16} />} onClick={remove}>
              {t('chars.removeOwned')}
            </Button>
            <Button variant="primary" onClick={onClose}>
              {t('common.done')}
            </Button>
          </>
        ) : c.custom ? (
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={() => {
              const snap = snapshot();
              update('customCharacters', (cs) => cs.filter((x) => x.id !== c.id));
              onClose();
              toast({ message: t('common.deleted', { name: c.name }), action: { label: t('common.undo'), run: () => restore(snap) } });
            }}
          >
            {t('chars.deleteCustom')}
          </Button>
        ) : undefined
      }
    >
      {!o ? (
        <div className="not-owned">
          <Button
            variant="primary"
            data-autofocus
            icon={<UserPlus size={16} />}
            onClick={() => {
              setOwned(c.id, true);
              toast({ message: t('chars.added', { name: c.name }), tone: 'success' });
            }}
          >
            {t('chars.markOwned')}
          </Button>
        </div>
      ) : (
        <div className="form">
          <div className="row between">
            <Field label={t('chars.level')}>
              <Stepper label={t('chars.level')} value={o.level} min={1} max={100} onChange={(level) => patchCharacter(c.id, { level })} />
            </Field>
            <IconButton
              label={o.favorite ? t('common.unfavorite') : t('common.favorite')}
              active={o.favorite}
              className="fav-btn"
              onClick={() => patchCharacter(c.id, { favorite: !o.favorite })}
            >
              <Heart size={18} fill={o.favorite ? 'currentColor' : 'none'} />
            </IconButton>
          </div>
          <div className="preset-row" role="group" aria-label={t('chars.level')}>
            {LEVEL_PRESETS.map((l) => (
              <button
                key={l}
                type="button"
                className={`chip-btn ${o.level === l ? 'is-active' : ''}`}
                onClick={() => patchCharacter(c.id, { level: l })}
              >
                {l}
              </button>
            ))}
          </div>

          <Field label={t('chars.constellation')}>
            <Segmented
              label={t('chars.constellation')}
              value={o.constellation}
              onChange={(constellation) => patchCharacter(c.id, { constellation })}
              options={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `C${n}` }))}
              className="seg-fill"
            />
          </Field>

          <Field label={t('chars.talents')}>
            <div className="talents">
              {(['chars.talentNA', 'chars.talentE', 'chars.talentQ'] as const).map((k, i) => (
                <div key={k} className="talent">
                  <span className="muted small">{t(k)}</span>
                  <Stepper
                    size="sm"
                    label={t(k)}
                    value={o.talents[i]}
                    min={1}
                    max={10}
                    onChange={(v) => {
                      const talents = [...o.talents] as [number, number, number];
                      talents[i] = v;
                      patchCharacter(c.id, { talents });
                    }}
                  />
                </div>
              ))}
            </div>
          </Field>

          <div className="form-row">
            <Field label={t('chars.weaponName')} htmlFor="ch-weapon">
              <TextInput id="ch-weapon" value={o.weapon} onChange={(e) => patchCharacter(c.id, { weapon: e.target.value })} />
            </Field>
            <Field label={t('chars.refinement')}>
              <Segmented
                size="sm"
                label={t('chars.refinement')}
                value={o.refinement}
                onChange={(refinement) => patchCharacter(c.id, { refinement })}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `R${n}` }))}
              />
            </Field>
          </div>

          <Field label={t('chars.artifacts')} htmlFor="ch-arts">
            <TextInput
              id="ch-arts"
              value={o.artifacts}
              placeholder={t('chars.artifactsPlaceholder')}
              onChange={(e) => patchCharacter(c.id, { artifacts: e.target.value })}
            />
          </Field>

          <div className="form-row">
            <Field label={t('chars.build')}>
              <Segmented
                size="sm"
                label={t('chars.build')}
                value={o.build}
                onChange={(build: BuildStatus) => patchCharacter(c.id, { build })}
                options={(['planned', 'farming', 'built'] as BuildStatus[]).map((b) => ({
                  value: b,
                  label: (
                    <>
                      <span className={`build-dot build-${b}`} aria-hidden /> {t(`chars.build.${b}`)}
                    </>
                  ),
                }))}
              />
            </Field>
            <Field label={t('chars.friendship')}>
              <Stepper size="sm" label={t('chars.friendship')} value={o.friendship} min={1} max={10} onChange={(friendship) => patchCharacter(c.id, { friendship })} />
            </Field>
          </div>

          <Field label={t('common.notes')} htmlFor="ch-notes">
            <textarea
              id="ch-notes"
              className="input textarea"
              rows={3}
              value={o.notes}
              placeholder={t('common.notesPlaceholder')}
              onChange={(e) => patchCharacter(c.id, { notes: e.target.value })}
            />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

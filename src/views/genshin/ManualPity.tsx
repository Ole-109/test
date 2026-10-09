import { Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Field, Segmented, Stepper, Switch, TextInput } from '../../components/ui';
import { useT } from '../../i18n';
import { addPulls, logFive, logFour, patchBanner } from '../../lib/actions';
import { fiveStarRate, RULES } from '../../lib/gacha';
import { useStore } from '../../lib/store';
import type { BannerKey, FiveStarRecord } from '../../lib/types';
import { useAllCharacters } from './Characters';
import { pct } from './Planner';

/** Manual pity tracking for players who don't import their history. */
export function PityCard({ banner }: { banner: BannerKey }) {
  const t = useT();
  const b = useStore((s) => s.banners[banner]);
  const rules = RULES[banner];
  const [logging, setLogging] = useState(false);
  const next = fiveStarRate(rules, b.pity5 + 1);
  const inSoft = b.pity5 + 1 >= rules.softStart;
  const softPct = ((rules.softStart - 1) / rules.hard) * 100;

  return (
    <section className={`card pity-card banner-${banner}`} aria-labelledby="pity-h">
      <div className="card-head">
        <h2 id="pity-h" className="card-title">
          {t(`wish.banner.${banner}`)}
        </h2>
        <span className="muted small">{t('wish.total', { n: t.num(b.total) })}</span>
      </div>

      <div className="pity-hero">
        <div className="pity-number">
          <span className="eyebrow">{t('wish.pity5')}</span>
          <strong className="num">{b.pity5}</strong>
          <span className="muted">/ {rules.hard}</span>
        </div>
        <div className="pity-side">
          <p className={inSoft ? 'pity-soft' : ''}>
            {inSoft && <Sparkles size={14} aria-hidden />} {t('wish.nextChance', { p: pct(next, t.lang) })}
          </p>
          <p className="muted small">{t('wish.hardPity', { n: Math.max(0, rules.hard - b.pity5) })}</p>
        </div>
      </div>

      <div className="pity-track" role="meter" aria-valuemin={0} aria-valuemax={rules.hard} aria-valuenow={b.pity5} aria-label={t('wish.pity5')}>
        <div className="pity-soft-zone" style={{ left: `${softPct}%` }}>
          <span>{t('wish.softPity')}</span>
        </div>
        <div className="pity-fill" style={{ width: `${(b.pity5 / rules.hard) * 100}%` }} />
      </div>

      <div className="pity4">
        <span className="muted small">{t('wish.pity4')}</span>
        <div className="pips" aria-label={`${t('wish.pity4')} ${b.pity4}/10`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={i < b.pity4 ? 'on' : ''} />
          ))}
        </div>
        <span className="num small">{b.pity4}/10</span>
      </div>

      {banner === 'character' || banner === 'chronicled' ? (
        <Switch
          checked={b.guaranteed}
          onChange={(guaranteed) => patchBanner(banner, { guaranteed })}
          label={t('wish.guaranteed')}
          description={b.guaranteed ? undefined : t('wish.fiftyFifty')}
        />
      ) : banner === 'weapon' ? (
        <Switch
          checked={b.fatePoints > 0}
          onChange={(on) => patchBanner(banner, { fatePoints: on ? 1 : 0, guaranteed: on })}
          label={`${t('wish.fatePoint')} ${b.fatePoints}/1`}
        />
      ) : null}

      <div className="pity-actions">
        <Button onClick={() => addPulls(banner, 1)}>{t('wish.add1')}</Button>
        <Button onClick={() => addPulls(banner, 10)}>{t('wish.add10')}</Button>
        <Button onClick={() => logFour(banner)} icon={<Star size={14} />}>
          {t('wish.got4')}
        </Button>
        <Button variant="primary" onClick={() => setLogging(true)} icon={<Sparkles size={14} />}>
          {t('wish.got5')}
        </Button>
      </div>

      <div className="pity-set">
        <span className="muted small">{t('wish.setPity')}</span>
        <Stepper size="sm" label={t('wish.setPity')} value={b.pity5} min={0} max={rules.hard - 1} onChange={(pity5) => patchBanner(banner, { pity5 })} />
      </div>

      {logging && <LogFiveSheet banner={banner} onClose={() => setLogging(false)} />}
    </section>
  );
}

function LogFiveSheet({ banner, onClose }: { banner: BannerKey; onClose: () => void }) {
  const t = useT();
  const b = useStore((s) => s.banners[banner]);
  const chars = useAllCharacters();
  const [name, setName] = useState('');
  const [pity, setPity] = useState(Math.max(1, b.pity5 + 1));
  const defaultOutcome: FiveStarRecord['outcome'] = banner === 'standard' ? 'na' : b.guaranteed ? 'guaranteed' : 'won';
  const [outcome, setOutcome] = useState<FiveStarRecord['outcome']>(defaultOutcome);
  const hard = RULES[banner].hard;

  const submit = () => {
    if (!name.trim()) return;
    logFive(banner, { name: name.trim(), pity, outcome });
    toast({ message: t('wish.logged', { name: name.trim(), n: pity }), tone: 'success' });
    onClose();
  };

  const outcomes: FiveStarRecord['outcome'][] =
    banner === 'standard' ? ['na'] : b.guaranteed ? ['guaranteed'] : ['won', 'lost'];

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('wish.logTitle')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            {t('common.save')}
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
        <Field label={t('wish.itemName')} htmlFor="five-name">
          <TextInput id="five-name" data-autofocus list="five-names" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <datalist id="five-names">
            {chars
              .filter((c) => c.rarity === 5)
              .map((c) => (
                <option key={c.id} value={c.name} />
              ))}
          </datalist>
        </Field>
        <Field label={t('wish.atPity')}>
          <Stepper label={t('wish.atPity')} value={pity} min={1} max={hard} onChange={setPity} />
        </Field>
        {banner !== 'standard' && (
          <Field label={t('wish.outcome')}>
            <Segmented
              label={t('wish.outcome')}
              value={outcome}
              onChange={setOutcome}
              options={outcomes.map((o) => ({ value: o, label: t(`wish.outcome.${o}`) }))}
            />
          </Field>
        )}
      </form>
    </Sheet>
  );
}


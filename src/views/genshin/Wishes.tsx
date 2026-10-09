import { Sparkles, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProbabilityCurve } from '../../components/charts';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Empty, Field, IconButton, PageHeader, Segmented, Stepper, Switch, TextInput } from '../../components/ui';
import { useT } from '../../i18n';
import { addPulls, logFive, logFour, patchBanner, removeFive, restore, snapshot } from '../../lib/actions';
import {
  expectedPulls,
  featuredCurve,
  fiveStarRate,
  PRIMOS_PER_PULL,
  RULES,
  totalPulls,
  worstCase,
} from '../../lib/gacha';
import { update, useStore } from '../../lib/store';
import type { BannerKey, FiveStarRecord } from '../../lib/types';
import { useAllCharacters } from './Characters';
import { TeyvatTabs } from './TeyvatTabs';

const BANNERS: BannerKey[] = ['character', 'weapon', 'standard', 'chronicled'];

const pct = (p: number, lang: string) =>
  new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: p > 0 && p < 0.1 ? 1 : 0,
  }).format(p);

export function Wishes() {
  const t = useT();
  const [banner, setBanner] = useState<BannerKey>('character');
  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader eyebrow={t('nav.teyvat')} title={t('wish.title')} subtitle={t('wish.subtitle')} />
      <Segmented
        label={t('wish.title')}
        value={banner}
        onChange={setBanner}
        className="banner-tabs"
        options={BANNERS.map((b) => ({ value: b, label: t(`wish.banner.${b}`) }))}
      />
      <div className="grid-wishes">
        <PityCard banner={banner} />
        <HistoryCard banner={banner} />
        <Planner />
      </div>
    </div>
  );
}

function PityCard({ banner }: { banner: BannerKey }) {
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

function HistoryCard({ banner }: { banner: BannerKey }) {
  const t = useT();
  const b = useStore((s) => s.banners[banner]);
  const h = b.history;
  const avg = h.length ? h.reduce((s, x) => s + x.pity, 0) / h.length : 0;
  const fifty = h.filter((x) => x.outcome === 'won' || x.outcome === 'lost');
  const won = fifty.filter((x) => x.outcome === 'won').length;
  const hard = RULES[banner].hard;
  const df = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="card history-card" aria-labelledby="hist-h">
      <div className="card-head">
        <h2 id="hist-h" className="card-title">
          {t('wish.history')}
        </h2>
      </div>
      {h.length > 0 && (
        <div className="mini-stats">
          <div>
            <span className="muted small">{t('wish.avgPity')}</span>
            <strong className="num">{t.num(Math.round(avg * 10) / 10)}</strong>
          </div>
          {fifty.length > 0 && (
            <div>
              <span className="muted small">{t('wish.winRate')}</span>
              <strong className="num">
                {won}/{fifty.length}
              </strong>
            </div>
          )}
        </div>
      )}
      {h.length === 0 ? (
        <Empty icon={<Star size={24} />} title={t('wish.historyEmpty')} />
      ) : (
        <ul className="history">
          {h.map((x) => (
            <li key={x.id}>
              <div className="history-main">
                <strong>{x.name}</strong>
                <span className="muted small">{df.format(x.at)}</span>
              </div>
              {x.outcome !== 'na' && <span className={`outcome outcome-${x.outcome}`}>{t(`wish.outcome.${x.outcome}`)}</span>}
              <div className="history-pity" title={`${x.pity}/${hard}`}>
                <div className="bar">
                  <div
                    className={`bar-fill ${x.pity >= RULES[banner].softStart ? 'soft' : ''}`}
                    style={{ width: `${(x.pity / hard) * 100}%` }}
                  />
                </div>
                <span className="num">{x.pity}</span>
              </div>
              <IconButton
                label={t('common.delete')}
                onClick={() => {
                  const snap = snapshot();
                  removeFive(banner, x.id);
                  toast({ message: t('common.deleted', { name: x.name }), action: { label: t('common.undo'), run: () => restore(snap) } });
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Planner() {
  const t = useT();
  const plan = useStore((s) => s.plan);
  const banners = useStore((s) => s.banners);
  const setPlan = (patch: Partial<typeof plan>) => update('plan', (p) => ({ ...p, ...patch }));
  const pulls = totalPulls(plan.primogems, plan.fates, plan.starglitter);
  const b = banners[plan.banner];
  const rules = RULES[plan.banner];
  const guaranteed = plan.banner === 'weapon' ? b.fatePoints > 0 : b.guaranteed;
  const worst = worstCase(plan.banner, b.pity5, guaranteed, plan.copies);

  const curve = useMemo(
    () =>
      featuredCurve(rules, {
        pity: b.pity5,
        guaranteed,
        copies: plan.copies,
        maxPulls: worst,
        featured: plan.banner === 'character' ? plan.rate : undefined,
      }),
    [rules, b.pity5, guaranteed, plan.copies, worst, plan.banner, plan.rate],
  );
  const chance = curve[Math.min(pulls, curve.length - 1)];
  const expected = expectedPulls(curve);
  const shortPrimos = Math.max(0, (worst - pulls) * PRIMOS_PER_PULL);
  const maxCopies = plan.banner === 'character' ? 7 : 5;

  return (
    <section className="card planner-card" aria-labelledby="plan-h">
      <div className="card-head">
        <div>
          <h2 id="plan-h" className="card-title">
            {t('wish.planner')}
          </h2>
          <p className="muted small">{t('wish.plannerHint')}</p>
        </div>
      </div>

      <div className="planner-grid">
        <div className="planner-inputs">
          <Field label={t('wish.primogems')}>
            <Stepper label={t('wish.primogems')} value={plan.primogems} step={160} max={999_999} onChange={(primogems) => setPlan({ primogems })} format={(v) => t.num(v)} />
          </Field>
          <Field label={t('wish.fates')}>
            <Stepper label={t('wish.fates')} value={plan.fates} max={9999} onChange={(fates) => setPlan({ fates })} />
          </Field>
          <Field label={t('wish.starglitter')}>
            <Stepper label={t('wish.starglitter')} value={plan.starglitter} step={5} max={99_999} onChange={(starglitter) => setPlan({ starglitter })} />
          </Field>
          <div className="you-have">
            <span className="muted small">{t('wish.youHave')}</span>
            <strong>{t.n('wish.pulls', pulls)}</strong>
          </div>

          <Field label={t('wish.target')}>
            <Segmented
              label={t('wish.target')}
              value={plan.banner}
              onChange={(banner) => setPlan({ banner, copies: Math.min(plan.copies, banner === 'character' ? 7 : 5) })}
              options={[
                { value: 'character', label: t('wish.banner.character') },
                { value: 'weapon', label: t('wish.banner.weapon') },
              ]}
            />
          </Field>
          <Field label={t('wish.copies')}>
            <Segmented
              size="sm"
              label={t('wish.copies')}
              value={plan.copies}
              onChange={(copies) => setPlan({ copies })}
              className="seg-fill"
              options={Array.from({ length: maxCopies }, (_, i) => ({
                value: i + 1,
                label: t(plan.banner === 'character' ? 'wish.copiesHint.character' : 'wish.copiesHint.weapon', {
                  c: plan.banner === 'character' ? i : i + 1,
                }),
              }))}
            />
          </Field>
          {plan.banner === 'character' && (
            <Field label={t('wish.rate')}>
              <Segmented
                size="sm"
                label={t('wish.rate')}
                value={plan.rate}
                onChange={(rate) => setPlan({ rate })}
                options={[
                  { value: 0.5, label: t('wish.rate.classic') },
                  { value: 0.55, label: t('wish.rate.radiance') },
                ]}
              />
            </Field>
          )}
          <p className="muted small">{t('wish.usesPity', { banner: t(`wish.banner.${plan.banner}`) })}</p>
        </div>

        <div className="planner-result">
          <div className="chance">
            <span className="eyebrow">{t('wish.chance')}</span>
            <strong className={`chance-value ${chance >= 0.75 ? 'good' : chance >= 0.4 ? 'mid' : 'low'}`}>{pct(chance, t.lang)}</strong>
          </div>
          <div className="mini-stats">
            <div>
              <span className="muted small">{t('wish.expected')}</span>
              <strong className="num">{t.num(Math.round(expected))}</strong>
            </div>
            <div>
              <span className="muted small">{t('wish.worst')}</span>
              <strong className="num">{t.n('wish.pulls', worst)}</strong>
            </div>
            <div>
              <span className="muted small">{t('wish.short')}</span>
              <strong className="num">{t.num(shortPrimos)}</strong>
            </div>
          </div>
          <ProbabilityCurve
            curve={curve}
            marker={pulls}
            label={t('wish.curveLabel')}
            tip={(n, p) => t('wish.curveTip', { p: pct(p, t.lang), n })}
          />
        </div>
      </div>
    </section>
  );
}

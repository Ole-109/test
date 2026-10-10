import { useMemo } from 'react';
import { ProbabilityCurve } from '../../components/charts';
import { Field, PageHeader, Segmented, Stepper, Switch } from '../../components/ui';
import { useT } from '../../i18n';
import { expectedPulls, featuredCurve, PRIMOS_PER_PULL, projectedPrimogems, RULES, totalPulls, worstCase } from '../../lib/gacha';
import { update, useStore } from '../../lib/store';
import { TeyvatTabs } from './TeyvatTabs';

export const pct = (p: number, lang: string) =>
  new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: p > 0 && p < 0.1 ? 1 : 0,
  }).format(p);

export function PlannerPage() {
  const t = useT();
  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader title={t('wish.planner')} subtitle={t('wish.plannerHint')} />
      <Planner />
    </div>
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

  // Forecast: income until the target date (e.g. the banner you are saving for).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = plan.targetDate ? new Date(`${plan.targetDate}T00:00:00`) : null;
  const days = target ? Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000)) : 0;
  const income = projectedPrimogems(days, { daily: plan.dailyPrimos, welkin: plan.welkin, monthly: plan.monthlyPrimos });
  const futurePulls = totalPulls(plan.primogems + income, plan.fates, plan.starglitter);
  const futureChance = curve[Math.min(futurePulls, curve.length - 1)];

  return (
    <section className="card planner-card" aria-label={t('wish.planner')}>
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

          <div className="forecast-inputs">
            <Field label={t('plan.saveUntil')} htmlFor="plan-date" hint={t('plan.saveUntilHint')}>
              <input
                id="plan-date"
                className="input"
                type="date"
                value={plan.targetDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPlan({ targetDate: e.target.value })}
              />
            </Field>
            {plan.targetDate && (
              <>
                <div className="form-row">
                  <Field label={t('plan.daily')}>
                    <Stepper size="sm" label={t('plan.daily')} value={plan.dailyPrimos} step={10} max={1000} onChange={(dailyPrimos) => setPlan({ dailyPrimos })} />
                  </Field>
                  <Field label={t('plan.monthly')}>
                    <Stepper size="sm" label={t('plan.monthly')} value={plan.monthlyPrimos} step={100} max={20000} onChange={(monthlyPrimos) => setPlan({ monthlyPrimos })} />
                  </Field>
                </div>
                <Switch checked={plan.welkin} onChange={(welkin) => setPlan({ welkin })} label={t('plan.welkin')} />
              </>
            )}
          </div>
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
          {target && (
            <div className="forecast">
              <span className="muted small">{t('plan.byDate', { date: new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium' }).format(target) })}</span>
              <span>
                {t('plan.forecast', { primos: t.num(income), pulls: t.num(futurePulls) })} →{' '}
                <strong className={futureChance >= 0.75 ? 'text-good' : futureChance >= 0.4 ? 'text-r5' : 'text-bad'}>{pct(futureChance, t.lang)}</strong>
              </span>
            </div>
          )}
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

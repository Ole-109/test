import { Hourglass, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import {
  consumeCondensed,
  consumeFragile,
  craftCondensed,
  setResinStock,
  setResinValue,
  spendResin,
} from '../lib/actions';
import { useNow } from '../lib/hooks';
import { resinAt, resinReachAt } from '../lib/resin';
import { useStore } from '../lib/store';
import { formatDuration } from '../lib/time';
import { toast } from './toast';
import { Button, IconButton, Ring, Stepper } from './ui';

const SPEND = [10, 20, 30, 40, 60];

export function ResinCard({ compact }: { compact?: boolean }) {
  const t = useT();
  const now = useNow(1000);
  const resin = useStore((s) => s.resin);
  const cap = useStore((s) => s.settings.resinCap);
  const snap = resinAt(resin, cap, now);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(0);

  const spend = (n: number) => {
    if (spendResin(n)) toast({ message: t('resin.spent', { n }) });
  };

  const status = snap.current > cap
    ? t('resin.overcap')
    : snap.capped
      ? t('resin.capped')
      : t('resin.fullIn', { t: formatDuration(snap.fullAt - now) });

  const milestones = [40, 60, 120, 160, cap].filter((m, i, a) => m <= cap && a.indexOf(m) === i && m > snap.current);

  return (
    <section className={`card resin-card ${compact ? 'is-compact' : ''} ${snap.capped ? 'is-full' : ''}`} aria-labelledby="resin-h">
      <div className="card-head">
        <h2 id="resin-h" className="card-title">
          <span className="resin-gem" aria-hidden />
          {t('resin.title')}
        </h2>
        {!compact && (
          <IconButton
            label={t('resin.set')}
            onClick={() => {
              setDraft(snap.current);
              setEditing((e) => !e);
            }}
            active={editing}
          >
            <Pencil size={16} />
          </IconButton>
        )}
      </div>

      <div className="resin-main">
        <Ring
          value={Math.min(snap.current, cap)}
          max={cap}
          size={compact ? 112 : 148}
          stroke={compact ? 9 : 11}
          color="url(#resin-grad)"
          label={`${snap.current} / ${cap}`}
        >
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
            <defs>
              <linearGradient id="resin-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--resin-a)" />
                <stop offset="1" stopColor="var(--resin-b)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="resin-value">
            <strong className="num">{snap.current}</strong>
            <span>/ {cap}</span>
          </div>
        </Ring>

        <div className="resin-info">
          <p className={`resin-status ${snap.capped ? 'warn' : ''}`}>{status}</p>
          {!snap.capped && (
            <p className="muted small">
              <Hourglass size={13} aria-hidden /> {t('resin.next', { t: formatDuration(snap.nextIn, { seconds: true }) })}
            </p>
          )}
          {!snap.capped && <p className="muted small">{t('resin.fullAt', { when: t.when(snap.fullAt, now) })}</p>}
          {milestones.length > 1 && (
            <ul className="milestones" aria-label={t('resin.milestones')}>
              {milestones.slice(0, compact ? 2 : 4).map((m) => (
                <li key={m}>
                  <span className="num">{m}</span>
                  <span className="muted">{t.when(resinReachAt(resin, cap, m, now), now)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && !compact && (
        <form
          className="resin-edit"
          onSubmit={(e) => {
            e.preventDefault();
            setResinValue(draft);
            setEditing(false);
          }}
        >
          <Stepper label={t('resin.set')} value={draft} onChange={setDraft} min={0} max={2000} step={1} />
          <Button variant="primary" type="submit">
            {t('common.save')}
          </Button>
        </form>
      )}

      <div className="resin-spend" role="group" aria-label={t('resin.spend')}>
        {(compact ? [20, 40] : SPEND).map((n) => (
          <button key={n} type="button" className="chip-btn" disabled={snap.current < n} onClick={() => spend(n)}>
            −{n}
          </button>
        ))}
      </div>

      {!compact && (
        <div className="resin-stock">
          <div className="stock">
            <div className="stock-head">
              <span className="stock-icon condensed" aria-hidden />
              <span>{t('resin.condensed')}</span>
            </div>
            <Stepper
              size="sm"
              label={t('resin.condensed')}
              value={resin.condensed}
              min={0}
              max={5}
              onChange={(n) => setResinStock('condensed', n)}
            />
            <div className="stock-actions">
              <Button size="sm" disabled={resin.condensed >= 5 || snap.current < 40} onClick={() => craftCondensed()}>
                {t('resin.craftCondensed')}
              </Button>
              <Button size="sm" variant="ghost" disabled={resin.condensed <= 0} onClick={() => consumeCondensed()}>
                {t('resin.useCondensed')}
              </Button>
            </div>
          </div>
          <div className="stock">
            <div className="stock-head">
              <span className="stock-icon fragile" aria-hidden />
              <span>{t('resin.fragile')}</span>
            </div>
            <Stepper size="sm" label={t('resin.fragile')} value={resin.fragile} min={0} max={999} onChange={(n) => setResinStock('fragile', n)} />
            <div className="stock-actions">
              <Button size="sm" variant="ghost" disabled={resin.fragile <= 0} onClick={() => consumeFragile()}>
                {t('resin.useFragile')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

import { useMemo } from 'react';
import { useStore } from '../lib/store';
import type { Lang } from '../lib/types';
import { de } from './de';
import { en, type MessageKey } from './en';

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, de };

type Vars = Record<string, string | number>;
type PluralBase<K> = K extends `${infer B}_one` ? B : never;
export type PluralKey = PluralBase<MessageKey>;

function fill(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return fill(DICTS[lang][key] ?? en[key] ?? key, vars);
}

export interface T {
  (key: MessageKey, vars?: Vars): string;
  /** Plural form: picks `${key}_one` or `${key}_other` and passes `n`. */
  n: (key: PluralKey, n: number, vars?: Vars) => string;
  lang: Lang;
  /** Locale-aware number formatting. */
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  /** Relative day + time, e.g. "Today 18:30" / "Tue 09:00" / "12 Oct". */
  when: (ts: number, now: number) => string;
  time: (ts: number) => string;
}

export function useT(): T {
  const lang = useStore((s) => s.settings.lang);
  return useMemo(() => {
    const locale = lang === 'de' ? 'de-DE' : 'en-US';
    const tf = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    const wf = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const df = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const nf = new Intl.NumberFormat(locale);
    const t = ((key: MessageKey, vars?: Vars) => translate(lang, key, vars)) as T;
    t.n = (key, n, vars) =>
      translate(lang, `${key}_${n === 1 ? 'one' : 'other'}` as MessageKey, { n: nf.format(n), ...vars });
    t.lang = lang;
    t.num = (n, opts) => (opts ? new Intl.NumberFormat(locale, opts).format(n) : nf.format(n));
    t.time = (ts) => tf.format(ts);
    t.when = (ts, now) => {
      const a = new Date(ts);
      const b = new Date(now);
      const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const days = Math.round((startOf(a) - startOf(b)) / 86_400_000);
      const time = tf.format(ts);
      if (days === 0) return `${translate(lang, 'common.today').toLowerCase()} ${time}`;
      if (days === 1) return `${translate(lang, 'common.tomorrow').toLowerCase()} ${time}`;
      if (days > 1 && days < 7) return `${wf.format(ts)} ${time}`;
      return `${df.format(ts)} ${time}`;
    };
    return t;
  }, [lang]);
}

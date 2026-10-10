import { Check, Copy, Download, FileUp, Loader2, Square, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { toast } from '../../components/toast';
import { Button, PageHeader, Segmented } from '../../components/ui';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { GachaApiError, type FetchProgress } from '../../core/gachaApi';
import { ImportError, parseImport, partsOf, toUigfV4, type ImportPart, type ImportResult } from '../../core/formats';
import { restore, snapshot } from '../../lib/actions';
import { applyImport, clearWishes, type ImportSummary } from '../../lib/importActions';
import { useStore } from '../../lib/store';
import { importFromLink } from '../../lib/wishFetch';
import { TeyvatTabs } from './TeyvatTabs';

const RAW = 'https://raw.githubusercontent.com/Ole-109/test/main/tools';
const PS_PREFIX = 'Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; ';
const psCommand = (args: string) =>
  `${PS_PREFIX}iex "&{$((New-Object System.Net.WebClient).DownloadString('${RAW}/export.ps1'))}${args ? ' ' + args : ''}"`;

const COMMANDS = {
  file: psCommand(''),
  link: psCommand('-LinkOnly'),
  full: psCommand('-Full -Cookie "ltoken_v2=...; ltuid_v2=..."'),
  node: 'node waypoint-export.mjs --cookie "ltoken_v2=...; ltuid_v2=..."',
};

type Tab = 'link' | 'file' | 'full';

function CommandBox({ command, label }: { command: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="cmd">
      <div className="cmd-head">
        <span>{label}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked – the text is selectable */
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? t('import.copied') : t('import.copy')}</span>
        </button>
      </div>
      <pre className="cmd-body" tabIndex={0}>
        {command}
      </pre>
    </div>
  );
}

function Summary({ s, label }: { s: ImportSummary; label: string }) {
  const t = useT();
  return (
    <div className="notice notice-ok" role="status">
      <Check size={16} />
      <div>
        <strong>
          {t('import.done')} · {label}
        </strong>
        <ul>
          {s.hadWishes && <li>{t('import.wishesAdded', { n: t.num(s.wishesAdded), total: t.num(s.wishesTotal) })}</li>}
          {s.characters > 0 && <li>{t('import.charsUpdated', { n: s.characters })}</li>}
          {(s.fromWishes.added > 0 || s.fromWishes.raised > 0) && (
            <li>{t('import.charsFromWishes', { added: s.fromWishes.added, raised: s.fromWishes.raised })}</li>
          )}
          {(s.weapons > 0 || s.artifacts > 0) && <li>{t('import.gear', { w: s.weapons, a: s.artifacts })}</li>}
          {s.achievements && <li>{t('import.achievementsAdded', { n: t.num(s.achievements.added), total: t.num(s.achievements.total) })}</li>}
          {s.roster > 0 && <li>{t('import.rosterUpdated', { n: s.roster })}</li>}
          {s.profile && <li>{t('import.profileUpdated')}</li>}
          {s.realtime && <li>{t('import.realtime')}</li>}
          {s.unknown.length > 0 && <li className="muted">{t('import.unknown', { list: s.unknown.join(', ') })}</li>}
        </ul>
      </div>
    </div>
  );
}

function FileDrop({ onResult }: { onResult: (s: ImportSummary, label: string) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ result: ImportResult; file: string } | null>(null);

  const apply = (result: ImportResult, file: string, parts?: ImportPart[]) => {
    const before = snapshot();
    const summary = applyImport(result, parts);
    setPending(null);
    onResult(summary, `${result.label} · ${file}`);
    toast({ message: t('import.done'), tone: 'success', action: { label: t('common.undo'), run: () => restore(before) } });
  };

  const handle = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setPending(null);
    try {
      const result = parseImport(await file.text());
      // Let the user choose when a file holds more than one kind of data (always for paimon.moe backups).
      if (result.kind === 'paimon' || result.accounts || partsOf(result).length > 1) setPending({ result, file: file.name });
      else apply(result, file.name);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : t('settings.importFailed'));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    handle(e.dataTransfer.files);
  };

  return (
    <>
      <button
        type="button"
        className={`dropzone ${over ? 'is-over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <FileUp size={22} />
        <strong>{t('import.dropTitle')}</strong>
        <span className="muted small">{t('import.dropHint')}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
      {error && (
        <div className="notice notice-error" role="alert">
          <TriangleAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {pending && (
        <ImportPicker
          key={pending.file}
          result={pending.result}
          file={pending.file}
          onCancel={() => setPending(null)}
          onApply={(r, parts) => apply(r, pending.file, parts)}
        />
      )}
    </>
  );
}

const PART_ORDER: ImportPart[] = ['wishes', 'achievements', 'roster', 'good', 'profile', 'realtime'];

/** Lets the user pick which parts of a multi-part file (and which account) to import. */
function ImportPicker({
  result,
  file,
  onApply,
  onCancel,
}: {
  result: ImportResult;
  file: string;
  onApply: (r: ImportResult, parts: ImportPart[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const doneNow = useStore((s) => s.achievements.done);
  const [account, setAccount] = useState(result.accounts?.[0]?.key ?? '');
  const current = result.accounts?.find((a) => a.key === account)?.result ?? result;
  const parts = useMemo(() => PART_ORDER.filter((p) => partsOf(current).includes(p)), [current]);
  const [off, setOff] = useState<Set<ImportPart>>(new Set());
  const chosen = parts.filter((p) => !off.has(p));
  const locale = t.lang === 'de' ? 'de-DE' : 'en-US';
  const day = (s: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(s.replace(' ', 'T')));

  const info = (p: ImportPart): string => {
    switch (p) {
      case 'wishes': {
        const times = current.wishes!.records.map((r) => r.time).sort();
        return t('import.part.wishesInfo', { n: t.num(times.length), from: day(times[0]), to: day(times[times.length - 1]) });
      }
      case 'achievements': {
        const ids = Object.keys(current.achievements!);
        return t('import.part.achievementsInfo', { n: t.num(ids.length), new: t.num(ids.filter((id) => !(id in doneNow)).length) });
      }
      case 'roster':
        return t('import.part.rosterInfo', { n: current.roster!.length });
      case 'good':
        return t('import.part.goodInfo', { c: current.good!.characters?.length ?? 0, w: current.good!.weapons?.length ?? 0, a: current.good!.artifacts?.length ?? 0 });
      case 'profile': {
        const a = current.account ?? {};
        return [a.uid && `UID ${a.uid}`, a.level != null && `AR ${a.level}`, a.worldLevel != null && `WL ${a.worldLevel}`, a.server ?? current.server, a.nickname]
          .filter(Boolean)
          .join(' · ');
      }
      case 'realtime':
        return t('import.part.realtimeInfo', { time: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(current.realtime!.fetchedAt)) });
    }
  };

  return (
    <section className="card stack" aria-labelledby="pick-h">
      <h2 id="pick-h" className="card-title">
        {t('import.pickTitle')}
      </h2>
      <div className="pick-meta muted small">
        <span>
          {current.label} · {file}
        </span>
        {current.savedAt && (
          <span>{t('import.savedAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.savedAt)) })}</span>
        )}
        {result.accounts && (
          <label className="row gap-sm">
            {t('import.account')}
            <select className="select select-sm" value={account} onChange={(e) => setAccount(e.target.value)}>
              {result.accounts.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                  {a.result.account?.uid ? ` · ${a.result.account.uid}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ul className="pick-list">
        {parts.map((p) => (
          <li key={p}>
            <label className="pick-item">
              <input
                type="checkbox"
                checked={!off.has(p)}
                onChange={(e) =>
                  setOff((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.delete(p);
                    else next.add(p);
                    return next;
                  })
                }
              />
              <div>
                <strong>{t(`import.part.${p}` as MessageKey)}</strong>
                <span>{info(p)}</span>
              </div>
            </label>
          </li>
        ))}
      </ul>
      <div className="row gap-sm">
        <Button variant="primary" disabled={!chosen.length} onClick={() => onApply(current, chosen)}>
          {t('import.pickApply')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('import.pickCancel')}
        </Button>
        {!chosen.length && <span className="muted small">{t('import.pickNone')}</span>}
      </div>
    </section>
  );
}

function LinkImport({ onResult }: { onResult: (s: ImportSummary, label: string) => void }) {
  const t = useT();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, FetchProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setProgress({});
    ctrl.current = new AbortController();
    try {
      const res = await importFromLink(link, (p) => setProgress((cur) => ({ ...cur, [p.gachaType]: p })), ctrl.current.signal);
      const summary = applyImport({ kind: 'uigf', label: 'Wish link', wishes: res });
      onResult(summary, 'Wish link');
      setLink('');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (e instanceof GachaApiError) {
        setError(e.code === 'no-proxy' ? t('import.noProxy') : e.code === 'network' ? t('import.networkError') : e.message);
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <form
        className="link-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim() && !busy) run();
        }}
      >
        <label className="sr-only" htmlFor="wish-link">
          {t('import.pasteLabel')}
        </label>
        <input
          id="wish-link"
          className="input"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t('import.pastePlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        {busy ? (
          <Button icon={<Square size={14} />} onClick={() => ctrl.current?.abort()}>
            {t('import.cancel')}
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={!link.trim()}>
            {t('import.fetch')}
          </Button>
        )}
      </form>
      {Object.keys(progress).length > 0 && (
        <ul className="progress-list">
          {Object.values(progress).map((p) => (
            <li key={p.gachaType}>
              {busy && p === Object.values(progress).at(-1) ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              <span>{t(`import.banner.${p.gachaType}` as MessageKey)}</span>
              <span className="muted num">{t('import.pages', { p: p.page, n: p.fetched })}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="notice notice-error" role="alert">
          <TriangleAlert size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function StoredData() {
  const t = useT();
  const wishes = useStore((s) => s.wishes);
  const meta = useStore((s) => s.wishMeta);
  const df = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const exportUigf = () => {
    const blob = new Blob([JSON.stringify(toUigfV4(wishes, meta.uid ?? '0'), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uigf-${meta.uid ?? 'waypoint'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="card" aria-labelledby="stored-h">
      <h2 id="stored-h" className="card-title">
        {t('import.current')}
      </h2>
      {wishes.length === 0 ? (
        <p className="muted">{t('import.currentNone')}</p>
      ) : (
        <>
          <p>
            {t('import.currentSummary', {
              n: t.num(wishes.length),
              uid: meta.uid ?? '—',
              when: meta.importedAt ? df.format(meta.importedAt) : '—',
            })}
          </p>
          <div className="row gap-sm wrap">
            <Button size="sm" icon={<Download size={14} />} onClick={exportUigf}>
              {t('import.exportUigf')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => {
                if (!window.confirm(t('import.clearConfirm'))) return;
                const before = snapshot();
                clearWishes();
                toast({ message: t('import.cleared'), action: { label: t('common.undo'), run: () => restore(before) } });
              }}
            >
              {t('import.clear')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export function Import() {
  const t = useT();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const v = sessionStorage.getItem('waypoint:import-tab');
      sessionStorage.removeItem('waypoint:import-tab');
      return v === 'file' || v === 'full' ? v : 'link';
    } catch {
      return 'link';
    }
  });
  const [result, setResult] = useState<{ s: ImportSummary; label: string } | null>(null);
  const onResult = (s: ImportSummary, label: string) => setResult({ s, label });

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />
      <Segmented
        label={t('import.title')}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setResult(null);
        }}
        options={[
          { value: 'link', label: t('import.tab.link') },
          { value: 'file', label: t('import.tab.file') },
          { value: 'full', label: t('import.tab.full') },
        ]}
      />

      {result && <Summary s={result.s} label={result.label} />}

      {tab === 'link' && (
        <section className="card">
          <ol className="steps">
            <li>{t('import.step1')}</li>
            <li>
              {t('import.step2')}
              <CommandBox label={t('import.cmdFile')} command={COMMANDS.file} />
              <p className="muted small">{t('import.step3file')}</p>
              <FileDrop onResult={onResult} />
            </li>
            <li>
              <CommandBox label={t('import.cmdLink')} command={COMMANDS.link} />
              <LinkImport onResult={onResult} />
            </li>
          </ol>
        </section>
      )}

      {tab === 'file' && (
        <section className="card">
          <FileDrop onResult={onResult} />
          <p className="muted small">{t('import.scanners')}</p>
          <p className="muted small">{t('import.dropHintAch')}</p>
        </section>
      )}

      {tab === 'full' && (
        <section className="card">
          <p>{t('import.fullIntro')}</p>
          <ul className="bullets">
            <li>{t('import.fullWishes')}</li>
            <li>{t('import.fullHoyolab')}</li>
            <li>{t('import.fullEnka')}</li>
          </ul>
          <p className="muted small">{t('import.fullNode')}</p>
          <CommandBox label="PowerShell" command={COMMANDS.full} />
          <p className="muted small">
            {t('import.fullCli')}{' '}
            <a href={`${RAW}/dist/waypoint-export.mjs`} download>
              waypoint-export.mjs
            </a>
          </p>
          <CommandBox label="Node.js" command={COMMANDS.node} />
          <p className="muted small">{t('import.cookieHelp')}</p>
          <FileDrop onResult={onResult} />
          <p className="muted small">{t('import.scanners')}</p>
        </section>
      )}

      <StoredData />
    </div>
  );
}

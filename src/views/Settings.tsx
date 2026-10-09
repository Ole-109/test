import { Download, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { toast } from '../components/toast';
import { Button, Field, Kbd, PageHeader, Segmented, Stepper, Switch, TextInput } from '../components/ui';
import { BASE_CHARACTERS, GAME_DATA_UPDATED } from '../data/characters';
import { useT } from '../i18n';
import { restore, setSetting, snapshot } from '../lib/actions';
import { defaultState, hydrate, setState, useStore } from '../lib/store';
import type { Lang, Server, ThemePref, TitleLang } from '../lib/types';

export function Settings() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'waypoint', exportedAt: new Date().toISOString(), data: snapshot() }, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waypoint-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const data = json?.app === 'waypoint' ? json.data : json;
      if (!data || typeof data !== 'object' || !('settings' in data || 'anime' in data || 'banners' in data)) throw new Error('shape');
      const prev = snapshot();
      setState(hydrate(data));
      toast({ message: t('settings.imported'), tone: 'success', action: { label: t('common.undo'), run: () => restore(prev) } });
    } catch {
      toast({ message: t('settings.importFailed'), tone: 'error' });
    }
  };

  const requestNotify = async (on: boolean) => {
    if (on && 'Notification' in window && Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return;
    }
    setSetting('resinNotify', on && 'Notification' in window && Notification.permission === 'granted');
  };

  return (
    <div className="page settings">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <section className="card settings-section" aria-labelledby="set-app">
        <h2 id="set-app" className="card-title">
          {t('settings.appearance')}
        </h2>
        <Field label={t('settings.theme')}>
          <Segmented
            label={t('settings.theme')}
            value={settings.theme}
            onChange={(v: ThemePref) => setSetting('theme', v)}
            options={(['system', 'dark', 'light'] as ThemePref[]).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
          />
        </Field>
        <Field label={t('settings.language')}>
          <Segmented
            label={t('settings.language')}
            value={settings.lang}
            onChange={(v: Lang) => setSetting('lang', v)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'de', label: 'Deutsch' },
            ]}
          />
        </Field>
      </section>

      <section className="card settings-section" aria-labelledby="set-genshin">
        <h2 id="set-genshin" className="card-title">
          {t('settings.genshin')}
        </h2>
        <Field label={t('settings.server')} hint={t('settings.serverHint')}>
          <Segmented
            label={t('settings.server')}
            value={settings.server}
            onChange={(v: Server) => setSetting('server', v)}
            options={(['america', 'europe', 'asia'] as Server[]).map((v) => ({ value: v, label: t(`server.${v}`) }))}
          />
        </Field>
        <Field label={t('settings.resinCap')}>
          <Stepper label={t('settings.resinCap')} value={settings.resinCap} min={60} max={400} step={20} onChange={(v) => setSetting('resinCap', v)} />
        </Field>
        <Switch checked={settings.resinNotify} onChange={requestNotify} label={t('resin.notify')} description={t('resin.notifyHint')} />
        <Field label={t('settings.proxy')} hint={t('settings.proxyHint')} htmlFor="proxy-url">
          <TextInput
            id="proxy-url"
            type="url"
            inputMode="url"
            placeholder="https://your-worker.workers.dev"
            value={settings.proxyUrl}
            onChange={(e) => setSetting('proxyUrl', e.target.value.trim())}
          />
        </Field>
        <p className="muted small">{t('settings.gameData', { date: GAME_DATA_UPDATED, n: BASE_CHARACTERS.length })}</p>
      </section>

      <section className="card settings-section" aria-labelledby="set-anime">
        <h2 id="set-anime" className="card-title">
          {t('settings.anime')}
        </h2>
        <Field label={t('settings.titleLang')}>
          <Segmented
            label={t('settings.titleLang')}
            value={settings.titleLang}
            onChange={(v: TitleLang) => setSetting('titleLang', v)}
            options={(['romaji', 'english', 'native'] as TitleLang[]).map((v) => ({ value: v, label: t(`settings.titleLang.${v}`) }))}
          />
        </Field>
      </section>

      <section className="card settings-section" aria-labelledby="set-data">
        <h2 id="set-data" className="card-title">
          {t('settings.data')}
        </h2>
        <p className="muted">{t('settings.dataHint')}</p>
        <div className="row gap-sm wrap">
          <Button icon={<Download size={16} />} onClick={exportData}>
            {t('settings.export')}
          </Button>
          <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
            {t('settings.import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importData(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={() => {
              if (!window.confirm(t('settings.wipeConfirm'))) return;
              const prev = snapshot();
              setState({ ...defaultState(), settings: prev.settings });
              toast({ message: t('settings.wiped'), action: { label: t('common.undo'), run: () => restore(prev) }, duration: 10000 });
            }}
          >
            {t('settings.wipe')}
          </Button>
        </div>
      </section>

      <section className="card settings-section" aria-labelledby="set-keys">
        <h2 id="set-keys" className="card-title">
          {t('settings.shortcuts')}
        </h2>
        <dl className="shortcuts">
          <dt>
            <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> / <Kbd>/</Kbd>
          </dt>
          <dd>{t('kbd.palette')}</dd>
          <dt>
            <Kbd>G</Kbd>
          </dt>
          <dd>{t('kbd.go')}</dd>
          <dt>
            <Kbd>N</Kbd>
          </dt>
          <dd>{t('kbd.new')}</dd>
          <dt>
            <Kbd>?</Kbd>
          </dt>
          <dd>{t('kbd.help')}</dd>
        </dl>
      </section>

      <p className="muted small about">{t('settings.about')}</p>
    </div>
  );
}

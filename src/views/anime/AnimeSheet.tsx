import { ExternalLink, Heart, Minus, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Field, IconButton, Segmented, Stepper, TextInput } from '../../components/ui';
import { Cover } from '../../components/visuals';
import { useT } from '../../i18n';
import { addAnime, mergeSynced, patchAnime, removeAnime, restore, setAnimeStatus, snapshot } from '../../lib/actions';
import { fetchByIds, mediaFields } from '../../lib/anilist';
import { behindBy, displayTitle, projectedAiring, STATUSES } from '../../lib/anime';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import type { AnimeEntry, AnimeStatus } from '../../lib/types';
import { useStepWithToast } from './AnimeCard';
import { airLabel, metaLine } from './labels';

const DAYS = [1, 2, 3, 4, 5, 6, 0];

function weekdayNames(lang: string) {
  const f = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'long' });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 1 + i)));
}

export function AnimeSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const now = useNow(30_000);
  const a = useStore((s) => s.anime.find((x) => x.id === id));
  const titleLang = useStore((s) => s.settings.titleLang);
  const step = useStepWithToast();
  const [syncing, setSyncing] = useState(false);
  if (!a) return null;

  const title = displayTitle(a, titleLang);
  const next = projectedAiring(a, now);
  const behind = behindBy(a, now);
  const days = weekdayNames(t.lang);
  const df = new Intl.DateTimeFormat(t.lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium' });

  const remove = () => {
    const snap = snapshot();
    removeAnime(a.id);
    onClose();
    toast({ message: t('common.deleted', { name: title }), action: { label: t('common.undo'), run: () => restore(snap) } });
  };

  const sync = async () => {
    if (!a.anilistId) return;
    setSyncing(true);
    try {
      const [m] = await fetchByIds([a.anilistId]);
      if (m) mergeSynced(new Map([[m.id, mediaFields(m)]]));
      toast({ message: t('anime.synced'), tone: 'success' });
    } catch {
      toast({ message: t('anime.syncFailed'), tone: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const hero = (
    <div className="sheet-hero anime-hero" style={a.color ? ({ '--cover-tint': a.color } as React.CSSProperties) : undefined}>
      {a.banner && <img className="anime-hero-bg" src={a.banner} alt="" referrerPolicy="no-referrer" />}
      <Cover src={a.cover} title={title} color={a.color} className="anime-hero-cover" />
      <div className="anime-hero-text">
        <div className="muted small">{metaLine(t, a)}</div>
        {a.title.native && a.title.native !== title && <div className="muted small">{a.title.native}</div>}
        <div className="row gap-xs wrap">
          {a.airStatus && <span className="badge">{airLabel(t, a.airStatus)}</span>}
          {a.averageScore != null && <span className="badge">{t('anime.avgScore', { n: a.averageScore })}</span>}
        </div>
      </div>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={title}
      hero={hero}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" icon={<Trash2 size={16} />} onClick={remove}>
            {t('anime.deleteConfirm')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.done')}
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label={t('anime.status')}>
          <Segmented
            label={t('anime.status')}
            value={a.status}
            onChange={(s: AnimeStatus) => setAnimeStatus(a.id, s)}
            className="seg-wrap"
            options={STATUSES.map((s) => ({
              value: s,
              label: (
                <>
                  <span className={`status-dot st-${s}`} aria-hidden /> {t(`anime.status.${s}`)}
                </>
              ),
            }))}
          />
        </Field>

        <Field label={t('anime.progress')}>
          <div className="progress-edit">
            <IconButton label={t('anime.minusOne')} onClick={() => step(a, -1)} disabled={a.progress <= 0}>
              <Minus size={18} />
            </IconButton>
            <div className="progress-big">
              <strong className="num">{a.progress}</strong>
              <span className="muted">/ {a.episodes ?? '?'}</span>
            </div>
            <IconButton
              label={t('anime.plusOne')}
              className="accent"
              data-autofocus
              onClick={() => step(a, 1)}
              disabled={!!a.episodes && a.progress >= a.episodes}
            >
              <Plus size={18} />
            </IconButton>
          </div>
          {(next || behind > 0) && (
            <p className="muted small center">
              {behind > 0 && <span className="badge badge-accent">{t.n('anime.behind', behind)}</span>}{' '}
              {next && t('anime.nextEp', { n: next.episode, when: t.when(next.at, now) })}
            </p>
          )}
        </Field>

        <Field label={t('anime.score')}>
          <div className="score-row" role="radiogroup" aria-label={t('anime.score')}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={a.score === n}
                aria-label={String(n)}
                className={`score-pip ${n <= a.score ? 'on' : ''}`}
                onClick={() => patchAnime(a.id, { score: a.score === n ? 0 : n })}
              >
                <Star size={16} fill={n <= a.score ? 'currentColor' : 'none'} />
              </button>
            ))}
            <span className="num score-label">{a.score ? `${a.score}/10` : t('anime.noScore')}</span>
          </div>
        </Field>

        <div className="form-row">
          <Field label={t('anime.totalEpisodes')}>
            <Stepper label={t('anime.totalEpisodes')} value={a.episodes ?? 0} min={0} max={9999} onChange={(n) => patchAnime(a.id, { episodes: n || undefined })} />
          </Field>
          <Field label={t('anime.rewatches')}>
            <Stepper label={t('anime.rewatches')} value={a.rewatches} min={0} max={99} onChange={(rewatches) => patchAnime(a.id, { rewatches })} />
          </Field>
        </div>

        {!a.nextAiring && a.airStatus !== 'FINISHED' && (
          <div className="form-row">
            <Field label={t('anime.airDay')} htmlFor="air-day">
              <select
                id="air-day"
                className="select"
                value={a.airDay ?? ''}
                onChange={(e) => patchAnime(a.id, { airDay: e.target.value === '' ? undefined : Number(e.target.value) })}
              >
                <option value="">{t('anime.notAiring')}</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {days[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('anime.airTime')} htmlFor="air-time">
              <TextInput
                id="air-time"
                type="time"
                value={a.airTime ?? ''}
                disabled={a.airDay == null}
                onChange={(e) => patchAnime(a.id, { airTime: e.target.value })}
              />
            </Field>
          </div>
        )}

        <div className="row gap-xs wrap">
          <Button
            size="sm"
            variant={a.favorite ? 'primary' : 'secondary'}
            icon={<Heart size={14} fill={a.favorite ? 'currentColor' : 'none'} />}
            onClick={() => patchAnime(a.id, { favorite: !a.favorite })}
          >
            {a.favorite ? t('common.unfavorite') : t('common.favorite')}
          </Button>
          {a.anilistId && (
            <>
              <Button size="sm" icon={<RefreshCw size={14} className={syncing ? 'spin' : ''} />} onClick={sync} disabled={syncing}>
                {t('anime.sync')}
              </Button>
              <a className="btn btn-ghost btn-sm" href={`https://anilist.co/anime/${a.anilistId}`} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={14} />
                <span>{t('anime.openAniList')}</span>
              </a>
            </>
          )}
        </div>

        {a.genres.length > 0 && (
          <div className="genres">
            {a.genres.map((g) => (
              <span key={g} className="tag">
                {g}
              </span>
            ))}
          </div>
        )}

        {a.synopsis && (
          <details className="synopsis">
            <summary>{t('anime.synopsis')}</summary>
            <p>{a.synopsis}</p>
          </details>
        )}

        <Field label={t('common.notes')} htmlFor="anime-notes">
          <textarea
            id="anime-notes"
            className="input textarea"
            rows={3}
            value={a.notes}
            placeholder={t('common.notesPlaceholder')}
            onChange={(e) => patchAnime(a.id, { notes: e.target.value })}
          />
        </Field>

        {(a.startedAt || a.completedAt) && (
          <dl className="dates">
            {a.startedAt && (
              <>
                <dt>{t('anime.startedAt')}</dt>
                <dd>{df.format(a.startedAt)}</dd>
              </>
            )}
            {a.completedAt && a.status === 'completed' && (
              <>
                <dt>{t('anime.completedAt')}</dt>
                <dd>{df.format(a.completedAt)}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </Sheet>
  );
}

/** Manual entry for shows that are not on AniList (or when offline). */
export function ManualAnimeSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (a: AnimeEntry) => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [english, setEnglish] = useState('');
  const [episodes, setEpisodes] = useState(12);
  const [cover, setCover] = useState('');
  const [genres, setGenres] = useState('');
  const [status, setStatus] = useState<AnimeStatus>('watching');

  const submit = () => {
    if (!title.trim()) return;
    const safeCover = /^https:\/\//i.test(cover.trim()) ? cover.trim() : undefined;
    const entry = addAnime(
      {
        title: { romaji: title.trim(), english: english.trim() || undefined },
        episodes: episodes || undefined,
        cover: safeCover,
        genres: genres
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
      },
      status,
    );
    toast({ message: t('anime.added', { name: entry.title.romaji, status: t(`anime.status.${status}`) }), tone: 'success' });
    setTitle('');
    setEnglish('');
    setCover('');
    setGenres('');
    onCreated?.(entry);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('anime.addManual')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim()}>
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
        <Field label={t('anime.titleField')} htmlFor="m-title">
          <TextInput id="m-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('anime.titleAltField')} htmlFor="m-en">
          <TextInput id="m-en" value={english} onChange={(e) => setEnglish(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label={t('anime.totalEpisodes')} hint={episodes === 0 ? t('anime.unknown') : undefined}>
            <Stepper label={t('anime.totalEpisodes')} value={episodes} min={0} max={9999} onChange={setEpisodes} />
          </Field>
          <Field label={t('anime.status')} htmlFor="m-status">
            <select id="m-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as AnimeStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`anime.status.${s}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('anime.genres')} hint={t('anime.genresHint')} htmlFor="m-genres">
          <TextInput id="m-genres" value={genres} onChange={(e) => setGenres(e.target.value)} />
        </Field>
        <Field label={t('anime.coverUrl')} htmlFor="m-cover">
          <TextInput id="m-cover" type="url" inputMode="url" placeholder="https://…" value={cover} onChange={(e) => setCover(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}

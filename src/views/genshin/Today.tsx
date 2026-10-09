import { Check, Eye, EyeOff, Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ResinCard } from '../../components/ResinCard';
import { Sheet } from '../../components/Sheet';
import { toast } from '../../components/toast';
import { Button, Field, IconButton, PageHeader, Segmented, Stepper, TextInput } from '../../components/ui';
import { useT, type T } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { addTask, patchTask, removeTask, restore, snapshot, toggleTask } from '../../lib/actions';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { formatDuration, isTaskDone, nextDailyReset, nextWeeklyReset, taskNextReset } from '../../lib/time';
import type { Task, TaskPeriod } from '../../lib/types';
import { TeyvatTabs } from './TeyvatTabs';

const PERIODS: TaskPeriod[] = ['daily', 'weekly', 'monthly', 'cooldown'];
const PERIOD_KEY: Record<TaskPeriod, MessageKey> = {
  daily: 'today.daily',
  weekly: 'today.weekly',
  monthly: 'today.monthly',
  cooldown: 'today.cooldown',
};

export const taskLabel = (t: T, task: Task) => (task.key ? t(task.key as MessageKey) : task.label);

export function Today() {
  const t = useT();
  const now = useNow(1000);
  const server = useStore((s) => s.settings.server);
  const tasks = useStore((s) => s.tasks);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const visible = tasks.filter((x) => !x.hidden);
  const doneCount = visible.filter((x) => isTaskDone(x, now, server)).length;

  return (
    <div className="page">
      <TeyvatTabs />
      <PageHeader
       
        title={t('today.title')}
        subtitle={t('today.subtitle', { server: t(`server.${server}`) })}
      />

      <div className="grid-today">
        <ResinCard />

        <section className="card timers-card" aria-labelledby="timers-h">
          <h2 id="timers-h" className="card-title">
            {t('today.timers')}
          </h2>
          <div className="timers">
            <Timer label={t('home.dailyReset')} at={nextDailyReset(now, server)} now={now} total={86_400_000} />
            <Timer label={t('home.weeklyReset')} at={nextWeeklyReset(now, server)} now={now} total={7 * 86_400_000} />
          </div>
        </section>

        <section className="card tasks-card" aria-labelledby="tasks-h">
          <div className="card-head">
            <h2 id="tasks-h" className="card-title">
              {t('today.routine')}
              <span className="badge">{t('today.progress', { done: doneCount, total: visible.length })}</span>
            </h2>
            <div className="row gap-xs">
              <IconButton label={t('today.addTask')} onClick={() => setAdding(true)}>
                <Plus size={18} />
              </IconButton>
              <IconButton label={t('today.editTasks')} active={editing} onClick={() => setEditing((e) => !e)}>
                <Settings2 size={18} />
              </IconButton>
            </div>
          </div>

          <div className="task-groups">
            {PERIODS.map((p) => {
              const list = tasks.filter((x) => x.period === p && (editing || !x.hidden));
              if (!list.length) return null;
              return (
                <div key={p} className="task-group">
                  <h3 className="group-title">{t(PERIOD_KEY[p])}</h3>
                  <ul className="task-list">
                    {list.map((task) => (
                      <TaskRow key={task.id} task={task} now={now} server={server} editing={editing} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <AddTaskSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function Timer({ label, at, now, total }: { label: string; at: number; now: number; total: number }) {
  const left = at - now;
  return (
    <div className="timer">
      <div className="timer-top">
        <span className="muted small">{label}</span>
        <strong className="num">{formatDuration(left, { seconds: left < 3_600_000 })}</strong>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, (1 - left / total) * 100))}%` }} />
      </div>
    </div>
  );
}

function TaskRow({ task, now, server, editing }: { task: Task; now: number; server: Parameters<typeof isTaskDone>[2]; editing: boolean }) {
  const t = useT();
  const done = isTaskDone(task, now, server);
  const next = taskNextReset(task, now, server);
  const label = taskLabel(t, task);
  const meta =
    task.period === 'cooldown'
      ? done
        ? t('today.readyIn', { t: formatDuration(next - now) })
        : t('today.ready')
      : t('today.resetsIn', { t: formatDuration(next - now) });

  return (
    <li className={`task ${done ? 'is-done' : ''} ${task.hidden ? 'is-hidden' : ''}`}>
      <button
        type="button"
        className="task-check"
        role="checkbox"
        aria-checked={done}
        onClick={() => toggleTask(task.id, !done)}
        disabled={editing}
      >
        <span className="check-box">{done && <Check size={14} strokeWidth={3} />}</span>
        <span className="task-label">{label}</span>
      </button>
      {editing ? (
        <div className="row gap-xs">
          <IconButton
            label={task.hidden ? t('today.show') : t('today.hide')}
            onClick={() => patchTask(task.id, { hidden: !task.hidden })}
          >
            {task.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>
          {!task.key && (
            <IconButton
              label={t('common.delete')}
              onClick={() => {
                const snap = snapshot();
                removeTask(task.id);
                toast({
                  message: t('common.deleted', { name: label }),
                  action: { label: t('common.undo'), run: () => restore(snap) },
                });
              }}
            >
              <Trash2 size={16} />
            </IconButton>
          )}
        </div>
      ) : (
        <span className="task-meta">{meta}</span>
      )}
    </li>
  );
}

function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [period, setPeriod] = useState<TaskPeriod>('daily');
  const [monthDay, setMonthDay] = useState(1);
  const [hours, setHours] = useState(24);

  const submit = () => {
    if (!label.trim()) return;
    addTask({
      label: label.trim(),
      period,
      monthDay: period === 'monthly' ? monthDay : undefined,
      cooldownHours: period === 'cooldown' ? hours : undefined,
    });
    setLabel('');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('today.addTask')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!label.trim()}>
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
        <Field label={t('today.taskName')} htmlFor="task-name">
          <TextInput id="task-name" data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label={t('today.period')}>
          <Segmented
            label={t('today.period')}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p, label: t(PERIOD_KEY[p]) }))}
          />
        </Field>
        {period === 'monthly' && (
          <Field label={t('today.monthDay')}>
            <Stepper label={t('today.monthDay')} value={monthDay} onChange={setMonthDay} min={1} max={28} />
          </Field>
        )}
        {period === 'cooldown' && (
          <Field label={t('today.cooldownHours')}>
            <Stepper label={t('today.cooldownHours')} value={hours} onChange={setHours} min={1} max={720} />
          </Field>
        )}
      </form>
    </Sheet>
  );
}

import type { Server, Task } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Fixed UTC offsets (hours) of the Genshin server regions. They do not observe DST. */
export const SERVER_OFFSET: Record<Server, number> = { america: -5, europe: 1, asia: 8 };
export const RESET_HOUR = 4;

/** Most recent daily reset (04:00 server time) at or before `now`. */
export function lastDailyReset(now: number, server: Server): number {
  const off = SERVER_OFFSET[server] * HOUR;
  const wall = new Date(now + off);
  let reset = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), RESET_HOUR);
  if (now + off < reset) reset -= DAY;
  return reset - off;
}

/** Most recent weekly reset (Monday 04:00 server time) at or before `now`. */
export function lastWeeklyReset(now: number, server: Server): number {
  const daily = lastDailyReset(now, server);
  const off = SERVER_OFFSET[server] * HOUR;
  const dow = new Date(daily + off).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7; // days since Monday
  return daily - back * DAY;
}

/** Most recent monthly reset on `day` of month at 04:00 server time. */
export function lastMonthlyReset(now: number, server: Server, day: number): number {
  const off = SERVER_OFFSET[server] * HOUR;
  const wall = new Date(now + off);
  let y = wall.getUTCFullYear();
  let m = wall.getUTCMonth();
  let reset = Date.UTC(y, m, day, RESET_HOUR) - off;
  if (now < reset) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    reset = Date.UTC(y, m, day, RESET_HOUR) - off;
  }
  return reset;
}

export function nextDailyReset(now: number, server: Server): number {
  return lastDailyReset(now, server) + DAY;
}

export function nextWeeklyReset(now: number, server: Server): number {
  return lastWeeklyReset(now, server) + 7 * DAY;
}

export function nextMonthlyReset(now: number, server: Server, day: number): number {
  const off = SERVER_OFFSET[server] * HOUR;
  const last = new Date(lastMonthlyReset(now, server, day) + off);
  return Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, day, RESET_HOUR) - off;
}

/** Start of the period the task currently belongs to (for completion checks). */
export function periodStart(task: Task, now: number, server: Server): number {
  switch (task.period) {
    case 'daily':
      return lastDailyReset(now, server);
    case 'weekly':
      return lastWeeklyReset(now, server);
    case 'monthly':
      return lastMonthlyReset(now, server, task.monthDay ?? 1);
    case 'cooldown':
      return now - (task.cooldownHours ?? 24) * HOUR;
  }
}

export function isTaskDone(task: Task, now: number, server: Server): boolean {
  return task.doneAt != null && task.doneAt >= periodStart(task, now, server);
}

/** When the task becomes available / resets next. */
export function taskNextReset(task: Task, now: number, server: Server): number {
  switch (task.period) {
    case 'daily':
      return nextDailyReset(now, server);
    case 'weekly':
      return nextWeeklyReset(now, server);
    case 'monthly':
      return nextMonthlyReset(now, server, task.monthDay ?? 1);
    case 'cooldown':
      return (task.doneAt ?? now) + (task.cooldownHours ?? 24) * HOUR;
  }
}

/** Compact duration such as "3h 12m" or "2d 4h". */
export function formatDuration(ms: number, opts: { seconds?: boolean } = {}): string {
  if (ms <= 0) return opts.seconds ? '0s' : '0m';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (opts.seconds) return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
  return `${Math.max(m, 1)}m`;
}

/** Day of the week on the server (0 = Sunday); the game day starts at the 04:00 reset. */
export function serverWeekday(now: number, server: Server): number {
  return new Date(lastDailyReset(now, server) + SERVER_OFFSET[server] * HOUR).getUTCDay();
}

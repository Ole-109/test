import type { Task } from '../lib/types';

/** Built-in routine tasks. Labels come from i18n via `key`. */
export const DEFAULT_TASKS: Task[] = [
  { id: 'commissions', key: 'task.commissions', label: 'Daily Commissions', period: 'daily' },
  { id: 'resin', key: 'task.resin', label: 'Spend Original Resin', period: 'daily' },
  { id: 'teapot', key: 'task.teapot', label: 'Collect Realm Currency', period: 'daily' },
  { id: 'checkin', key: 'task.checkin', label: 'HoYoLAB check-in', period: 'daily' },
  { id: 'bp-daily', key: 'task.bpDaily', label: 'Battle Pass dailies', period: 'daily' },
  { id: 'bosses', key: 'task.bosses', label: 'Weekly bosses (3 discounted)', period: 'weekly' },
  { id: 'bp-weekly', key: 'task.bpWeekly', label: 'Battle Pass weeklies', period: 'weekly' },
  { id: 'transformer', key: 'task.transformer', label: 'Parametric Transformer', period: 'cooldown', cooldownHours: 166 },
  { id: 'abyss', key: 'task.abyss', label: 'Spiral Abyss', period: 'monthly', monthDay: 16 },
  { id: 'theater', key: 'task.theater', label: 'Imaginarium Theater', period: 'monthly', monthDay: 1 },
  { id: 'bargains', key: 'task.bargains', label: "Paimon's Bargains", period: 'monthly', monthDay: 1 },
];

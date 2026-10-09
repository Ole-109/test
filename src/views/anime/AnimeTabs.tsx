import { CalendarDays, ChartNoAxesColumn, Library } from 'lucide-react';
import { SubNav } from '../../components/SubNav';
import { useT } from '../../i18n';

export function AnimeTabs() {
  const t = useT();
  return (
    <SubNav
      label={t('nav.anime')}
      items={[
        { to: '/anime', label: t('nav.library'), icon: <Library size={16} /> },
        { to: '/anime/schedule', label: t('nav.schedule'), icon: <CalendarDays size={16} /> },
        { to: '/anime/stats', label: t('nav.stats'), icon: <ChartNoAxesColumn size={16} /> },
      ]}
    />
  );
}

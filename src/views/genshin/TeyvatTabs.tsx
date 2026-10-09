import { Calculator, ListChecks, Package, Sparkles, Upload, Users } from 'lucide-react';
import { SubNav } from '../../components/SubNav';
import { useT } from '../../i18n';

export function TeyvatTabs() {
  const t = useT();
  return (
    <SubNav
      label={t('nav.teyvat')}
      items={[
        { to: '/teyvat', label: t('nav.today'), icon: <ListChecks size={16} /> },
        { to: '/teyvat/characters', label: t('nav.characters'), icon: <Users size={16} /> },
        { to: '/teyvat/inventory', label: t('nav.inventory'), icon: <Package size={16} /> },
        { to: '/teyvat/wishes', label: t('nav.wishes'), icon: <Sparkles size={16} /> },
        { to: '/teyvat/planner', label: t('nav.planner'), icon: <Calculator size={16} /> },
        { to: '/teyvat/import', label: t('nav.import'), icon: <Upload size={16} /> },
      ]}
    />
  );
}

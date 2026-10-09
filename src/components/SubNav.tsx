import type { ReactNode } from 'react';
import { href, useRoute, type Route } from '../lib/router';

export function SubNav({ label, items }: { label: string; items: { to: Route; label: string; icon: ReactNode }[] }) {
  const route = useRoute();
  return (
    <nav className="subnav" aria-label={label}>
      {items.map((i) => (
        <a key={i.to} href={href(i.to)} className={route === i.to ? 'is-active' : ''} aria-current={route === i.to ? 'page' : undefined}>
          {i.icon}
          <span>{i.label}</span>
        </a>
      ))}
    </nav>
  );
}

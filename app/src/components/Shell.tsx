'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { Mark } from './Emblem';
import s from './Shell.module.css';

const NAV = [
  { href: '/', label: 'Play' },
  { href: '/league', label: 'League' },
  { href: '/jar', label: 'The Jar' },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <div className={s.shell}>
        <a href="#content" className={s.skip}>Skip to content</a>
        <header className={s.bar}>
          <Link href="/" className={s.brand} aria-label="Pinky, home">
            <Mark size={26} />
            <span className={s.word}>Pinky</span>
          </Link>
          <nav className={s.nav} aria-label="Main">
            {NAV.map((n) => {
              const on = n.href === '/' ? path === '/' : path.startsWith(n.href);
              return (<Link key={n.href} href={n.href} className={`${s.link} ${on ? s.on : ''}`} aria-current={on ? 'page' : undefined}>{n.label}</Link>);
            })}
          </nav>
        </header>
        <span id="content" />
        {children}
        <footer className={s.foot}>Pinky runs on NEAR testnet with test chips. Every move is a transaction you can open.</footer>
      </div>
    </MotionConfig>
  );
}

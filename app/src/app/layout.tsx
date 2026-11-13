import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';
import { Shell } from '../components/Shell';

// Self-hosted (SIL Open Font License) so a build never depends on a font CDN being reachable.
const display = localFont({ src: '../fonts/caprasimo-400.woff2', weight: '400', variable: '--f-display', display: 'swap' });
const text = localFont({ src: '../fonts/hanken-grotesk-var.woff2', weight: '400 800', variable: '--f-text', display: 'swap' });
const hand = localFont({ src: '../fonts/caveat-var.woff2', weight: '400 700', variable: '--f-hand', display: 'swap' });

export const metadata = { title: 'Pinky: keep it or break it', description: 'A promise game against characters who hold their own money, on NEAR testnet.' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${hand.variable}`}>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}

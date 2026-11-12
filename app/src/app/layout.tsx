import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Pinky: keep it or break it', description: 'A promise game against characters who hold their own money, on NEAR testnet.' };

export default function Layout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}

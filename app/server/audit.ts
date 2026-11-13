// The audit as a function: read every game of one epoch from the chain and recompute each character decision
// from the public policy. No keys. The command line (scripts/audit.ts) and the judge page (/api/audit) share it.
import { auditGame, type AuditConfig, type AuditGame } from '../../core/audit.ts';
import { view } from './chain.ts';
import { specOf } from './characters.ts';

export interface AuditRow { id: number; verdict: 'PASS' | 'FAIL' | 'SKIP'; note?: string; failed: { name: string; detail?: string }[] }
export interface AuditGroup { name: string; account: string; secretRevealed: boolean; rows: AuditRow[] }
export interface AuditReport {
  epoch: number;
  groups: AuditGroup[];
  /** Accounts on the contract that could not be audited, with the reason. */
  skippedAccounts: { account: string; reason: string }[];
  pass: number; fail: number; skip: number;
}

const BATCH = 20;

async function gamesOfEpoch(epoch: number): Promise<AuditGame[]> {
  const next = Number(await view<number>('get_next_game_id'));
  const out: AuditGame[] = [];
  for (let lo = 1; lo < next; lo += BATCH) {
    const ids = Array.from({ length: Math.min(BATCH, next - lo) }, (_, i) => lo + i);
    const games = await Promise.all(ids.map((id) => view<AuditGame | null>('get_game', { game_id: id })));
    for (const g of games) if (g && g.epoch === epoch) out.push(g);
  }
  return out;
}

/** The newest epoch every character has finished and revealed, or 0 when none has. */
export async function latestClosedEpoch(): Promise<number> {
  const all = await view<[string, { epoch: number; epoch_open: boolean }][]>('list_characters');
  if (all.length === 0) return 0;
  return Math.min(...all.map(([, c]) => (c.epoch_open ? c.epoch - 1 : c.epoch)));
}

export async function runAudit(epoch: number, only?: string): Promise<AuditReport> {
  const [cfg, games, listed] = await Promise.all([
    view<AuditConfig>('get_config'),
    gamesOfEpoch(epoch),
    view<[string, unknown][]>('list_characters'),
  ]);
  const report: AuditReport = { epoch, groups: [], skippedAccounts: [], pass: 0, fail: 0, skip: 0 };
  // Every character on the contract: the six and any outside agent. An agent is judged by the policy it stored on chain.
  for (const account of listed.map(([a]) => a).sort()) {
    let spec;
    try { spec = await specOf(account); } catch (e) { report.skippedAccounts.push({ account, reason: (e as Error).message }); continue; }
    if (only && spec.name.toLowerCase() !== only.toLowerCase()) continue;
    const mine = games.filter((g) => g.character === account);
    if (mine.length === 0) continue;
    const secret = await view<string | null>('get_epoch_secret', { character: account, epoch });
    const rows: AuditRow[] = mine.map((g) => {
      const a = auditGame(g, spec, secret, cfg);
      if (a.verdict === 'PASS') report.pass++; else if (a.verdict === 'FAIL') report.fail++; else report.skip++;
      return { id: g.id, verdict: a.verdict, note: a.note, failed: a.checks.filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail })) };
    });
    report.groups.push({ name: spec.name, account, secretRevealed: !!secret, rows });
  }
  return report;
}

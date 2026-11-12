// Browser side of the game. A guest key lives in localStorage; the key can only call the game contract.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, getTransactionLastResult } from 'near-api-js';

export const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? 'https://test.rpc.fastnear.com';
export const GAME = process.env.NEXT_PUBLIC_GAME_CONTRACT ?? 'pinky.fad-pilot1.testnet';
export const OTIS = process.env.NEXT_PUBLIC_OTIS ?? 'otis.fad-pilot1.testnet';
export const EXPLORER = 'https://testnet.nearblocks.io';
export const STAKE = 10n ** 22n; // 0.01 NEAR
const GAS = 10n * 10n ** 12n;
const STORE = 'pinky.guest.v1';

export type Move = 'KEEP' | 'BREAK';
export interface Guest { accountId: string; secretKey: string }
export interface Game {
  id: number; status: 'Opened' | 'Sealed' | 'Played' | 'Settled'; commit: string | null;
  player_move: Move | null; character_move: Move | null;
  outcome: null | { kind: string; player_payout: string; character_payout: string; jar_delta: string };
}

export const provider = new JsonRpcProvider({ url: RPC });

export function loadGuest(): Guest | null {
  try { const s = localStorage.getItem(STORE); return s ? (JSON.parse(s) as Guest) : null; } catch { return null; }
}
const saveGuest = (g: Guest) => { try { localStorage.setItem(STORE, JSON.stringify(g)); } catch { /* private mode: the key lives for this tab only */ } };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `request failed (${r.status})`);
  return j as T;
}

/** Make a key in the browser, ask the usher for a funded account that accepts only that function-call key. */
export async function createGuest(): Promise<{ guest: Guest; create_tx: string; deposit_tx: string }> {
  const kp = KeyPair.fromRandom('ed25519');
  const u = await post<{ account_id: string; create_tx: string; deposit_tx: string }>('/api/usher', { public_key: kp.getPublicKey().toString() });
  const guest = { accountId: u.account_id, secretKey: kp.toString() };
  saveGuest(guest);
  return { guest, create_tx: u.create_tx, deposit_tx: u.deposit_tx };
}

const account = (g: Guest) => new Account(g.accountId, provider, KeyPairSigner.fromSecretKey(g.secretKey as `ed25519:${string}`));

export async function viewGame(id: number): Promise<Game | null> {
  return ((await provider.callFunction({ contractId: GAME, method: 'get_game', args: { game_id: id }, blockQuery: { finality: 'optimistic' } })) as unknown as Game | null) ?? null;
}
/** Poll until the game reaches a status: our RPC node can trail the node that took the last transaction. */
export async function viewGameWhen(id: number, status: Game['status'], tries = 20): Promise<Game | null> {
  let g: Game | null = null;
  for (let i = 0; i < tries; i++) {
    g = await viewGame(id);
    if (g && g.status === status) return g;
    await new Promise((r) => setTimeout(r, 500));
  }
  return g;
}
export async function balanceOf(accountId: string): Promise<bigint> {
  const b = await provider.callFunction<string>({ contractId: GAME, method: 'get_balance', args: { account_id: accountId }, blockQuery: { finality: 'optimistic' } });
  return BigInt(b ?? '0');
}

export async function openGame(g: Guest): Promise<{ gameId: number; tx: string }> {
  const r = await account(g).callFunctionRaw({ contractId: GAME, methodName: 'open_game', args: { character: OTIS, stake: STAKE.toString() }, gas: GAS });
  return { gameId: Number(getTransactionLastResult(r)), tx: r.transaction.hash };
}
export const askSeal = (gameId: number) => post<{ game_id: number; refused: boolean; tx: string; reason: string }>('/api/seal', { game_id: gameId });
export async function playMove(g: Guest, gameId: number, move: Move): Promise<string> {
  const r = await account(g).callFunctionRaw({ contractId: GAME, methodName: 'play', args: { game_id: gameId, player_move: move }, gas: GAS });
  return r.transaction.hash;
}
export const askReveal = (gameId: number) => post<{ game_id: number; move: Move; tx: string }>('/api/reveal', { game_id: gameId });

export const near = (yocto: bigint | string): string => {
  const y = BigInt(yocto); const whole = y / 10n ** 24n; const frac = (y % 10n ** 24n) / 10n ** 20n; // 4 decimals
  return `${whole}.${frac.toString().padStart(4, '0')}`;
};

const GAME_KEY = 'pinky.game.v1';
export const loadGame = (): number | null => { try { const v = localStorage.getItem(GAME_KEY); return v ? Number(v) : null; } catch { return null; } };
export const rememberGame = (id: number) => { try { localStorage.setItem(GAME_KEY, String(id)); } catch { /* tab-only */ } };
export const forgetGame = () => { try { localStorage.removeItem(GAME_KEY); } catch { /* ignore */ } };

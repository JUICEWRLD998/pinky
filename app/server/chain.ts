// Chain access for the server routes and setup scripts. Keys come from the environment only.
import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';

export const RPC = process.env.NEAR_RPC ?? 'https://test.rpc.fastnear.com';
export const GAME = process.env.GAME_CONTRACT ?? 'pinky.fad-pilot1.testnet';
export const ROOT = process.env.ROOT_ACCOUNT ?? 'fad-pilot1.testnet';
export const GUESTS = `guests.${ROOT}`;
export const OTIS = `otis.${ROOT}`;
export const EXPLORER = 'https://testnet.nearblocks.io';

export const provider = new JsonRpcProvider({ url: RPC });

export function signerAccount(accountId: string, privateKey: string | undefined): Account {
  if (!privateKey) throw new Error(`missing key for ${accountId}`);
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(privateKey as `ed25519:${string}`));
}

/** View call at final head. */
export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction<T>({ contractId: GAME, method, args, blockQuery: { finality: 'final' } })) as T;
}

export const NEAR = 10n ** 24n;
/** Thousandths of a NEAR as yocto, without floats. */
export const milli = (n: number): bigint => BigInt(n) * 10n ** 21n;

export type Move = 'KEEP' | 'BREAK';

export interface GameView {
  id: number;
  player: string;
  character: string;
  stake: string;
  status: 'Opened' | 'Sealed' | 'Played' | 'Settled';
  commit: string | null;
  snapshot: string | null;
  epoch: number;
  jar_at_seal: string;
  char_balance_at_seal: string;
  player_move: Move | null;
  character_move: Move | null;
  outcome: null | { kind: string; player_payout: string; character_payout: string; jar_delta: string; house: string };
}

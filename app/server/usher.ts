// The usher makes a guest account that holds ONLY a function-call key, then puts real testnet NEAR in the
// game ledger for it. One transaction creates the account, funds its gas and adds the key, so no full-access
// key for the guest ever exists. The ledger credit is a real deposit from the usher account, never invented.
import { randomBytes } from 'node:crypto';
import { PublicKey, actions } from 'near-api-js';
import { GAME, GUESTS, milli, signerAccount } from './chain.ts';

/** Methods a guest key may call on the game contract. Nothing else, and never the usher or Otis methods. */
export const GUEST_METHODS = ['open_game', 'play', 'withdraw', 'claim_timeout'];
/** NEAR left in the guest account for gas, and the key allowance cap. */
export const GAS_FUND = milli(30);
export const ALLOWANCE = milli(100);
/** Test chips credited to the game ledger. */
export const CHIPS = milli(50);

export interface Usher { account_id: string; create_tx: string; deposit_tx: string }

export async function usherGuest(publicKey: string): Promise<Usher> {
  const pk = PublicKey.fromString(publicKey);
  if (pk.keyType !== 0) throw new Error('need an ed25519 public key');
  const account_id = `g-${randomBytes(5).toString('hex')}.${GUESTS}`;
  const usher = signerAccount(GUESTS, process.env.USHER_KEY);
  const created = await usher.signAndSendTransaction({
    receiverId: account_id,
    actions: [
      actions.createAccount(),
      actions.transfer(GAS_FUND),
      actions.addFunctionCallAccessKey(pk, GAME, GUEST_METHODS, ALLOWANCE),
    ],
  });
  const dep = await usher.callFunctionRaw({ contractId: GAME, methodName: 'deposit_for', args: { account_id }, deposit: CHIPS });
  return { account_id, create_tx: created.transaction.hash, deposit_tx: dep.transaction.hash };
}

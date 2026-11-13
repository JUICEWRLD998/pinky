//! Tests for apology, backing and agent entry. Every money test ends with the conservation check:
//! every ledger balance plus the Jar plus the house balance plus open stakes equals total_held.
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{env, testing_env, AccountId, NearToken};
use pinky_contract::payoff::Move;
use pinky_contract::{Pinky, Status};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const MIN_STAKE: u128 = NEAR / 100;
const NS: u64 = 1_000_000_000;

fn acct(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn ctx(who: &AccountId, deposit: u128, t: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acct("pinky.test"))
        .predecessor_account_id(who.clone())
        .signer_account_id(who.clone())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1000))
        .block_timestamp(t * NS);
    testing_env!(b.build());
}
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
fn salt(n: u8) -> String {
    to_hex(&[n; 32])
}
fn commit_for(id: u64, mv: Move, s: &str) -> String {
    to_hex(&env::sha256(format!("{}|{}|{}", id, mv.as_str(), s).as_bytes()))
}
const ALL: [&str; 6] = ["mabel.test", "alice.test", "bob.test", "carol.test", "agent.test", "house.test"];

fn fresh() -> Pinky {
    let house = acct("house.test");
    ctx(&house, 0, 1);
    let mut c = Pinky::new(200, 5000, 40, 500, 60, U128(MIN_STAKE), U128(10 * NEAR), U128(NEAR / 100), house.clone());
    ctx(&acct("mabel.test"), 0, 1);
    c.register_character("mabel-v1".to_string());
    c.commit_epoch(to_hex(&env::sha256(&[7u8; 32])));
    ctx(&acct("mabel.test"), 10 * NEAR, 1);
    c.deposit();
    for p in ["alice.test", "bob.test", "carol.test"] {
        ctx(&acct(p), 20 * NEAR, 1);
        c.deposit();
    }
    c
}

fn open_stakes(c: &Pinky) -> u128 {
    (1..c.get_next_game_id()).map(|id| c.get_game(id).unwrap()).filter(|g| g.status != Status::Settled).map(|g| 2 * g.stake.0).sum()
}
fn conserved(c: &Pinky) -> bool {
    let sum: u128 = ALL.iter().map(|a| c.get_balance(acct(a)).0).sum::<u128>() + c.get_jar().0 + c.get_house_balance().0 + open_stakes(c);
    sum == c.solvency().total_held.0
}

fn play(c: &mut Pinky, who: &AccountId, stake: u128, pm: Move, cm: Move, t: u64, n: u8) -> u64 {
    let mabel = acct("mabel.test");
    ctx(who, 0, t);
    let id = c.open_game(mabel.clone(), U128(stake));
    ctx(&mabel, 0, t + 1);
    c.seal(id, commit_for(id, cm, &salt(n)), "{}".to_string());
    ctx(who, 0, t + 2);
    c.play(id, pm);
    ctx(&mabel, 0, t + 3);
    c.reveal(id, cm, salt(n));
    id
}

// ---------- apology ----------

#[test]
fn apology_moves_the_fee_into_the_jar_and_sets_the_flag() {
    let mut c = fresh();
    let (alice, mabel) = (acct("alice.test"), acct("mabel.test"));
    let before = c.get_balance(alice.clone()).0;
    ctx(&alice, 0, 5);
    c.apologize(mabel.clone());
    assert_eq!(c.get_balance(alice.clone()).0, before - 2 * MIN_STAKE);
    assert_eq!(c.get_jar().0, 2 * MIN_STAKE);
    assert!(c.get_pair(alice, mabel).apology_paid);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "already apologized")]
fn apology_twice_is_refused() {
    let mut c = fresh();
    ctx(&acct("alice.test"), 0, 5);
    c.apologize(acct("mabel.test"));
    c.apologize(acct("mabel.test"));
}

#[test]
#[should_panic(expected = "unknown character")]
fn apology_to_a_non_character_is_refused() {
    let mut c = fresh();
    ctx(&acct("alice.test"), 0, 5);
    c.apologize(acct("bob.test"));
}

#[test]
#[should_panic(expected = "insufficient ledger balance for the apology fee")]
fn apology_needs_the_fee() {
    let mut c = fresh();
    ctx(&acct("nobody.test"), 0, 5);
    c.apologize(acct("mabel.test"));
}

#[test]
fn apology_survives_a_later_game_and_feeds_the_jar_bonus() {
    let mut c = fresh();
    let alice = acct("alice.test");
    ctx(&alice, 0, 5);
    c.apologize(acct("mabel.test"));
    // jar = 0.02 NEAR; both keep at stake 1 NEAR: bonus = min(0.5 NEAR, jar/40) each
    let id = play(&mut c, &alice, NEAR, Move::Keep, Move::Keep, 10, 1);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.player_payout.0, NEAR + 2 * MIN_STAKE / 40);
    assert!(c.get_pair(alice, acct("mabel.test")).apology_paid);
    assert!(conserved(&c));
}

// ---------- backing ----------

#[test]
fn first_backer_buys_at_par_and_owner_gets_shares_for_the_existing_bankroll() {
    let mut c = fresh();
    let (alice, mabel) = (acct("alice.test"), acct("mabel.test"));
    ctx(&alice, 0, 5);
    c.back(mabel.clone(), U128(5 * NEAR));
    let unit = 1_000_000_000_000u128;
    assert_eq!(c.get_shares(mabel.clone(), mabel.clone()).0, 10 * NEAR / unit);
    assert_eq!(c.get_shares(mabel.clone(), alice.clone()).0, 5 * NEAR / unit);
    assert_eq!(c.get_balance(mabel.clone()).0, 15 * NEAR);
    assert_eq!(c.get_pool(mabel).total_shares.0, 15 * NEAR / unit);
    assert!(conserved(&c));
}

#[test]
fn backers_share_the_character_winnings_and_losses() {
    let mut c = fresh();
    let (alice, bob, mabel) = (acct("alice.test"), acct("bob.test"), acct("mabel.test"));
    ctx(&alice, 0, 5);
    c.back(mabel.clone(), U128(10 * NEAR)); // pool 20 NEAR, Alice owns half
    // Bob breaks against a keeping Mabel for 2 NEAR: Mabel loses her 2 NEAR stake.
    play(&mut c, &bob, 2 * NEAR, Move::Break, Move::Keep, 10, 1);
    assert_eq!(c.get_balance(mabel.clone()).0, 18 * NEAR);
    ctx(&alice, 0, 30);
    let shares = c.get_shares(mabel.clone(), alice.clone());
    let before = c.get_balance(alice.clone()).0;
    c.unback(mabel.clone(), shares);
    let got = c.get_balance(alice.clone()).0 - before;
    // Alice owns 10 of 20 shares: she gets half of 18 NEAR.
    assert_eq!(got, 9 * NEAR);
    assert!(conserved(&c));
}

#[test]
fn a_later_backer_pays_the_current_price_not_par() {
    let mut c = fresh();
    let (alice, bob, carol, mabel) = (acct("alice.test"), acct("bob.test"), acct("carol.test"), acct("mabel.test"));
    ctx(&alice, 0, 5);
    c.back(mabel.clone(), U128(10 * NEAR)); // 20 NEAR, 20 units of shares
    play(&mut c, &bob, 4 * NEAR, Move::Break, Move::Keep, 10, 1); // Mabel loses 4 NEAR: pool 16 NEAR
    ctx(&carol, 0, 30);
    c.back(mabel.clone(), U128(8 * NEAR)); // price is now 0.8: 8 NEAR buys 10 units of shares
    let unit = 1_000_000_000_000u128;
    assert_eq!(c.get_shares(mabel.clone(), carol.clone()).0, 10 * NEAR / unit);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "character has games in play")]
fn backing_is_refused_while_a_game_is_open() {
    let mut c = fresh();
    let (alice, bob, mabel) = (acct("alice.test"), acct("bob.test"), acct("mabel.test"));
    ctx(&bob, 0, 5);
    c.open_game(mabel.clone(), U128(NEAR));
    ctx(&alice, 0, 6);
    c.back(mabel, U128(NEAR));
}

#[test]
#[should_panic(expected = "not enough shares")]
fn unback_more_than_you_hold_is_refused() {
    let mut c = fresh();
    let (alice, mabel) = (acct("alice.test"), acct("mabel.test"));
    ctx(&alice, 0, 5);
    c.back(mabel.clone(), U128(NEAR));
    c.unback(mabel, U128(u128::MAX));
}

#[test]
#[should_panic(expected = "below the minimum stake")]
fn backing_dust_is_refused() {
    let mut c = fresh();
    ctx(&acct("alice.test"), 0, 5);
    c.back(acct("mabel.test"), U128(MIN_STAKE - 1));
}

#[test]
fn a_broke_character_restarts_its_pool_and_old_shares_are_worth_nothing() {
    let mut c = fresh();
    let (alice, bob, mabel) = (acct("alice.test"), acct("bob.test"), acct("mabel.test"));
    ctx(&alice, 0, 5);
    c.back(mabel.clone(), U128(NEAR)); // pool 11 NEAR
    // Drain Mabel: she pays inference until her ledger is empty.
    let mut t = 10;
    while c.get_balance(mabel.clone()).0 > 0 {
        ctx(&mabel, 0, t);
        let bal = c.get_balance(mabel.clone()).0;
        c.pay_inference(U128(bal.min(NEAR / 100)), "m".to_string());
        t += 1;
    }
    let old = c.get_shares(mabel.clone(), alice.clone()).0;
    assert!(old > 0);
    // Bob revives her with a new bankroll: a new pool epoch starts at par.
    ctx(&bob, 0, t);
    c.back(mabel.clone(), U128(2 * NEAR));
    assert_eq!(c.get_pool(mabel.clone()).epoch, 1);
    assert_eq!(c.get_shares(mabel.clone(), alice.clone()).0, 0, "old shares are worth nothing");
    assert!(c.get_shares(mabel.clone(), bob.clone()).0 > 0);
    assert!(conserved(&c));
}

#[test]
fn rounding_never_lets_a_backer_take_more_than_they_put_in_at_the_same_price() {
    let mut c = fresh();
    let (alice, mabel) = (acct("alice.test"), acct("mabel.test"));
    ctx(&alice, 0, 5);
    let before = c.get_balance(alice.clone()).0;
    c.back(mabel.clone(), U128(3 * NEAR + 777));
    let s = c.get_shares(mabel.clone(), alice.clone());
    c.unback(mabel, s);
    assert!(c.get_balance(alice).0 <= before, "round trip must not create money");
    assert!(conserved(&c));
}

// ---------- agents ----------

fn commit() -> String {
    to_hex(&env::sha256(&[9u8; 32]))
}

#[test]
fn entering_an_agent_registers_funds_and_opens_an_epoch_in_one_call() {
    let mut c = fresh();
    let agent = acct("agent.test");
    ctx(&agent, NEAR, 5);
    c.enter_agent("agent-v1".to_string(), "{\"base\":6000}".to_string(), commit());
    let ch = c.get_character(agent.clone()).unwrap();
    assert!(ch.epoch_open);
    assert_eq!(ch.epoch, 1);
    assert_eq!(ch.policy.as_deref(), Some("{\"base\":6000}"));
    assert_eq!(c.get_balance(agent).0, NEAR);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "already registered")]
fn an_agent_cannot_enter_twice() {
    let mut c = fresh();
    ctx(&acct("agent.test"), NEAR, 5);
    c.enter_agent("a".to_string(), "{}".to_string(), commit());
    c.enter_agent("a".to_string(), "{}".to_string(), commit());
}

#[test]
#[should_panic(expected = "bankroll below 5 minimum stakes")]
fn an_agent_needs_a_bankroll() {
    let mut c = fresh();
    ctx(&acct("agent.test"), 4 * MIN_STAKE, 5);
    c.enter_agent("a".to_string(), "{}".to_string(), commit());
}

#[test]
#[should_panic(expected = "policy must be 1..400 bytes")]
fn an_oversized_policy_is_refused() {
    let mut c = fresh();
    ctx(&acct("agent.test"), NEAR, 5);
    c.enter_agent("a".to_string(), "x".repeat(401), commit());
}

#[test]
fn an_entered_agent_can_be_played_like_any_character() {
    let mut c = fresh();
    let (agent, alice) = (acct("agent.test"), acct("alice.test"));
    ctx(&agent, NEAR, 5);
    c.enter_agent("agent-v1".to_string(), "{}".to_string(), commit());
    ctx(&alice, 0, 10);
    let id = c.open_game(agent.clone(), U128(MIN_STAKE));
    ctx(&agent, 0, 11);
    c.seal(id, commit_for(id, Move::Keep, &salt(3)), "{}".to_string());
    ctx(&alice, 0, 12);
    c.play(id, Move::Keep);
    ctx(&agent, 0, 13);
    c.reveal(id, Move::Keep, salt(3));
    assert_eq!(c.get_game(id).unwrap().status, Status::Settled);
    assert!(conserved(&c));
}

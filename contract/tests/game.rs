//! Unit tests for the Pinky contract in the NEAR mock runtime. Every test that moves money ends with
//! the conservation check: every balance plus the Jar plus the house balance plus open stakes equals total_held.
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{env, testing_env, AccountId, NearToken};
use pinky_contract::payoff::Move;
use pinky_contract::{Pinky, Status};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const WINDOW: u64 = 60;
const NS: u64 = 1_000_000_000;

fn acct(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn player() -> AccountId {
    acct("player.test")
}
fn player2() -> AccountId {
    acct("player2.test")
}
fn mabel() -> AccountId {
    acct("mabel.test")
}
fn house() -> AccountId {
    acct("house.test")
}

fn ctx(who: &AccountId, deposit: u128, t_secs: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acct("pinky.test"))
        .predecessor_account_id(who.clone())
        .signer_account_id(who.clone())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1000))
        .block_timestamp(t_secs * NS);
    testing_env!(b.build());
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
fn salt(n: u8) -> String {
    to_hex(&[n; 32])
}
fn commit_for(id: u64, mv: Move, salt: &str) -> String {
    to_hex(&env::sha256(format!("{}|{}|{}", id, mv.as_str(), salt).as_bytes()))
}

fn fresh() -> Pinky {
    ctx(&house(), 0, 1);
    let mut c = Pinky::new(200, 5000, 40, 500, WINDOW, U128(1_000_000), U128(10 * NEAR), U128(NEAR / 100), house());
    ctx(&mabel(), 0, 1);
    c.register_character("persona-hash-mabel".to_string());
    c.commit_epoch(to_hex(&env::sha256(&[7u8; 32])));
    ctx(&house(), 20 * NEAR, 1);
    c.deposit_for(mabel());
    ctx(&player(), 20 * NEAR, 1);
    c.deposit();
    ctx(&player2(), 20 * NEAR, 1);
    c.deposit();
    c
}

fn open_stakes(c: &Pinky) -> u128 {
    let mut t = 0;
    for id in 1..c.get_next_game_id() {
        let g = c.get_game(id).unwrap();
        if g.status != Status::Settled {
            t += 2 * g.stake.0;
        }
    }
    t
}

fn ledger_sum(c: &Pinky) -> u128 {
    c.get_balance(player()).0
        + c.get_balance(player2()).0
        + c.get_balance(mabel()).0
        + c.get_balance(house()).0
        + c.get_jar().0
        + c.get_house_balance().0
        + open_stakes(c)
}

fn conserved(c: &Pinky) -> bool {
    ledger_sum(c) == c.solvency().total_held.0
}

/// Run open, seal, play, reveal at time t. Returns the game id.
fn play_full(c: &mut Pinky, who: &AccountId, stake: u128, pm: Move, cm: Move, t: u64, n: u8) -> u64 {
    ctx(who, 0, t);
    let id = c.open_game(mabel(), U128(stake));
    let commit = commit_for(id, cm, &salt(n));
    ctx(&mabel(), 0, t + 1);
    c.seal(id, commit, "{\"policy\":\"test\"}".to_string());
    ctx(who, 0, t + 2);
    c.play(id, pm);
    ctx(&mabel(), 0, t + 3);
    c.reveal(id, cm, salt(n));
    id
}

#[test]
fn all_four_outcomes_pay_and_conserve() {
    let mut c = fresh();
    let s = NEAR;
    // both_break: pot 2 NEAR, rake 2% to house, rest into the Jar.
    let id = play_full(&mut c, &player(), s, Move::Break, Move::Break, 10, 1);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "both_break");
    assert_eq!(o.player_payout.0, 0);
    assert_eq!(c.get_jar().0, 2 * s - 2 * s * 200 / 10_000);
    assert!(conserved(&c));
    // both_keep: bonus = min(stake * 50%, jar / 40) each, paid from the Jar.
    let jar_before = c.get_jar().0;
    let bonus = std::cmp::min(s * 5000 / 10_000, jar_before / 40);
    assert!(bonus > 0, "control: the Jar must pay a real bonus");
    let id = play_full(&mut c, &player(), s, Move::Keep, Move::Keep, 20, 2);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "both_keep");
    assert_eq!(o.player_payout.0, s + bonus);
    assert_eq!(c.get_jar().0, jar_before - 2 * bonus);
    assert!(conserved(&c));
    // player_breaks.
    let id = play_full(&mut c, &player(), s, Move::Break, Move::Keep, 30, 3);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "player_breaks");
    assert_eq!(o.player_payout.0, 2 * s - 2 * s * 200 / 10_000);
    assert!(conserved(&c));
    // character_breaks.
    let id = play_full(&mut c, &player(), s, Move::Keep, Move::Break, 40, 4);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "character_breaks");
    assert_eq!(o.character_payout.0, 2 * s - 2 * s * 200 / 10_000);
    assert!(conserved(&c));
    // record and pair bookkeeping.
    let rec = c.get_record(player());
    assert_eq!((rec.games, rec.keeps, rec.active), (4, 2, 0));
    let pair = c.get_pair(player(), mabel());
    assert_eq!((pair.games, pair.player_keeps, pair.player_breaks), (4, 2, 2));
    assert_eq!(c.get_character(mabel()).unwrap().games, 4);
}

#[test]
fn planted_control_conservation_checker_detects_a_leak() {
    let mut c = fresh();
    assert!(conserved(&c));
    // An open game holds 2 stakes outside balances: the checker must count them, so it stays true.
    ctx(&player(), 0, 10);
    c.open_game(mabel(), U128(NEAR));
    assert!(conserved(&c));
    // A forged extra yocto in the sum must make the check fail.
    assert_ne!(ledger_sum(&c) + 1, c.solvency().total_held.0);
}

#[test]
#[should_panic(expected = "attach a deposit")]
fn deposit_with_nothing_attached_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 2);
    c.deposit();
}

#[test]
#[should_panic(expected = "move and salt do not match the commit")]
fn wrong_salt_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    let commit = commit_for(id, Move::Keep, &salt(1));
    ctx(&mabel(), 0, 11);
    c.seal(id, commit, "{}".to_string());
    ctx(&player(), 0, 12);
    c.play(id, Move::Keep);
    ctx(&mabel(), 0, 13);
    c.reveal(id, Move::Keep, salt(2));
}

#[test]
#[should_panic(expected = "move and salt do not match the commit")]
fn flipped_move_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    let commit = commit_for(id, Move::Keep, &salt(1));
    ctx(&mabel(), 0, 11);
    c.seal(id, commit, "{}".to_string());
    ctx(&player(), 0, 12);
    c.play(id, Move::Break);
    ctx(&mabel(), 0, 13);
    c.reveal(id, Move::Break, salt(1));
}

#[test]
#[should_panic(expected = "game is not sealed")]
fn play_before_seal_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    c.play(id, Move::Keep);
}

#[test]
#[should_panic(expected = "game is not sealed")]
fn second_play_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&mabel(), 0, 11);
    c.seal(id, commit_for(id, Move::Keep, &salt(1)), "{}".to_string());
    ctx(&player(), 0, 12);
    c.play(id, Move::Keep);
    c.play(id, Move::Break);
}

#[test]
#[should_panic(expected = "only the character")]
fn only_the_character_can_seal() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    c.seal(id, commit_for(id, Move::Keep, &salt(1)), "{}".to_string());
}

#[test]
#[should_panic(expected = "only the player")]
fn only_the_player_can_play() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&mabel(), 0, 11);
    c.seal(id, commit_for(id, Move::Keep, &salt(1)), "{}".to_string());
    ctx(&player2(), 0, 12);
    c.play(id, Move::Keep);
}

#[test]
fn character_timeout_before_seal_pays_player_both_stakes() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&player2(), 0, 10 + WINDOW + 1);
    c.claim_timeout(id);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "character_timeout");
    assert_eq!(o.player_payout.0, 2 * NEAR);
    assert!(conserved(&c));
    assert_eq!(c.get_character(mabel()).unwrap().open_games, 0);
}

#[test]
fn player_timeout_after_seal_forfeits_five_percent() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&mabel(), 0, 11);
    c.seal(id, commit_for(id, Move::Keep, &salt(1)), "{}".to_string());
    ctx(&player2(), 0, 11 + WINDOW + 1);
    c.claim_timeout(id);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "player_timeout");
    assert_eq!(o.player_payout.0, NEAR - NEAR * 500 / 10_000);
    assert_eq!(o.character_payout.0, NEAR + NEAR * 500 / 10_000);
    assert!(conserved(&c));
}

#[test]
fn character_timeout_after_play_pays_player() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&mabel(), 0, 11);
    c.seal(id, commit_for(id, Move::Break, &salt(1)), "{}".to_string());
    ctx(&player(), 0, 12);
    c.play(id, Move::Keep);
    ctx(&player2(), 0, 12 + WINDOW + 1);
    c.claim_timeout(id);
    let o = c.get_game(id).unwrap().outcome.unwrap();
    assert_eq!(o.kind, "character_timeout");
    assert_eq!(o.player_payout.0, 2 * NEAR);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "seal window still open")]
fn early_timeout_claim_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&player2(), 0, 10 + WINDOW - 1);
    c.claim_timeout(id);
}

#[test]
#[should_panic(expected = "game already settled")]
fn settled_game_cannot_settle_again() {
    let mut c = fresh();
    let id = play_full(&mut c, &player(), NEAR, Move::Keep, Move::Keep, 10, 1);
    ctx(&player2(), 0, 1000);
    c.claim_timeout(id);
}

#[test]
fn refuse_returns_both_stakes() {
    let mut c = fresh();
    let pb = c.get_balance(player()).0;
    let cb = c.get_balance(mabel()).0;
    ctx(&player(), 0, 10);
    let id = c.open_game(mabel(), U128(NEAR));
    ctx(&mabel(), 0, 11);
    c.refuse(id, "{\"why\":\"closed door\"}".to_string());
    assert_eq!(c.get_game(id).unwrap().outcome.unwrap().kind, "refused");
    assert_eq!(c.get_balance(player()).0, pb);
    assert_eq!(c.get_balance(mabel()).0, cb);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "insufficient ledger balance")]
fn withdraw_above_balance_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    let bal = c.get_balance(player()).0;
    let _ = c.withdraw(U128(bal + 1));
}

#[test]
fn withdraw_reduces_balance_and_total_held() {
    let mut c = fresh();
    let held = c.solvency().total_held.0;
    ctx(&player(), 0, 10);
    let _ = c.withdraw(U128(NEAR));
    assert_eq!(c.solvency().total_held.0, held - NEAR);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "stake outside the allowed range")]
fn stake_above_max_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    c.open_game(mabel(), U128(11 * NEAR));
}

#[test]
#[should_panic(expected = "too many open games")]
fn open_game_cap_per_player() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    for _ in 0..4 {
        c.open_game(mabel(), U128(NEAR));
    }
}

#[test]
#[should_panic(expected = "character balance too low")]
fn character_without_funds_cannot_be_challenged() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    c.open_game(mabel(), U128(10 * NEAR));
    c.open_game(mabel(), U128(10 * NEAR));
    ctx(&player2(), 0, 10);
    c.open_game(mabel(), U128(10 * NEAR));
}

#[test]
fn epoch_reveal_and_recommit() {
    let mut c = fresh();
    ctx(&mabel(), 0, 20);
    c.reveal_epoch(to_hex(&[7u8; 32]));
    assert_eq!(c.get_epoch_secret(mabel(), 1), Some(to_hex(&[7u8; 32])));
    c.commit_epoch(to_hex(&env::sha256(&[8u8; 32])));
    assert_eq!(c.get_character(mabel()).unwrap().epoch, 2);
}

#[test]
#[should_panic(expected = "secret does not match the commit")]
fn epoch_reveal_mismatch_is_rejected() {
    let mut c = fresh();
    ctx(&mabel(), 0, 20);
    c.reveal_epoch(to_hex(&[9u8; 32]));
}

#[test]
#[should_panic(expected = "settle or time out all games first")]
fn epoch_reveal_with_open_game_is_rejected() {
    let mut c = fresh();
    ctx(&player(), 0, 10);
    c.open_game(mabel(), U128(NEAR));
    ctx(&mabel(), 0, 11);
    c.reveal_epoch(to_hex(&[7u8; 32]));
}

#[test]
fn pay_inference_moves_balance_to_house() {
    let mut c = fresh();
    let cb = c.get_balance(mabel()).0;
    let amt = 400_000_000_000_000_000_000u128;
    ctx(&mabel(), 0, 10);
    c.pay_inference(U128(amt), "qwen3.8-27b|abc".to_string());
    assert_eq!(c.get_balance(mabel()).0, cb - amt);
    assert_eq!(c.get_house_balance().0, amt);
    assert!(conserved(&c));
    ctx(&house(), 0, 11);
    c.claim_house(U128(amt));
    assert_eq!(c.get_house_balance().0, 0);
    assert!(conserved(&c));
}

#[test]
#[should_panic(expected = "only the house account")]
fn only_house_claims_house_balance() {
    let mut c = fresh();
    ctx(&mabel(), 0, 10);
    c.pay_inference(U128(1_000), "m".to_string());
    ctx(&player(), 0, 11);
    c.claim_house(U128(1_000));
}

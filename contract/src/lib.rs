//! Pinky: a promise game on NEAR. One contract holds the ledger, every game, the Swear Jar and the
//! characters. Parameters are set in `new` and cannot change: there is no setter and no migrate method.
//!
//! Game flow: open_game (player) -> seal (character) -> play (player) -> reveal (character) -> settled.
//! Either side can be timed out by anyone through claim_timeout.
pub mod payoff;

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseError};
use payoff::{Move, Params, Settlement};

const NS: u64 = 1_000_000_000;
const MAX_SNAPSHOT: usize = 1500;
const MAX_ACTIVE_PER_PLAYER: u32 = 3;
/// Backing shares are counted in units of 1e12 yocto so every product fits in u128. Dust stays in the pool.
const UNIT: u128 = 1_000_000_000_000;
/// An agent must come with at least this many minimum stakes of bankroll.
const AGENT_MIN_STAKES: u128 = 5;
const MAX_POLICY: usize = 400;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Balances,
    Games,
    Characters,
    Records,
    Pairs,
    EpochSecrets,
    Pools,
    Holdings,
}

/// Parameters frozen at deploy.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub rake_bps: u32,
    pub y_max_bps: u32,
    pub drip: u32,
    pub forfeit_bps: u32,
    /// Seconds each side has to act before anyone can claim a timeout.
    pub window_secs: u64,
    pub min_stake: U128,
    pub max_stake: U128,
    /// Largest single inference payment a character may make to the house.
    pub max_inference: U128,
    /// The account that may move house fees into its ledger balance.
    pub house: AccountId,
}

impl Config {
    fn params(&self) -> Params {
        Params {
            rake_bps: self.rake_bps as u128,
            y_max_bps: self.y_max_bps as u128,
            drip: self.drip as u128,
            forfeit_bps: self.forfeit_bps as u128,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Opened,
    Sealed,
    Played,
    Settled,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Outcome {
    /// both_keep, player_breaks, character_breaks, both_break, refused, character_timeout, player_timeout
    pub kind: String,
    pub player_payout: U128,
    pub character_payout: U128,
    /// Signed decimal string: negative when the Jar paid a bonus.
    pub jar_delta: String,
    pub house: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Game {
    pub id: u64,
    pub player: AccountId,
    pub character: AccountId,
    pub stake: U128,
    pub status: Status,
    pub opened_ns: u64,
    pub sealed_ns: u64,
    pub played_ns: u64,
    /// Epoch of the character secret this game belongs to.
    pub epoch: u32,
    /// sha256 hex of "game_id|MOVE|salt".
    pub commit: Option<String>,
    /// Policy inputs the character claims it used. The audit replays them; the contract does not judge them.
    pub snapshot: Option<String>,
    /// Facts the contract itself recorded at seal time, so the audit does not trust the character for them.
    pub jar_at_seal: U128,
    pub char_balance_at_seal: U128,
    pub player_move: Option<Move>,
    pub character_move: Option<Move>,
    pub outcome: Option<Outcome>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Character {
    pub persona_hash: String,
    pub registered_ns: u64,
    pub epoch: u32,
    pub epoch_commit: Option<String>,
    /// True while the current epoch secret is committed and not yet revealed.
    pub epoch_open: bool,
    pub open_games: u32,
    pub games: u64,
    pub keeps: u64,
    /// Policy weights (JSON) for an agent entered by an outside party. None for the built-in characters.
    pub policy: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Record {
    pub games: u64,
    pub keeps: u64,
    /// Games opened and not yet settled.
    pub active: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Pair {
    pub games: u64,
    pub player_keeps: u64,
    pub player_breaks: u64,
    pub last_player_move: Option<Move>,
    pub last_character_move: Option<Move>,
    /// The player paid the apology fee to this character: a closed door reopens.
    pub apology_paid: bool,
}

/// Backing pool of one character. Shares are counted in units of 1e12 yocto of the character ledger balance.
#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Pool {
    pub total_shares: U128,
    /// Bumped when the character goes broke: shares of an older epoch are worth nothing.
    pub epoch: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Holding {
    pub epoch: u32,
    pub shares: U128,
}

#[near(serializers = [json])]
pub struct PoolView {
    pub total_shares: U128,
    pub epoch: u32,
    pub balance: U128,
    /// What 1e12 shares redeem for now, in yocto.
    pub value_per_unit: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Pinky {
    config: Config,
    balances: LookupMap<AccountId, u128>,
    games: LookupMap<u64, Game>,
    next_game_id: u64,
    characters: IterableMap<AccountId, Character>,
    records: LookupMap<AccountId, Record>,
    pairs: LookupMap<String, Pair>,
    epoch_secrets: LookupMap<String, String>,
    pools: LookupMap<AccountId, Pool>,
    holdings: LookupMap<String, Holding>,
    jar: u128,
    house_balance: u128,
    /// Every yocto the contract owes: ledger balances, escrowed stakes, the Jar and the house balance.
    total_held: u128,
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b >= b'a' && b <= b'f'))
}

fn to_hex(bytes: &[u8]) -> String {
    const T: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(T[(b >> 4) as usize] as char);
        out.push(T[(b & 15) as usize] as char);
    }
    out
}

fn from_hex64(s: &str) -> Vec<u8> {
    require!(is_hex64(s), "expected 64 lowercase hex characters");
    let val = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
    s.as_bytes().chunks(2).map(|c| (val(c[0]) << 4) | val(c[1])).collect()
}

fn holding_key(character: &AccountId, backer: &AccountId) -> String {
    format!("{}|{}", character, backer)
}

fn pair_key(player: &AccountId, character: &AccountId) -> String {
    format!("{}|{}", player, character)
}

#[near(event_json(standard = "pinky"))]
pub enum Event {
    #[event_version("1.0.0")]
    Deposit { account_id: String, amount: String },
    #[event_version("1.0.0")]
    Withdraw { account_id: String, amount: String },
    #[event_version("1.0.0")]
    CharacterRegistered { character: String, persona_hash: String },
    #[event_version("1.0.0")]
    GameOpened { game_id: u64, player: String, character: String, stake: String },
    #[event_version("1.0.0")]
    Sealed { game_id: u64, commit: String, epoch: u32 },
    #[event_version("1.0.0")]
    Played { game_id: u64 },
    #[event_version("1.0.0")]
    Settled { game_id: u64, kind: String, player_move: Option<String>, character_move: Option<String>, player_payout: String, character_payout: String, jar_delta: String, house: String },
    #[event_version("1.0.0")]
    InferencePaid { character: String, amount: String, memo: String },
    #[event_version("1.0.0")]
    EpochCommitted { character: String, epoch: u32, commit: String },
    #[event_version("1.0.0")]
    EpochRevealed { character: String, epoch: u32 },
    #[event_version("1.0.0")]
    HouseClaimed { amount: String },
    #[event_version("1.0.0")]
    ApologyPaid { player: String, character: String, fee: String },
    #[event_version("1.0.0")]
    Backed { backer: String, character: String, amount: String, shares: String },
    #[event_version("1.0.0")]
    Unbacked { backer: String, character: String, amount: String, shares: String },
    #[event_version("1.0.0")]
    AgentEntered { agent: String, persona_hash: String, bankroll: String },
}

#[near(serializers = [json])]
pub struct Solvency {
    pub account_balance: U128,
    pub total_held: U128,
    pub jar: U128,
    pub house_balance: U128,
}

#[near]
impl Pinky {
    #[init]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        rake_bps: u32,
        y_max_bps: u32,
        drip: u32,
        forfeit_bps: u32,
        window_secs: u64,
        min_stake: U128,
        max_stake: U128,
        max_inference: U128,
        house: AccountId,
    ) -> Self {
        let config = Config { rake_bps, y_max_bps, drip, forfeit_bps, window_secs, min_stake, max_stake, max_inference, house };
        payoff::validate(&config.params());
        require!(window_secs >= 1 && window_secs <= 7 * 86_400, "window_secs must be 1..604800");
        require!(min_stake.0 >= 1_000 && min_stake.0 <= max_stake.0, "need 1000 <= min_stake <= max_stake");
        require!(max_stake.0 <= 1_000_000_000_000_000_000_000_000_000u128, "max_stake too large");
        Self {
            config,
            balances: LookupMap::new(Key::Balances),
            games: LookupMap::new(Key::Games),
            next_game_id: 1,
            characters: IterableMap::new(Key::Characters),
            records: LookupMap::new(Key::Records),
            pairs: LookupMap::new(Key::Pairs),
            epoch_secrets: LookupMap::new(Key::EpochSecrets),
            pools: LookupMap::new(Key::Pools),
            holdings: LookupMap::new(Key::Holdings),
            jar: 0,
            house_balance: 0,
            total_held: 0,
        }
    }

    // ---------- money in and out ----------

    /// Credit the attached NEAR to the caller ledger balance.
    #[payable]
    pub fn deposit(&mut self) {
        let who = env::predecessor_account_id();
        self.credit_deposit(who);
    }

    /// Credit the attached NEAR to another account ledger balance (a usher funds a guest this way).
    #[payable]
    pub fn deposit_for(&mut self, account_id: AccountId) {
        self.credit_deposit(account_id);
    }

    /// Move NEAR from the caller ledger balance to the caller account. A failed transfer is re-credited.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let who = env::predecessor_account_id();
        require!(amount.0 > 0, "amount must be positive");
        let bal = self.bal(&who);
        require!(bal >= amount.0, "insufficient ledger balance");
        self.set_bal(&who, bal - amount.0);
        self.total_held -= amount.0;
        Event::Withdraw { account_id: who.to_string(), amount: amount.0.to_string() }.emit();
        Promise::new(who.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(Self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).on_withdraw(who, amount))
    }

    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, amount: U128, #[callback_result] result: Result<(), PromiseError>) {
        if result.is_err() {
            let bal = self.bal(&account_id);
            self.set_bal(&account_id, bal + amount.0);
            self.total_held += amount.0;
        }
    }

    /// The house moves fees it earned into its ledger balance. It withdraws like anyone else.
    pub fn claim_house(&mut self, amount: U128) {
        let house = self.config.house.clone();
        require!(env::predecessor_account_id() == house, "only the house account");
        require!(amount.0 > 0 && amount.0 <= self.house_balance, "amount exceeds house balance");
        self.house_balance -= amount.0;
        let bal = self.bal(&house);
        self.set_bal(&house, bal + amount.0);
        Event::HouseClaimed { amount: amount.0.to_string() }.emit();
    }

    // ---------- characters ----------

    /// Register the caller as a character. persona_hash identifies its public policy file.
    pub fn register_character(&mut self, persona_hash: String) {
        let who = env::predecessor_account_id();
        require!(!self.characters.contains_key(&who), "already registered");
        require!(!persona_hash.is_empty() && persona_hash.len() <= 128, "persona_hash must be 1..128 bytes");
        self.characters.insert(
            who.clone(),
            Character { persona_hash: persona_hash.clone(), registered_ns: env::block_timestamp(), epoch: 0, epoch_commit: None, epoch_open: false, open_games: 0, games: 0, keeps: 0, policy: None },
        );
        Event::CharacterRegistered { character: who.to_string(), persona_hash }.emit();
    }

    /// Commit to a new epoch secret: commit is the sha256 of the 32 secret bytes, lowercase hex.
    pub fn commit_epoch(&mut self, commit: String) {
        let who = env::predecessor_account_id();
        require!(is_hex64(&commit), "commit must be 64 lowercase hex characters");
        let c = self.characters.get_mut(&who).unwrap_or_else(|| env::panic_str("not a registered character"));
        require!(!c.epoch_open, "reveal the current epoch first");
        c.epoch += 1;
        c.epoch_commit = Some(commit.clone());
        c.epoch_open = true;
        let epoch = c.epoch;
        Event::EpochCommitted { character: who.to_string(), epoch, commit }.emit();
    }

    /// Reveal the epoch secret. Allowed only when no game of this character is unsettled.
    pub fn reveal_epoch(&mut self, secret: String) {
        let who = env::predecessor_account_id();
        let bytes = from_hex64(&secret);
        let c = self.characters.get_mut(&who).unwrap_or_else(|| env::panic_str("not a registered character"));
        require!(c.epoch_open, "no open epoch");
        require!(c.open_games == 0, "settle or time out all games first");
        require!(Some(to_hex(&env::sha256(&bytes))) == c.epoch_commit, "secret does not match the commit");
        c.epoch_open = false;
        let epoch = c.epoch;
        self.epoch_secrets.insert(format!("{}|{}", who, epoch), secret);
        Event::EpochRevealed { character: who.to_string(), epoch }.emit();
    }

    /// The character pays for an inference call out of its own balance. The memo names the model and a hash.
    pub fn pay_inference(&mut self, amount: U128, memo: String) {
        let who = env::predecessor_account_id();
        require!(self.characters.contains_key(&who), "not a registered character");
        require!(amount.0 > 0 && amount.0 <= self.config.max_inference.0, "amount outside 1..max_inference");
        require!(memo.len() <= 128, "memo too long");
        let bal = self.bal(&who);
        require!(bal >= amount.0, "insufficient ledger balance");
        self.set_bal(&who, bal - amount.0);
        self.house_balance += amount.0;
        Event::InferencePaid { character: who.to_string(), amount: amount.0.to_string(), memo }.emit();
    }

    /// An outside party enters an agent: it registers as a character with a policy, a bankroll and an open epoch in one call.
    #[payable]
    pub fn enter_agent(&mut self, persona_hash: String, policy: String, epoch_commit: String) {
        let who = env::predecessor_account_id();
        require!(!self.characters.contains_key(&who), "already registered");
        require!(!persona_hash.is_empty() && persona_hash.len() <= 128, "persona_hash must be 1..128 bytes");
        require!(!policy.is_empty() && policy.len() <= MAX_POLICY, "policy must be 1..400 bytes of JSON");
        require!(is_hex64(&epoch_commit), "epoch_commit must be 64 lowercase hex characters");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount >= AGENT_MIN_STAKES * self.config.min_stake.0, "bankroll below 5 minimum stakes");
        self.credit_deposit(who.clone());
        self.characters.insert(
            who.clone(),
            Character { persona_hash: persona_hash.clone(), registered_ns: env::block_timestamp(), epoch: 1, epoch_commit: Some(epoch_commit.clone()), epoch_open: true, open_games: 0, games: 0, keeps: 0, policy: Some(policy) },
        );
        Event::CharacterRegistered { character: who.to_string(), persona_hash: persona_hash.clone() }.emit();
        Event::EpochCommitted { character: who.to_string(), epoch: 1, commit: epoch_commit }.emit();
        Event::AgentEntered { agent: who.to_string(), persona_hash, bankroll: amount.to_string() }.emit();
    }

    // ---------- apology and backing ----------

    /// The player pays an apology fee (2 minimum stakes) into the Swear Jar. That character door reopens for this player.
    pub fn apologize(&mut self, character: AccountId) {
        let player = env::predecessor_account_id();
        require!(self.characters.contains_key(&character), "unknown character");
        require!(player != character, "cannot apologize to yourself");
        let key = pair_key(&player, &character);
        let mut pair = self.pairs.get(&key).cloned().unwrap_or_default();
        require!(!pair.apology_paid, "already apologized");
        let fee = 2 * self.config.min_stake.0;
        let pb = self.bal(&player);
        require!(pb >= fee, "insufficient ledger balance for the apology fee");
        self.set_bal(&player, pb - fee);
        self.jar += fee;
        pair.apology_paid = true;
        self.pairs.insert(key, pair);
        Event::ApologyPaid { player: player.to_string(), character: character.to_string(), fee: fee.to_string() }.emit();
    }

    /// Back a character: move ledger money into its bankroll and receive shares of it at the current price.
    pub fn back(&mut self, character: AccountId, amount: U128) {
        let backer = env::predecessor_account_id();
        require!(backer != character, "a character adds to its own bankroll with deposit");
        let c = self.characters.get(&character).unwrap_or_else(|| env::panic_str("unknown character"));
        require!(c.open_games == 0, "character has games in play");
        require!(amount.0 >= self.config.min_stake.0, "below the minimum stake");
        let amount_u = amount.0 / UNIT;
        require!(amount_u > 0, "amount too small");
        let pb = self.bal(&backer);
        require!(pb >= amount.0, "insufficient ledger balance");
        let cb = self.bal(&character);
        let cb_u = cb / UNIT;
        let mut pool = self.pools.get(&character).cloned().unwrap_or_default();
        if pool.total_shares.0 == 0 && cb_u > 0 {
            // First backer: the character own balance becomes its owner shares, so the price starts at one share per unit.
            self.holdings.insert(holding_key(&character, &character), Holding { epoch: pool.epoch, shares: U128(cb_u) });
            pool.total_shares = U128(cb_u);
        }
        if cb_u == 0 && pool.total_shares.0 > 0 {
            // Broke: older shares are worth nothing. A new epoch starts the pool again.
            pool.epoch += 1;
            pool.total_shares = U128(0);
        }
        let out = if pool.total_shares.0 == 0 {
            amount_u
        } else {
            amount_u.checked_mul(pool.total_shares.0).unwrap_or_else(|| env::panic_str("overflow")) / cb_u
        };
        require!(out > 0, "amount buys no shares");
        self.set_bal(&backer, pb - amount.0);
        self.set_bal(&character, cb + amount.0);
        pool.total_shares = U128(pool.total_shares.0 + out);
        let hk = holding_key(&character, &backer);
        let mut h = self.holdings.get(&hk).cloned().unwrap_or_default();
        if h.epoch != pool.epoch {
            h = Holding { epoch: pool.epoch, shares: U128(0) };
        }
        h.shares = U128(h.shares.0 + out);
        self.holdings.insert(hk, h);
        self.pools.insert(character.clone(), pool);
        Event::Backed { backer: backer.to_string(), character: character.to_string(), amount: amount.0.to_string(), shares: out.to_string() }.emit();
    }

    /// Redeem shares for their share of the character bankroll, back into the backer ledger balance.
    pub fn unback(&mut self, character: AccountId, shares: U128) {
        let backer = env::predecessor_account_id();
        require!(shares.0 > 0, "shares must be positive");
        let c = self.characters.get(&character).unwrap_or_else(|| env::panic_str("unknown character"));
        require!(c.open_games == 0, "character has games in play");
        let mut pool = self.pools.get(&character).cloned().unwrap_or_else(|| env::panic_str("no pool"));
        let hk = holding_key(&character, &backer);
        let mut h = self.holdings.get(&hk).cloned().unwrap_or_default();
        require!(h.epoch == pool.epoch && h.shares.0 >= shares.0, "not enough shares");
        let cb = self.bal(&character);
        let value_u = shares.0.checked_mul(cb / UNIT).unwrap_or_else(|| env::panic_str("overflow")) / pool.total_shares.0;
        let amount = value_u * UNIT;
        require!(amount > 0 && amount <= cb, "shares redeem for nothing");
        self.set_bal(&character, cb - amount);
        let pb = self.bal(&backer);
        self.set_bal(&backer, pb + amount);
        h.shares = U128(h.shares.0 - shares.0);
        pool.total_shares = U128(pool.total_shares.0 - shares.0);
        self.holdings.insert(hk, h);
        self.pools.insert(character.clone(), pool);
        Event::Unbacked { backer: backer.to_string(), character: character.to_string(), amount: amount.to_string(), shares: shares.0.to_string() }.emit();
    }

    // ---------- the game ----------

    /// The player opens a game against a character. Both stakes leave their ledger balances now.
    pub fn open_game(&mut self, character: AccountId, stake: U128) -> u64 {
        let player = env::predecessor_account_id();
        require!(player != character, "cannot play yourself");
        require!(stake.0 >= self.config.min_stake.0 && stake.0 <= self.config.max_stake.0, "stake outside the allowed range");
        let c = self.characters.get(&character).unwrap_or_else(|| env::panic_str("unknown character"));
        require!(c.epoch_open, "character has no open epoch");
        let epoch = c.epoch;
        let pb = self.bal(&player);
        let cb = self.bal(&character);
        require!(pb >= stake.0, "player balance too low");
        require!(cb >= stake.0, "character balance too low");
        let mut rec = self.records.get(&player).cloned().unwrap_or_default();
        require!(rec.active < MAX_ACTIVE_PER_PLAYER, "too many open games");
        rec.active += 1;
        self.records.insert(player.clone(), rec);
        self.set_bal(&player, pb - stake.0);
        self.set_bal(&character, cb - stake.0);
        self.characters.get_mut(&character).unwrap().open_games += 1;
        let id = self.next_game_id;
        self.next_game_id += 1;
        let game = Game {
            id,
            player: player.clone(),
            character: character.clone(),
            stake,
            status: Status::Opened,
            opened_ns: env::block_timestamp(),
            sealed_ns: 0,
            played_ns: 0,
            epoch,
            commit: None,
            snapshot: None,
            jar_at_seal: U128(0),
            char_balance_at_seal: U128(0),
            player_move: None,
            character_move: None,
            outcome: None,
        };
        self.games.insert(id, game);
        Event::GameOpened { game_id: id, player: player.to_string(), character: character.to_string(), stake: stake.0.to_string() }.emit();
        id
    }

    /// The character seals its move before the player moves. snapshot holds the policy inputs it used.
    pub fn seal(&mut self, game_id: u64, commit: String, snapshot: String) {
        let mut g = self.get_game_or_panic(game_id);
        require!(env::predecessor_account_id() == g.character, "only the character");
        require!(g.status == Status::Opened, "game is not waiting for a seal");
        require!(env::block_timestamp() <= g.opened_ns + self.window_ns(), "seal window closed");
        require!(is_hex64(&commit), "commit must be 64 lowercase hex characters");
        require!(snapshot.len() <= MAX_SNAPSHOT, "snapshot too long");
        g.status = Status::Sealed;
        g.sealed_ns = env::block_timestamp();
        g.commit = Some(commit.clone());
        g.snapshot = Some(snapshot);
        g.jar_at_seal = U128(self.jar);
        g.char_balance_at_seal = U128(self.bal(&g.character));
        let epoch = g.epoch;
        self.games.insert(game_id, g);
        Event::Sealed { game_id, commit, epoch }.emit();
    }

    /// The character refuses to play (a closed door). Both stakes are returned and nobody is penalised.
    pub fn refuse(&mut self, game_id: u64, snapshot: String) {
        let mut g = self.get_game_or_panic(game_id);
        require!(env::predecessor_account_id() == g.character, "only the character");
        require!(g.status == Status::Opened, "game is not waiting for a seal");
        require!(snapshot.len() <= MAX_SNAPSHOT, "snapshot too long");
        g.snapshot = Some(snapshot);
        let s = Settlement { player: g.stake.0, character: g.stake.0, jar_delta: 0, house: 0 };
        self.finish(g, s, "refused");
    }

    /// The player picks KEEP or BREAK after the character has sealed.
    pub fn play(&mut self, game_id: u64, player_move: Move) {
        let mut g = self.get_game_or_panic(game_id);
        require!(env::predecessor_account_id() == g.player, "only the player");
        require!(g.status == Status::Sealed, "game is not sealed");
        require!(env::block_timestamp() <= g.sealed_ns + self.window_ns(), "play window closed");
        g.status = Status::Played;
        g.played_ns = env::block_timestamp();
        g.player_move = Some(player_move);
        self.games.insert(game_id, g);
        Event::Played { game_id }.emit();
    }

    /// The character reveals its move and salt. The contract checks them against the commit, then settles.
    pub fn reveal(&mut self, game_id: u64, character_move: Move, salt: String) {
        let mut g = self.get_game_or_panic(game_id);
        require!(env::predecessor_account_id() == g.character, "only the character");
        require!(g.status == Status::Played, "game is not waiting for a reveal");
        require!(env::block_timestamp() <= g.played_ns + self.window_ns(), "reveal window closed");
        require!(is_hex64(&salt), "salt must be 64 lowercase hex characters");
        let preimage = format!("{}|{}|{}", game_id, character_move.as_str(), salt);
        require!(Some(to_hex(&env::sha256(preimage.as_bytes()))) == g.commit, "move and salt do not match the commit");
        g.character_move = Some(character_move);
        let pm = g.player_move.unwrap();
        let s = payoff::settle(g.stake.0, pm, character_move, self.jar, &self.config.params());
        let kind = match (pm, character_move) {
            (Move::Keep, Move::Keep) => "both_keep",
            (Move::Break, Move::Keep) => "player_breaks",
            (Move::Keep, Move::Break) => "character_breaks",
            (Move::Break, Move::Break) => "both_break",
        };
        self.finish(g, s, kind);
    }

    /// Anyone can settle a game whose deadline has passed. The side that did not show up loses.
    pub fn claim_timeout(&mut self, game_id: u64) {
        let g = self.get_game_or_panic(game_id);
        let now = env::block_timestamp();
        let w = self.window_ns();
        match g.status {
            Status::Opened => {
                require!(now > g.opened_ns + w, "seal window still open");
                let s = payoff::settle_character_timeout(g.stake.0);
                self.finish(g, s, "character_timeout");
            }
            Status::Sealed => {
                require!(now > g.sealed_ns + w, "play window still open");
                let s = payoff::settle_player_timeout(g.stake.0, &self.config.params());
                self.finish(g, s, "player_timeout");
            }
            Status::Played => {
                require!(now > g.played_ns + w, "reveal window still open");
                let s = payoff::settle_character_timeout(g.stake.0);
                self.finish(g, s, "character_timeout");
            }
            Status::Settled => env::panic_str("game already settled"),
        }
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }
    pub fn get_game(&self, game_id: u64) -> Option<Game> {
        self.games.get(&game_id).cloned()
    }
    pub fn get_next_game_id(&self) -> u64 {
        self.next_game_id
    }
    pub fn get_balance(&self, account_id: AccountId) -> U128 {
        U128(self.bal(&account_id))
    }
    pub fn get_jar(&self) -> U128 {
        U128(self.jar)
    }
    pub fn get_house_balance(&self) -> U128 {
        U128(self.house_balance)
    }
    pub fn get_character(&self, account_id: AccountId) -> Option<Character> {
        self.characters.get(&account_id).cloned()
    }
    pub fn list_characters(&self) -> Vec<(AccountId, Character)> {
        self.characters.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }
    pub fn get_record(&self, account_id: AccountId) -> Record {
        self.records.get(&account_id).cloned().unwrap_or_default()
    }
    pub fn get_pair(&self, player: AccountId, character: AccountId) -> Pair {
        self.pairs.get(&pair_key(&player, &character)).cloned().unwrap_or_default()
    }
    pub fn get_epoch_secret(&self, character: AccountId, epoch: u32) -> Option<String> {
        self.epoch_secrets.get(&format!("{}|{}", character, epoch)).cloned()
    }
    pub fn get_pool(&self, character: AccountId) -> PoolView {
        let pool = self.pools.get(&character).cloned().unwrap_or_default();
        let bal = self.bal(&character);
        let value = if pool.total_shares.0 == 0 { UNIT } else { UNIT * (bal / UNIT) / pool.total_shares.0 };
        PoolView { total_shares: pool.total_shares, epoch: pool.epoch, balance: U128(bal), value_per_unit: U128(value) }
    }
    pub fn get_shares(&self, character: AccountId, backer: AccountId) -> U128 {
        let pool = self.pools.get(&character).cloned().unwrap_or_default();
        let h = self.holdings.get(&holding_key(&character, &backer)).cloned().unwrap_or_default();
        if h.epoch == pool.epoch { h.shares } else { U128(0) }
    }
    pub fn solvency(&self) -> Solvency {
        Solvency {
            account_balance: U128(env::account_balance().as_yoctonear()),
            total_held: U128(self.total_held),
            jar: U128(self.jar),
            house_balance: U128(self.house_balance),
        }
    }
}

// Private helpers: not exported as contract methods.
impl Pinky {
    fn window_ns(&self) -> u64 {
        self.config.window_secs * NS
    }

    fn bal(&self, who: &AccountId) -> u128 {
        self.balances.get(who).copied().unwrap_or(0)
    }

    fn set_bal(&mut self, who: &AccountId, v: u128) {
        if v == 0 {
            self.balances.remove(who);
        } else {
            self.balances.insert(who.clone(), v);
        }
    }

    fn credit_deposit(&mut self, who: AccountId) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "attach a deposit");
        let bal = self.bal(&who);
        self.set_bal(&who, bal + amount);
        self.total_held += amount;
        Event::Deposit { account_id: who.to_string(), amount: amount.to_string() }.emit();
    }

    fn get_game_or_panic(&self, id: u64) -> Game {
        self.games.get(&id).cloned().unwrap_or_else(|| env::panic_str("unknown game"))
    }

    /// Apply a settlement: conservation check, credit balances, move the Jar, update records, store the game.
    fn finish(&mut self, mut g: Game, s: Settlement, kind: &str) {
        require!(g.status != Status::Settled, "game already settled");
        require!(s.total() == 2 * g.stake.0 as i128, "settlement does not conserve funds");
        let jar_next = self.jar as i128 + s.jar_delta;
        require!(jar_next >= 0, "jar would go negative");
        self.jar = jar_next as u128;
        self.house_balance += s.house;
        let pb = self.bal(&g.player);
        self.set_bal(&g.player, pb + s.player);
        let cb = self.bal(&g.character);
        self.set_bal(&g.character, cb + s.character);

        let mut rec = self.records.get(&g.player).cloned().unwrap_or_default();
        rec.active = rec.active.saturating_sub(1);
        if let (Some(pm), Some(cm)) = (g.player_move, g.character_move) {
            rec.games += 1;
            if pm == Move::Keep {
                rec.keeps += 1;
            }
            let key = pair_key(&g.player, &g.character);
            let mut pair = self.pairs.get(&key).cloned().unwrap_or_default();
            pair.games += 1;
            if pm == Move::Keep {
                pair.player_keeps += 1;
            } else {
                pair.player_breaks += 1;
            }
            pair.last_player_move = Some(pm);
            pair.last_character_move = Some(cm);
            self.pairs.insert(key, pair);
            let c = self.characters.get_mut(&g.character).unwrap();
            c.games += 1;
            if cm == Move::Keep {
                c.keeps += 1;
            }
        }
        self.records.insert(g.player.clone(), rec);
        let c = self.characters.get_mut(&g.character).unwrap();
        c.open_games = c.open_games.saturating_sub(1);

        g.status = Status::Settled;
        g.outcome = Some(Outcome {
            kind: kind.to_string(),
            player_payout: U128(s.player),
            character_payout: U128(s.character),
            jar_delta: s.jar_delta.to_string(),
            house: U128(s.house),
        });
        Event::Settled {
            game_id: g.id,
            kind: kind.to_string(),
            player_move: g.player_move.map(|m| m.as_str().to_string()),
            character_move: g.character_move.map(|m| m.as_str().to_string()),
            player_payout: s.player.to_string(),
            character_payout: s.character.to_string(),
            jar_delta: s.jar_delta.to_string(),
            house: s.house.to_string(),
        }
        .emit();
        self.games.insert(g.id, g);
    }
}

//! Sandbox integration tests: the real compiled wasm in a local NEAR sandbox, real accounts, real transfers.
//! Build first: `cd contract && cargo near build non-reproducible-wasm`, then point PINKY_WASM at the file.
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::json;
use sha2::{Digest, Sha256};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}
fn sha_hex(s: &[u8]) -> String {
    hex(&Sha256::digest(s))
}
fn commit(id: u64, mv: &str, salt: &str) -> String {
    sha_hex(format!("{}|{}|{}", id, mv, salt).as_bytes())
}
fn salt(n: u8) -> String {
    hex(&[n; 32])
}

struct World {
    worker: Worker<near_workspaces::network::Sandbox>,
    pinky: Contract,
    player: Account,
    mabel: Account,
}

async fn setup(window_secs: u64) -> R<World> {
    let wasm_path = std::env::var("PINKY_WASM").expect("set PINKY_WASM to the built pinky_contract.wasm");
    let wasm = std::fs::read(&wasm_path)?;
    let worker = near_workspaces::sandbox().await?;
    let pinky = worker.dev_deploy(&wasm).await?;
    let house = worker.dev_create_account().await?;
    let player = worker.dev_create_account().await?;
    let mabel = worker.dev_create_account().await?;
    pinky
        .call("new")
        .args_json(json!({
            "rake_bps": 200, "y_max_bps": 5000, "drip": 40, "forfeit_bps": 500,
            "window_secs": window_secs,
            "min_stake": "1000000", "max_stake": (10 * NEAR).to_string(), "max_inference": (NEAR / 100).to_string(),
            "house": house.id()
        }))
        .transact()
        .await?
        .into_result()?;
    mabel.call(pinky.id(), "register_character").args_json(json!({"persona_hash": "mabel-v1"})).transact().await?.into_result()?;
    mabel.call(pinky.id(), "commit_epoch").args_json(json!({"commit": sha_hex(&[7u8; 32])})).transact().await?.into_result()?;
    player.call(pinky.id(), "deposit").deposit(NearToken::from_near(5)).transact().await?.into_result()?;
    house
        .call(pinky.id(), "deposit_for")
        .args_json(json!({"account_id": mabel.id()}))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;
    Ok(World { worker, pinky, player, mabel })
}

async fn balance(w: &World, who: &Account) -> u128 {
    let s: String = w.pinky.view("get_balance").args_json(json!({"account_id": who.id()})).await.unwrap().json().unwrap();
    s.parse().unwrap()
}

async fn open(w: &World, stake: u128) -> R<u64> {
    Ok(w.player.call(w.pinky.id(), "open_game").args_json(json!({"character": w.mabel.id(), "stake": stake.to_string()})).transact().await?.json()?)
}

async fn game(w: &World, id: u64) -> R<serde_json::Value> {
    Ok(w.pinky.view("get_game").args_json(json!({"game_id": id})).await?.json()?)
}

#[tokio::test]
async fn full_game_settles_and_withdraw_moves_real_near() -> R<()> {
    let w = setup(60).await?;
    let id = open(&w, NEAR).await?;
    assert_eq!(id, 1);
    w.mabel.call(w.pinky.id(), "seal").args_json(json!({"game_id": id, "commit": commit(id, "KEEP", &salt(1)), "snapshot": "{}"})).transact().await?.into_result()?;
    w.player.call(w.pinky.id(), "play").args_json(json!({"game_id": id, "player_move": "BREAK"})).transact().await?.into_result()?;
    w.mabel.call(w.pinky.id(), "reveal").args_json(json!({"game_id": id, "character_move": "KEEP", "salt": salt(1)})).transact().await?.into_result()?;
    let g = game(&w, id).await?;
    assert_eq!(g["status"], "Settled");
    assert_eq!(g["outcome"]["kind"], "player_breaks");
    // pot 2 NEAR, rake 2% = 0.04 NEAR to the house.
    let want_player = 5 * NEAR - NEAR + (2 * NEAR - 2 * NEAR * 200 / 10_000);
    assert_eq!(balance(&w, &w.player).await, want_player);
    // withdraw 1 NEAR and watch the native balance move.
    let before = w.player.view_account().await?.balance.as_yoctonear();
    w.player.call(w.pinky.id(), "withdraw").args_json(json!({"amount": NEAR.to_string()})).max_gas().transact().await?.into_result()?;
    w.worker.fast_forward(5).await?;
    let after = w.player.view_account().await?.balance.as_yoctonear();
    assert!(after > before + NEAR / 2, "native balance must rise by close to 1 NEAR, before={before} after={after}");
    assert_eq!(balance(&w, &w.player).await, want_player - NEAR);
    // solvency: the contract account holds at least what it owes.
    let sv: serde_json::Value = w.pinky.view("solvency").await?.json()?;
    let held: u128 = sv["total_held"].as_str().unwrap().parse()?;
    let acct: u128 = sv["account_balance"].as_str().unwrap().parse()?;
    assert!(acct >= held, "contract account {acct} must cover total_held {held}");
    Ok(())
}

#[tokio::test]
async fn wrong_salt_fails_on_chain_and_changes_nothing() -> R<()> {
    let w = setup(60).await?;
    let id = open(&w, NEAR).await?;
    w.mabel.call(w.pinky.id(), "seal").args_json(json!({"game_id": id, "commit": commit(id, "KEEP", &salt(1)), "snapshot": "{}"})).transact().await?.into_result()?;
    w.player.call(w.pinky.id(), "play").args_json(json!({"game_id": id, "player_move": "KEEP"})).transact().await?.into_result()?;
    let r = w.mabel.call(w.pinky.id(), "reveal").args_json(json!({"game_id": id, "character_move": "KEEP", "salt": salt(2)})).transact().await?;
    assert!(r.is_failure(), "reveal with the wrong salt must fail");
    assert_eq!(game(&w, id).await?["status"], "Played");
    // positive control: the right salt still works afterwards.
    w.mabel.call(w.pinky.id(), "reveal").args_json(json!({"game_id": id, "character_move": "KEEP", "salt": salt(1)})).transact().await?.into_result()?;
    assert_eq!(game(&w, id).await?["status"], "Settled");
    Ok(())
}

#[tokio::test]
async fn play_before_seal_and_withdraw_above_balance_fail() -> R<()> {
    let w = setup(60).await?;
    let id = open(&w, NEAR).await?;
    let r = w.player.call(w.pinky.id(), "play").args_json(json!({"game_id": id, "player_move": "KEEP"})).transact().await?;
    assert!(r.is_failure());
    let r = w.player.call(w.pinky.id(), "withdraw").args_json(json!({"amount": (100 * NEAR).to_string()})).max_gas().transact().await?;
    assert!(r.is_failure());
    Ok(())
}

#[tokio::test]
async fn timeout_is_claimable_after_the_window() -> R<()> {
    let w = setup(1).await?;
    let id = open(&w, NEAR).await?;
    w.worker.fast_forward(200).await?;
    let anyone = w.worker.dev_create_account().await?;
    anyone.call(w.pinky.id(), "claim_timeout").args_json(json!({"game_id": id})).transact().await?.into_result()?;
    assert_eq!(game(&w, id).await?["outcome"]["kind"], "character_timeout");
    assert_eq!(balance(&w, &w.player).await, 5 * NEAR + NEAR);
    Ok(())
}

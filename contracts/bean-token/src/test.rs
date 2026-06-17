#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

const TOTAL: i128 = 1_000_000_000 * 10_000_000; // 10^16

fn setup<'a>() -> (Env, BeanTokenClient<'a>, Address, Address) {
    let e = Env::default();
    e.mock_all_auths();
    let contract_id = e.register(BeanToken, ());
    let client = BeanTokenClient::new(&e, &contract_id);
    let admin = Address::generate(&e);
    let treasury = Address::generate(&e);
    client.initialize(&admin, &treasury);
    (e, client, admin, treasury)
}

#[test]
fn test_metadata_and_supply() {
    let (e, client, _admin, treasury) = setup();
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.name(), soroban_sdk::String::from_str(&e, "BEAN"));
    assert_eq!(client.symbol(), soroban_sdk::String::from_str(&e, "BEAN"));
    assert_eq!(client.total_supply(), TOTAL);
    assert_eq!(client.balance(&treasury), TOTAL);
}

#[test]
#[should_panic] // AlreadyInitialized
fn test_double_initialize_fails() {
    let (_e, client, admin, treasury) = setup();
    client.initialize(&admin, &treasury);
}

#[test]
fn test_transfer() {
    let (e, client, _admin, treasury) = setup();
    let user = Address::generate(&e);
    client.transfer(&treasury, &user, &100);
    assert_eq!(client.balance(&user), 100);
    assert_eq!(client.balance(&treasury), TOTAL - 100);
}

#[test]
#[should_panic] // InsufficientBalance
fn test_transfer_insufficient_fails() {
    let (e, client, _admin, treasury) = setup();
    let user = Address::generate(&e);
    client.transfer(&user, &treasury, &1); // user 잔액 0
}

#[test]
fn test_approve_and_transfer_from() {
    let (e, client, _admin, treasury) = setup();
    let spender = Address::generate(&e);
    let to = Address::generate(&e);
    client.approve(&treasury, &spender, &500, &1000); // expiration_ledger=1000
    assert_eq!(client.allowance(&treasury, &spender), 500);
    client.transfer_from(&spender, &treasury, &to, &300);
    assert_eq!(client.balance(&to), 300);
    assert_eq!(client.allowance(&treasury, &spender), 200);
}

#[test]
fn test_burn_reduces_supply() {
    let (e, client, _admin, treasury) = setup();
    let user = Address::generate(&e);
    client.transfer(&treasury, &user, &1000);
    client.burn(&user, &400);
    assert_eq!(client.balance(&user), 600);
    assert_eq!(client.total_supply(), TOTAL - 400);
}

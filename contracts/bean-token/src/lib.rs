#![no_std]
//! BEAN — Cafe.pi 생태계 유틸리티 토큰 (Soroban / Stellar)
//!
//! ⚠️ 초안(v0.1) — `stellar contract build` 및 외부 보안 감사 전. 검토용.
//! ⚠️ 레드라인 안전: 이 컨트랙트는 Next.js 앱(`src/`)과 **완전히 분리된** 독립 Rust 워크스페이스다.
//!    앱 코드에 import 금지(레드라인 #2: 발행 전 앱에 토큰 코드 미포함).
//!
//! 설계 요지
//! - 표준 토큰 인터페이스(SEP-41 호환): transfer / approve / allowance / transfer_from / burn
//! - **고정 공급(Fixed Supply)**: 초기화 시 총량을 1회 민팅하고 **공개 mint 함수 없음**
//! - 단위: 1 BEAN = 10,000,000 units (소수점 7자리) — Pi 단위계 정렬
//! - 총 발행량: 1,000,000,000 BEAN = 10^16 units (i128 안전)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String,
};

// ===== 토큰 상수 =====
const DECIMALS: u32 = 7;
/// 1 BEAN = 10,000,000 units
const UNITS_PER_BEAN: i128 = 10_000_000;
/// 총 발행량 = 10억 BEAN = 10^16 units
const TOTAL_SUPPLY: i128 = 1_000_000_000 * UNITS_PER_BEAN;

// 스토리지 TTL(만료) 관리용 상수 (ledger 수 기준, 대략치 — 배포 시 네트워크에 맞게 조정)
const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 7 * DAY_IN_LEDGERS;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const BALANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const BALANCE_TTL_THRESHOLD: u32 = BALANCE_BUMP - DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
pub struct AllowanceKey {
    pub from: Address,
    pub spender: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    TotalSupply,
    Balance(Address),
    Allowance(AllowanceKey),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InsufficientBalance = 3,
    InsufficientAllowance = 4,
    NegativeAmount = 5,
    BadExpiration = 6,
}

#[contract]
pub struct BeanToken;

// ===== 내부 헬퍼 =====
fn read_balance(e: &Env, addr: &Address) -> i128 {
    let key = DataKey::Balance(addr.clone());
    if let Some(b) = e.storage().persistent().get::<DataKey, i128>(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, BALANCE_TTL_THRESHOLD, BALANCE_BUMP);
        b
    } else {
        0
    }
}

fn write_balance(e: &Env, addr: &Address, amount: i128) {
    let key = DataKey::Balance(addr.clone());
    e.storage().persistent().set(&key, &amount);
    e.storage()
        .persistent()
        .extend_ttl(&key, BALANCE_TTL_THRESHOLD, BALANCE_BUMP);
}

fn receive_balance(e: &Env, addr: &Address, amount: i128) {
    let b = read_balance(e, addr);
    write_balance(e, addr, b + amount); // overflow-checks=true 로 오버플로우 시 panic
}

fn spend_balance(e: &Env, addr: &Address, amount: i128) {
    let b = read_balance(e, addr);
    if b < amount {
        panic_with_error(e, Error::InsufficientBalance);
    }
    write_balance(e, addr, b - amount);
}

fn read_allowance(e: &Env, from: &Address, spender: &Address) -> AllowanceValue {
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    if let Some(v) = e.storage().temporary().get::<DataKey, AllowanceValue>(&key) {
        if v.expiration_ledger < e.ledger().sequence() {
            AllowanceValue {
                amount: 0,
                expiration_ledger: v.expiration_ledger,
            }
        } else {
            v
        }
    } else {
        AllowanceValue {
            amount: 0,
            expiration_ledger: 0,
        }
    }
}

fn write_allowance(e: &Env, from: &Address, spender: &Address, amount: i128, expiration_ledger: u32) {
    if amount > 0 && expiration_ledger < e.ledger().sequence() {
        panic_with_error(e, Error::BadExpiration);
    }
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    e.storage().temporary().set(
        &key,
        &AllowanceValue {
            amount,
            expiration_ledger,
        },
    );
    if amount > 0 {
        let live = expiration_ledger
            .checked_sub(e.ledger().sequence())
            .unwrap_or(0);
        e.storage().temporary().extend_ttl(&key, live, live);
    }
}

fn spend_allowance(e: &Env, from: &Address, spender: &Address, amount: i128) {
    let allow = read_allowance(e, from, spender);
    if allow.amount < amount {
        panic_with_error(e, Error::InsufficientAllowance);
    }
    if amount > 0 {
        write_allowance(
            e,
            from,
            spender,
            allow.amount - amount,
            allow.expiration_ledger,
        );
    }
}

fn check_nonneg(e: &Env, amount: i128) {
    if amount < 0 {
        panic_with_error(e, Error::NegativeAmount);
    }
}

fn panic_with_error(e: &Env, err: Error) -> ! {
    soroban_sdk::panic_with_error!(e, err)
}

fn bump_instance(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_BUMP);
}

// ===== 컨트랙트 인터페이스 =====
#[contractimpl]
impl BeanToken {
    /// 초기화 — 1회만. 총 발행량(10억 BEAN)을 `treasury` 에 전액 민팅한다.
    /// 이후 추가 발행 함수는 없다(고정 공급).
    pub fn initialize(e: Env, admin: Address, treasury: Address) {
        if e.storage().instance().has(&DataKey::Admin) {
            panic_with_error(&e, Error::AlreadyInitialized);
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::TotalSupply, &TOTAL_SUPPLY);
        write_balance(&e, &treasury, TOTAL_SUPPLY);
        bump_instance(&e);
        e.events().publish(
            (symbol_short!("mint"), treasury.clone()),
            TOTAL_SUPPLY,
        );
    }

    // ---- 메타데이터 ----
    pub fn name(e: Env) -> String {
        String::from_str(&e, "BEAN")
    }
    pub fn symbol(e: Env) -> String {
        String::from_str(&e, "BEAN")
    }
    pub fn decimals(_e: Env) -> u32 {
        DECIMALS
    }
    pub fn total_supply(e: Env) -> i128 {
        e.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    // ---- 조회 ----
    pub fn balance(e: Env, id: Address) -> i128 {
        bump_instance(&e);
        read_balance(&e, &id)
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        bump_instance(&e);
        read_allowance(&e, &from, &spender).amount
    }

    // ---- 이전 ----
    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        check_nonneg(&e, amount);
        bump_instance(&e);
        spend_balance(&e, &from, amount);
        receive_balance(&e, &to, amount);
        e.events()
            .publish((symbol_short!("transfer"), from, to), amount);
    }

    /// 승인. `expiration_ledger` 이후 만료(0 으로 즉시 취소 가능).
    pub fn approve(e: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        check_nonneg(&e, amount);
        bump_instance(&e);
        write_allowance(&e, &from, &spender, amount, expiration_ledger);
        e.events().publish(
            (symbol_short!("approve"), from, spender),
            (amount, expiration_ledger),
        );
    }

    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        check_nonneg(&e, amount);
        bump_instance(&e);
        spend_allowance(&e, &from, &spender, amount);
        spend_balance(&e, &from, amount);
        receive_balance(&e, &to, amount);
        e.events()
            .publish((symbol_short!("transfer"), from, to), amount);
    }

    /// 소각 — 보유자 본인. 총 공급량도 함께 감소.
    pub fn burn(e: Env, from: Address, amount: i128) {
        from.require_auth();
        check_nonneg(&e, amount);
        bump_instance(&e);
        spend_balance(&e, &from, amount);
        let supply: i128 = e
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        e.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));
        e.events().publish((symbol_short!("burn"), from), amount);
    }

    pub fn burn_from(e: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        check_nonneg(&e, amount);
        bump_instance(&e);
        spend_allowance(&e, &from, &spender, amount);
        spend_balance(&e, &from, amount);
        let supply: i128 = e
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        e.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));
        e.events().publish((symbol_short!("burn"), from), amount);
    }
}

#[cfg(test)]
mod test;

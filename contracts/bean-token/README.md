# BEAN Token — Soroban 스마트 컨트랙트 (초안 v0.1)

Cafe.pi 생태계 유틸리티 토큰 **BEAN**의 Soroban(Stellar) 컨트랙트.

> ⚠️ **상태**: 초안 — `stellar contract build` 빌드 검증 및 **외부 보안 감사 전**. 프로덕션 배포 금지.
> ⚠️ **레드라인 안전**: 이 디렉토리는 Next.js 앱(`src/`)과 **완전히 분리된 독립 Rust 워크스페이스**다.
> 앱 코드에서 이 컨트랙트를 import하지 않는다 — 레드라인 #2(발행 전 앱에 토큰 코드 미포함)를 지키기 위함.
> 관련 문서: `docs/PRD_12_TOKEN.md`, `docs/GAOPEN/checkList.md`

## 토큰 사양

| 항목 | 값 |
|---|---|
| 이름 / 티커 | BEAN / BEAN |
| 소수점 | 7 (1 BEAN = 10,000,000 units) |
| 총 발행량 | 1,000,000,000 BEAN = 10^16 units (i128 안전) |
| 공급 정책 | **고정(Fixed)** — 초기화 시 전량 민팅, 공개 mint 함수 없음 |
| 인터페이스 | SEP-41 호환 (transfer/approve/allowance/transfer_from/burn) |

## 함수

- `initialize(admin, treasury)` — 1회. 총량을 `treasury`에 전액 민팅.
- `name() / symbol() / decimals() / total_supply()` — 메타데이터·공급량
- `balance(id)` / `allowance(from, spender)` — 조회
- `transfer(from, to, amount)` — 이전
- `approve(from, spender, amount, expiration_ledger)` — 승인(만료 ledger 지정)
- `transfer_from(spender, from, to, amount)` — 위임 이전
- `burn(from, amount)` / `burn_from(spender, from, amount)` — 소각(총량 감소)

## 사전 요구사항

```bash
# Rust + wasm 타겟
rustup target add wasm32-unknown-unknown
# Stellar CLI (구 soroban-cli)
cargo install --locked stellar-cli
```

## 빌드 / 테스트

```bash
# 단위 테스트 (네이티브)
cargo test

# WASM 빌드 (배포 산출물)
cargo build --target wasm32-unknown-unknown --release
# (또는) stellar contract build
# → target/wasm32-unknown-unknown/release/bean_token.wasm
```

> ✅ **빌드 검증 (2026-06-17, soroban-sdk 22.0.11 / rustc 1.96.0)**
> - `cargo build --target wasm32-unknown-unknown --release` → **성공** (`bean_token.wasm` ~13KB)
> - `cargo test` → **6/6 통과** (메타·전송·승인/위임·소각·중복초기화/잔액부족 실패)
>
> ⚠️ **Windows + GNU 툴체인 주의**: `crate-type`에 `cdylib`가 있으면 네이티브 `cargo test`가
> 링크 단계에서 `export ordinal too large`로 실패한다(Windows DLL 한계, **코드 무관**).
> 네이티브 테스트만 돌릴 땐 일시적으로 `crate-type = ["rlib"]`로 바꿔 실행하거나, wasm 빌드로 검증한다.
> (Linux/macOS에서는 그대로 `cargo test` 동작.)

## 배포 (Pi Network)

> Pi 단위계: 1 Pi = 10,000,000 units. Network passphrase는 Pi 공식 값 사용.

```bash
# 1) 컨트랙트 업로드 & 배포 (예시 — 자격/주소는 실제 값으로 교체)
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/bean_token.wasm \
  --source <DEPLOYER_KEY> \
  --rpc-url https://rpc.testnet.minepi.com \
  --network-passphrase "Pi Testnet"
# → 반환된 CONTRACT_ID 기록

# 2) 초기화 (총량을 treasury 에 민팅)
stellar contract invoke --id <CONTRACT_ID> \
  --source <DEPLOYER_KEY> \
  --rpc-url https://rpc.testnet.minepi.com \
  --network-passphrase "Pi Testnet" \
  -- initialize --admin <ADMIN_ADDR> --treasury <TREASURY_ADDR>
```

> **Mainnet 배포**는 `--network-passphrase "Pi Mainnet"` + Mainnet RPC + **보안 감사 통과 후** Pi 재단 승인 절차를 따른다(`docs/GAOPEN/checkList.md` §6).

## 감사 전 자체 점검 (체크리스트)

- [x] `cargo test` 전체 통과 — 6/6 (2026-06-17)
- [x] WASM 생성 확인 — `bean_token.wasm` ~13KB (2026-06-17)
- [x] 고정 공급 — 공개 mint 함수 부재 재확인
- [x] 모든 상태 변경 함수에 `require_auth` 적용 확인
- [x] 음수 금액·오버플로우 방지(overflow-checks) 확인
- [ ] 외부 보안 감사 의뢰 (`docs/contracts/AUDIT_RFQ.md`) ← 잔여

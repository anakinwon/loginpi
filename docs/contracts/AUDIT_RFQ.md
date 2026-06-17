# Security Audit RFQ — BEAN Token (Soroban / Pi Network)

> 🇰🇷 **사용 안내(국문)**: 이 문서는 스마트컨트랙트 보안 감사 업체에 **그대로 보낼 견적 요청서(RFQ)**입니다. 본문은 감사사(대부분 영미권)가 바로 읽도록 영문으로 작성했습니다. 아래 `[FILL]` 표시만 채워 보내면 됩니다. 후보 업체: OpenZeppelin · Trail of Bits · CertiK · Veridise · OtterSec · Certora (Stellar/Soroban 경험 보유 우선).

---

## 1. Request Summary

We are requesting a **fixed-fee quote and proposal** for a security audit of a single Soroban (Stellar-based) smart contract — the **BEAN** ecosystem utility token — to be deployed on the **Pi Network** Mainnet via the Pi Launchpad.

- **Requestor**: Cafe.pi (issuer: individual) — contact: `[FILL: name / email]`
- **Target start**: `[FILL: e.g., upon vendor availability]`
- **Budget range (reference)**: USD 5,000 – 15,000 (please quote your actual fee)

## 2. Project Context

- **Cafe.pi** is a live community + O2O marketplace on Pi Network Mainnet (chat, marketplace, voice, events).
- **BEAN** is an ecosystem **utility token** (user support / rewards / feature access), issued through the official Pi Launchpad under its Product-First model. It is **not** a fundraising instrument.
- Chain: **Pi Network (Stellar-based)**, smart contracts via **Soroban**. Unit system: 1 token = 10,000,000 base units (i128, 7 decimals).

## 3. Scope of Work

A single contract crate:

| Item | Detail |
|---|---|
| Repository / source | `[FILL: repo URL or zipped source]` (`contracts/bean-token/`) |
| Language / framework | Rust, `soroban-sdk` v22 |
| Approx. size | ~250 LoC (single contract + tests) |
| Standard | SEP-41-compatible fungible token |
| Supply model | **Fixed supply** — full mint at `initialize`, **no public mint function** |
| Functions | initialize, name/symbol/decimals/total_supply, balance, allowance, transfer, approve, transfer_from, burn, burn_from |
| Commit / version | `[FILL: git commit hash to audit]` |

Out of scope: the Cafe.pi web application, off-chain infrastructure, Launchpad platform itself.

## 4. Audit Objectives

Please assess at minimum:

1. **Access control** — `require_auth` correctness on every state-changing function; no privilege escalation.
2. **Arithmetic safety** — overflow/underflow (overflow-checks enabled), negative-amount handling.
3. **Fixed-supply invariant** — confirm no path mints beyond the initial supply; burn correctly reduces total supply.
4. **Allowance logic** — expiration handling, double-spend, race conditions in approve/transfer_from.
5. **Storage / TTL** — Soroban persistent/temporary/instance storage usage, TTL extension correctness, state bloat or expiry risks.
6. **Reentrancy / external-call safety** in the Soroban execution model.
7. **Soroban/Stellar-specific** pitfalls (authorization framework, contract upgradeability stance, ledger semantics).
8. **Best-practice & spec conformance** (SEP-41), event emission correctness.

## 5. Expected Deliverables

- Written audit report (findings by severity: Critical/High/Medium/Low/Informational, with remediation).
- Verification/re-test of fixes after we remediate.
- A final report suitable for **public disclosure** (we intend to publish it with the token launch).

## 6. Information We Provide

- Full source (`contracts/bean-token/`) incl. unit tests.
- This RFQ, the token white paper (`docs/PRD_12_TOKEN_백서.md` / `_WHITEPAPER_EN.md`), and tokenomics.
- Reasonable responsiveness to questions during the engagement.

## 7. Questions for the Vendor (please include in your proposal)

1. **Fixed-fee quote** (USD) and what it covers.
2. **Estimated timeline** (start date + calendar days to draft report and to final).
3. **Methodology** (manual review, static analysis, formal verification, fuzzing — which apply).
4. **Soroban/Stellar audit experience** — relevant past audits / references.
5. **Team composition** for this engagement.
6. **Re-audit policy** for fix verification (included or extra).
7. Any **prerequisites** you require from us before starting.

## 8. How to Respond

Please reply to `[FILL: email]` with your proposal and quote by `[FILL: response deadline]`.

---

> Internal note (not for vendors): keep this RFQ in sync with `contracts/bean-token/README.md` and `docs/GAOPEN/checkList.md` §2-6. Send only after `cargo test` passes and a commit hash is pinned.

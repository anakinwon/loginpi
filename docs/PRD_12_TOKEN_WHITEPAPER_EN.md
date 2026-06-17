# BEAN — Cafe.pi Ecosystem Utility Token White Paper

> **Version**: v0.2 (Draft) · **Date**: 2026-06-17 · **Source language**: Korean (ko) — this English (en) text is a translation
> **Status**: Draft · ⚠️ **Pending legal review** (wording in §3, §6, §10 to be finalized after counsel) · Awaiting Mainnet Launchpad GA
> **Related**: `docs/PRD_12_TOKEN.md` v1.9 (internal requirements) · `docs/PRD_12_TOKEN_법무자문의뢰서.md` (legal inquiry)
> **Note**: The Korean edition (`docs/PRD_12_TOKEN_백서.md`) is authoritative; in case of discrepancy, the Korean text governs.

> **Important Notice**: This white paper is for **informational purposes only** and is **not** an offer, solicitation, or invitation to invest. BEAN is a **utility token for ecosystem access that does not promise any return**. See §10 for the full disclaimer.

---

## Table of Contents

1. Abstract
2. Background — The Cafe.pi Ecosystem
3. BEAN Token Definition (Utility)
4. Utility Use Cases
5. Tokenomics
6. Distribution & Launchpad Participation
7. Technical Architecture
8. Governance (Future)
9. Roadmap
10. Risks & Legal Disclaimer
11. Glossary

---

## 1. Abstract

**BEAN** is the ecosystem **utility token** of **Cafe.pi**, a community and commerce platform built on the Pi Network Mainnet. BEAN is **not a fundraising instrument**; it is a tool that mediates **peer-to-peer support, rewards, and feature access** within Cafe.pi.

BEAN extends **"Pi Bean" (🫘)**, an in-app appreciation unit already in use on Cafe.pi, into an on-chain token, giving it immediate utility on top of a working product. Issuance occurs through the official Pi Network **Launchpad**, consistent with the Launchpad's **Product-First** principle — tokens serve user acquisition and product utility, not capital raising.

| Key | Value |
|---|---|
| Token name | BEAN |
| Chain | Pi Network (Stellar-based) · Soroban smart contracts |
| Total supply | 1,000,000,000 BEAN (1 billion, fixed) |
| Base pair | Pi (BEAN/Pi only) |
| Nature | Utility token (access · rewards · support) |

---

## 2. Background — The Cafe.pi Ecosystem

Cafe.pi is an **online community plus O2O marketplace** running on the Pi Network Mainnet.

| Component | Description |
|---|---|
| **PiChat (Cafés)** | Theme-based real-time communities for Pi users who share interests |
| **PiShop (Marketplace)** | Pi-settled P2P trading plus O2O offline-store commerce |
| **PiVoice (Voice Chat)** | WebRTC-based N:N voice channels |
| **Events & Missions** | Activity rewards and community engagement |

Cafe.pi already operates a **Pi Bean appreciation feature** — a culture in which users send small amounts to those who provide good content or help. Today, however, Bean is only an in-app display unit and lacks the **transferability, interoperability, and transparency** of an on-chain asset.

**BEAN brings this proven appreciation culture on-chain**, unifying support, rewards, and feature access into a single standard unit.

---

## 3. BEAN Token Definition (Utility)

BEAN's **primary purpose is utility** — access and rewards within the Cafe.pi ecosystem, not financial return.

- ✅ **Access**: use of and discounts on café/marketplace/voice features · **global real-time translation (PiTranslate)** · **payment of marketplace buy/sell fees**
- ✅ **Support**: peer-to-peer Bean support (on-chain version of the existing Pi Bean) · **charitable giving via donations**
- ✅ **Rewards**: rewards for missions/events/community contribution · **review (user feedback) rewards** · **sales coupon/stamp rewards**
- ✅ **(Future) Governance**: ecosystem policy voting rights (**separate** from any economic right)

> BEAN **provides no dividend, interest, or revenue share**, and the issuer does not promise, or undertake efforts to bring about, any increase in BEAN's market price. (See §10.)

### Relationship to the Existing Pi Bean (Unit Alignment)

With the on-chain transition, the in-app appreciation unit is aligned as follows:

```
1 Pi = 100 BEAN
Existing support of 0.1 / 0.5 / 1 Pi  →  10 / 50 / 100 BEAN
```

This alignment preserves the support experience users already know while simplifying the unit to whole numbers.

---

## 4. Utility Use Cases

| # | Use case | Description |
|---|---|---|
| 1 | **Support (Tip)** | Send BEAN to café/content contributors (on-chain Pi Bean) |
| 2 | **Donation** | Channel BEAN donations into fundraising/charity campaigns — a community channel for social contribution |
| 3 | **Feature access** | Unlock premium themes, stickers, AI assistant, and more |
| 4 | **Global translation (PiTranslate)** | Pay for real-time translation usage |
| 5 | **Marketplace fees** | Pay PiShop buy/sell fees in BEAN |
| 6 | **Mission/event rewards** | BEAN distributed as activity rewards (funded by the Ecosystem Reserve) |
| 7 | **Review rewards** | Reward café/store/product review contributions with BEAN |
| 8 | **Sales coupon/stamp rewards** | Convert O2O offline-store purchase stamps/coupons into BEAN |
| 9 | **(Future) Governance** | Vote on ecosystem policy and roadmap |

> All use cases are **consumption/usage oriented** and do not presuppose financial return from holding.

---

## 5. Tokenomics

### 5.1 Core Parameters

| Item | Value |
|---|---|
| Total supply | 1,000,000,000 BEAN (fixed, no further minting) |
| Decimals | 7 (1 BEAN = 10,000,000 units, i128) |
| Base pair | Pi |
| Participation unit (sale) | 0.01 Pi / BEAN |

### 5.2 Distribution

| Category | Share | Amount | Lockup/Vesting | Purpose |
|---|---|---|---|---|
| **Launchpad Sale** | 40% | 400,000,000 | immediate ~ short cliff | community distribution & participation |
| **Ecosystem Reserve** | 25% | 250,000,000 | 3–4 year linear release | user rewards & mission funding |
| **Liquidity Pool** | 15% | 150,000,000 | permanently locked | BEAN/Pi liquidity |
| **Marketing/Partnerships** | 12% | 120,000,000 | 12-month lock | ecosystem partnerships & community |
| **Team/Foundation** | 8% | 80,000,000 | 6-month cliff + 36-month linear | long-term operational alignment |

> **Design principle**: the insider (team) share is minimized to 8% while ecosystem/community allocation (sale + reserve = 65%) is kept large, making the **utility-centered distribution** explicit.

### 5.3 Team Vesting

| Phase | Period | Release |
|---|---|---|
| Cliff | 0–6 months | 0% |
| Year 1 | 6–12 months | 25% (6.25%/quarter) |
| Year 2 | 1–2 years | 50% (6.25%/quarter) |
| Year 3 | 2–3 years | 25% (6.25%/quarter) |

---

## 6. Distribution & Launchpad Participation

BEAN is distributed through the official Pi Network **Launchpad**.

- **Fair-Access**: participants choose a commitment amount (1–500 Pi), and the Launchpad automatically computes a holding ratio based on that commitment, **preventing a small number of large participants from dominating**.
- **Liquidity deposit**: the Pi gathered from participation is **not received directly by the issuer; it is deposited into a liquidity pool** — the core of the Launchpad structure, which structurally ensures the token serves ecosystem liquidity and utility rather than capital raising.
- **Liquidity pair**: BEAN/Pi **only**. (No pairs with non-Pi cryptocurrencies or fiat-pegged assets are operated.)

> The participation unit (0.01 Pi/BEAN) is an **ecosystem participation parameter**; it does not indicate any future market price or return.

---

## 7. Technical Architecture

- **Chain**: Pi Network (based on the Stellar Consensus Protocol)
- **Contracts**: Soroban smart contracts (same environment as Cafe.pi's PiRC2 subscription contract)
- **Unit system**: 1 BEAN = 10,000,000 units (i128), aligned with Pi's unit system
- **Overflow safety**: total supply of 1B BEAN = 10¹⁶ units ≪ i128 max (~1.7×10³⁸) → safe
- **Standard functions**: mint (fixed total), transfer, approve/transferFrom, balance queries

Deployment proceeds as: Testnet development & testing → PiRC community public review → external security audit → Mainnet deployment.

---

## 8. Governance (Future)

Initially, BEAN centers on access and support; governance is introduced gradually as the ecosystem matures. Governance voting rights are **clearly separated from any economic right** and confer no financial entitlement from holding.

---

## 9. Roadmap

| Stage | Content | Status |
|---|---|---|
| Planning/Docs | tokenomics, positioning, technical design | ✅ Done |
| Legal review | securities/regulatory counsel | 🔶 In progress (required before Mainnet sale) |
| Contract dev | Soroban Testnet deployment & testing | ⏳ Pending |
| Security audit | external audit | ⏳ Pending |
| Launchpad application | after Mainnet Launchpad GA | ⏳ Awaiting GA (expected after Jun 28) |
| Mainnet issuance | token issuance & liquidity opening | ⏳ Pending |
| Ecosystem integration | support/rewards/feature-access wiring | ⏳ Pending |

---

## 10. Risks & Legal Disclaimer

> ⚠️ This section is a **draft** and will be **finalized after legal counsel (§8-1-1 of the internal PRD)**.

- **Not an investment / not a security**: BEAN is a **utility token**, not an investment product. This white paper is not an offer or solicitation to invest.
- **No return promised**: the issuer does not guarantee the value or price of BEAN and provides no dividend, interest, or revenue share.
- **Value volatility**: the token's value may fluctuate; participants act at their own judgment and risk.
- **Regulatory risk**: token regulation varies by jurisdiction and may change. Participation may be restricted in some jurisdictions.
- **Technical risk**: smart contracts undergo security audits, but technical risk cannot be entirely excluded.
- **Subject to change**: the contents of this white paper (including tokenomics and roadmap) may change according to regulatory, technical, and ecosystem conditions.

---

## 11. Glossary

| Term | Definition |
|---|---|
| **BEAN** | Cafe.pi ecosystem utility token |
| **Pi Bean** | Cafe.pi in-app appreciation feature (predecessor of BEAN) |
| **Launchpad** | Pi Network's official token issuance and fair-distribution platform |
| **Fair-Access** | automatic holding-ratio calculation based on commitment (anti-domination) |
| **Soroban** | the smart contract platform of the Stellar/Pi blockchain |
| **i128** | 128-bit integer — used to represent token units |

---

> **Next**: ① incorporate legal counsel (finalize §3, §6, §10) ② keep in sync with the Korean source ③ finalize as an attachment for the Launchpad application after GA.

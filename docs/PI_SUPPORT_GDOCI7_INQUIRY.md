# Pi Developer Support Inquiry — Testnet App Wallet Locked (cannot perform A2U)

> 용도: Pi Developer Portal 지원팀 / Pi Core Team에 제출하는 문의문.
> 아래 **English** 본문을 그대로 보내고, 하단 **국문 요약**은 내부 참고용.

---

## English (send this)

**Subject: Paired Testnet app wallet is locked (master key weight 0) — cannot fulfill the "A2U to 5 unique wallets" Mainnet requirement**

Hello Pi Developer Support,

We are applying for a **Mainnet App Wallet** for our app (domain: `cafepi.vercel.app`).
The application form is blocked by this requirement:

> "The paired Testnet app needs App to User transactions to 5 unique wallets."

We cannot fulfill this requirement because **our paired Testnet app's wallet is permanently locked and cannot sign/send any transaction (App-to-User / A2U)**.

### Wallets
- **Paired Testnet app wallet (locked):** `GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC`
- **Requested Mainnet wallet:** `GDPMRNS6FKZYAOOLZAUYEMRTNRQ3IXXSLIKV4E37NJQLFCC2T4GGZTHX`

### Root cause (verifiable on Testnet Horizon)
The Testnet app wallet `GDOCI7...J57RC` has its **master key weight set to 0**, so it has no valid signer and cannot authorize any outgoing payment. It can still *receive* payments, which is why user payments (U2A) succeed, but every **A2U (App-to-User) attempt fails** with:

```
Horizon "transaction_failed"  →  result_codes: { "transaction": "tx_bad_auth" }
```

Current account state (`GET https://api.testnet.minepi.com/accounts/GDOCI7...J57RC`):
- `signers`: `[ { "key": "GDOCI7...J57RC", "weight": 0, "type": "ed25519_public_key" } ]`
- `thresholds`: `low=0, med=0, high=0`
- Native balance: `269.4` test-Pi (stuck — cannot be sent out)

The lock was applied on **2025-11-24** by a single `set_options` operation that set `master_key_weight = 0` (and `home_domain`). In the same transaction, the account issued a custom asset (100,000,000 "CBT") — i.e. this account was originally configured as a **token issuer and then locked**, which is standard practice for issuer accounts but makes it unusable as an operational A2U wallet.

- create_account tx: `17b025ca3f6096ca3326eeb96b704c5ca66b429d0c6add700de423fdd126e698` (2025-11-21)
- **lock (set_options, master_key_weight → 0) tx:** `4dc2b092271b4ba56cfeb69826fdc0d9d450e92ced2d8f1aa3014c8365dcc991` (2025-11-24)
- Since that date: **0 outgoing native payments** (receive-only).

### The deadlock
- To change the app's wallet to a signing-capable one, the portal requires the "A2U to 5 unique wallets" condition to be met first.
- But that condition can only be met by sending A2U from the current wallet — which is impossible because it is locked.
- So the wallet cannot be changed, and the requirement cannot be fulfilled. It is a chicken-and-egg deadlock.

### Request
Could you please either:
1. **Allow us to re-register the paired Testnet app's wallet** to a new signing-capable wallet (`GDPMRN...GZTHX`, master key weight 1), bypassing the A2U gate for this one-time wallet change; **or**
2. **Advise the correct procedure** to resolve this locked-wallet deadlock so we can complete the 5-unique-wallet A2U requirement and submit the Mainnet App Wallet application.

Thank you very much for your help.

Best regards,
(앱 소유자 서명 / Pioneer username)

---

## 국문 요약 (내부 참고 — 보내지 말 것)

- **핵심**: 테스트넷 앱 지갑 `GDOCI7`이 마스터 키 weight 0이라 A2U(보내기) 불가 → 메인넷 요건("A2U 5개 고유 지갑") 충족 불가 → 지갑 교체도 그 요건에 막혀 **교착**.
- **원인**: 2025-11-24 `set_options`(tx `4dc2b092…`)로 weight 0 잠금. 같은 tx에서 CBT 1억 개 발행 → 원래 **토큰 발행용 계정**이라 발행 후 잠근 것(표준 관행). A2U 운영 지갑으로는 부적합.
- **증거**: 현재 signers weight 0 / thresholds 0 / 잔액 269.4 test-Pi(인출 불가) / 잠금 이후 나가는 송금 0건 / A2U 시도 시 `tx_bad_auth`.
- **요청**: ① 테스트넷 앱 지갑을 서명 가능한 `GDPMRN`으로 재등록 허용, 또는 ② 교착 해소 절차 안내.
- **⛔ 교훈**: 새 지갑(GDPMRN)은 **절대 set_options로 master weight를 0으로 만들지 말 것.** 활성화 직후 `signers[0].weight == 1` 확인 필수.

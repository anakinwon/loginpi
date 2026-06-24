# Youth Protection Policy

**Version**: v1.0
**Effective date**: 2026-06-12
**Drafted**: 2026-06-12

---

## Chapter 1. General Provisions

### Article 1 (Purpose)
This policy is established so that Cafe.pi (the "Service") complies with the Juvenile Protection Act, the Network Act, the Child Welfare Act, and related laws, to ensure a healthy environment for minors under 18 ("youth") and to protect them from harmful content.

### Article 2 (Definitions)
1. **Youth**: a person aged 14 or older but under 18
2. **Child**: a person under 14
3. **Harmful content**: obscene, violent, gambling, or drug-related information harmful to youth
4. **Legal guardian**: a parent or guardian acting as the youth's statutory representative

### Article 3 (Scope)
This policy applies to: youth sign-up and account management; filtering of content accessible to youth; collection and protection of youth personal data; restriction of youth payment features; and parent/guardian consent procedures.

---

## Chapter 2. Youth Member Management

### Article 4 (Youth Sign-up Policy)

#### 4-1. Age limits
- **Child (under 14)**: sign-up **not allowed**.
  - On attempt: "This service is available only to those aged 14 or older."
  - Children who sign up by falsifying their birth date are deleted immediately upon detection.
- **Youth (14–17)**: legal-guardian consent required.

#### 4-2. Youth sign-up procedure
1. Enter birth date (14–17 recognized)
2. "Parent/guardian consent required" notice shown
3. Enter legal-guardian email
4. The Company sends a consent email to the guardian
5. The guardian clicks the "Agree" link in the email
6. The youth account is activated

#### 4-3. Guardian consent items
The consent form includes: collection/use of personal data (birth date, email); agreement to the Terms of Service; agreement to the Privacy Policy; and a **special clause** acknowledging that the youth uses the service with harmful content blocked and payment features restricted.

---

### Article 5 (Youth Account Feature Restrictions)

#### 5-1. Chat
| Feature | Youth restriction | Note |
|---|---|---|
| 1:N café chat | **None** | community participation encouraged |
| 1:1 personal chat | **Blocked** | prevents risky one-on-one contact |
| Voice chat (1:N) | **None** | gender/age disclosure required |
| Voice chat (1:1) | **Blocked** | privacy protection |

#### 5-2. Boards
| Board | Youth restriction | Note |
|---|---|---|
| Notice/guide | **None** | read-only |
| Free posts | **Restricted** | posting allowed; real or guardian name required on comments |
| Marketplace board | **Restricted** | buying allowed; selling not allowed (only with guardian approval) |

#### 5-3. Marketplace
| Feature | Youth restriction | Note |
|---|---|---|
| **Buying** | **None** | parent/guardian payment approval required |
| **Selling** | **Blocked** (default) | allowed upon guardian request |
| **Payment limit** | **50,000 Pi/month** | adjustable by guardian |

#### 5-4. Example settings (My Page > Guardian settings)
```
[ Guardian email ] : parent@example.com
[ Monthly payment limit ] : 50,000 Pi (adjustable)
[ Auto-block obscene material ] : ON
[ Violence/threat content filter ] : ON
[ Game/gambling content filter ] : ON
```

---

### Article 6 (Guardian Access and Monitoring)
- **6-1. Guardian portal ("MyChild")**: activity log, friend list (anonymized), payment management (limit, history), content filters, alert settings.
- **6-2. Suspicious-activity alerts**: late-night activity (2–5 a.m.), attempts to access adult content, sharing of personal info, attempts to exceed the payment limit, reports of threats/abuse.
- **6-3. Guardian intervention**: force logout, temporarily restrict features (chat, payment), suspend the account (dormant), or request account deletion (subject to legal-effect verification).

---

## Chapter 3. Harmful-Content Filtering and Blocking

### Article 7 (Automatic Filtering)
For youth accounts the following is **auto-blocked** or **blurred**:
| Content type | Method | On exposure | Note |
|---|---|---|---|
| **Obscene material** | full block (hidden) | warning + no access | AI detection + manual review |
| **Violent video** | blur + warning | "adult content" alert on click | user-selectable |
| **Threats/harassment** | full block (reported) | reported | immediate removal + sender sanction |
| **Drugs/gambling** | full block | no access | educational content reviewed as exception |
| **Self-harm/suicide promotion** | full block + mental-health resources | crisis hotline shown | crisis line provided |

- **7-2. Exceptions (allowed)**: educational info (sex ed, health, legal advice), news articles, art works (excluding 19+), social-issue discussion (excluding violence/hate).
- **7-3. False-positive reports**: youth or guardian may report wrongly blocked legitimate content; human review within 3 days restores or upholds.

### Article 8 (Content Labeling / Rating)
| Rating | Label | Youth block | Note |
|---|---|---|---|
| **All ages** | 🟢 ALL | none | default |
| **12+** | 🟡 12+ | none | mild violence/profanity |
| **15+** | 🟠 15+ | blocked (unblockable with guardian approval) | serious violence/adult suggestion |
| **18+** | 🔴 18+ | blocked (no youth access) | obscenity, severe violence |
| **Restricted** | ⚫ RESTRICTED | blocked | youth excluded for special reasons |

Labels are set by automatic AI language analysis, manual labeling after reports, or poster suggestion (confirmed after Company verification).

---

## Chapter 4. Youth Personal-Data Protection

### Article 9 (Data Minimization)
| Data | Collected | Basis | Retention |
|---|---|---|---|
| **Birth date** | ✓ (required) | age verification | account period + 3 years |
| **Guardian email** | ✓ (required) | consent, monitoring portal | account period + 1 year |
| **Genetic data** | ✗ (prohibited) | PIPA | - |
| **Financial data** (credit card) | ✗ (indirect only) | only via guardian payment | transaction record 5 years |
| **Location** | ⚠️ (optional) | separate consent required | 1 year |

### Article 10 (No Disclosure)
The following youth data is **never disclosed**: birth date (only the "youth" age band shown), guardian contact, real name (nickname only), school/address/phone (unless self-disclosed), payment info (only the guardian may view transaction records).

### Article 11 (Deletion)
- **11-1. On account deletion**: personal data is logically deleted immediately (del_yn='Y'); nickname becomes "[deleted user]"; authored posts/chats keep **content only** with author info removed; transaction records kept for the statutory 5 years.
- **11-2. Turning 18**: auto-notification (adult-account transition), option to lift restrictions, and removal of the guardian monitoring portal (only with the youth's consent).

---

## Chapter 5. Payment and Subscription Management

### Article 12 (Youth Payment Protection)
- **12-1. Parental approval required**: every youth payment shows a parent/guardian approval request; an approval link is sent to the guardian's email; the guardian approves/declines within 24 hours; payment proceeds only after approval.
- **12-2. Monthly limit**: default 50,000 Pi, max 100,000 Pi, min 0 Pi (blocked); changeable only by the guardian; exceeding is blocked + guardian alerted.
- **12-3. Transparency**: guardians can see monthly total, per-item history (date, amount, name), subscription status, and refund records.

Example approval message:
```
[Payment approval request]
Youth member: park_john (age 14)
Item: subscription "Café VIP" (10,000 Pi/month)
Requested: 2026-06-12 14:30
[Approve] [Decline] [Change limit]
```

### Article 13 (Subscription Auto-Renewal)
- **13-1.** For youth, auto-renewal default is **OFF** (ON for adults); enabling it requires guardian approval; a reminder is sent to both guardian and youth 3 days before renewal.
- **13-2. Cancellation**: renewal stops immediately, the guardian is notified, and a pro-rata refund for the remaining period is processed automatically.

---

## Chapter 6. Safety and Reporting

### Article 14 (Youth Reporting Channels)
- **In-app report**: each item's "More" → "Report" → reason (adult content, threats, personal-info exposure, fraud) → handled within 1–2 days.
- **Guardian report**: directly from the protection portal (suspicious users, inappropriate content, adult-approach attempts); investigated and notified within 3 days.
- **Official channels**: email anakin.won@gmail.com (subject "[Youth Protection] Report"); government reporting via the youth-protection center.

### Article 15 (Risk Response)
- **15-1. Adult approaching a minor** (luring into 1:1 chat by faking age, requesting personal info for exploitation, proposing meetings, sharing sexual content): **immediate account ban + police report**.
- **15-2. Risky youth behavior**: self-harm/suicide posts → immediate removal + mental-health resources (crisis line 1393); drug references → block + educational material; harassment victim report → trace perpetrator + police report + protective measures.
- **15-3. Emergencies**: for urgent posts (e.g., "I will end my life now"), report to police immediately and **preserve the post as evidence** (do not delete).

---

## Chapter 7. Education and Awareness
- **Article 16**: in-app onboarding "Safe Internet Use Guide" (5 min), monthly safety tips, situational guidance; guardian materials ("monitoring guide", "cyberbullying response", "digital finance education") as PDF + video.
- **Article 17 (Campaigns)**: "Online Safety Month" (May), "Digital Wellness Campaign" (October), and year-round materials for new threats.

---

## Chapter 8. Government Reporting and Cooperation

### Article 18 (Government Reporting)
| Situation | Authority | Deadline |
|---|---|---|
| **Child sexual-exploitation material** | Police + child-abuse line 1391 | immediate |
| **Youth cyber sexual violence** | Police + telecom association | within 24 h |
| **Threats / extortion** | Police | within 24 h |
| **Doxxing** | Police | within 24 h |
| **Personal-data leakage** | PIPC + Police | within 5 days |

### Article 19 (Partners)
The Company cooperates with the telecom promotion association (youth-protection policy and reporting), the police cyber-crime division, the Ministry of Gender Equality and Family (child abuse/protection), and mental-health crisis centers.

---

## Chapter 9. Miscellaneous
- **Article 20 (Review)**: quarterly review of youth reports and new threats; semi-annual reporting to authorities; policy updates at least annually per legal changes.
- **Article 21 (Contact/Reporting)**: email anakin.won@gmail.com (subject "[Youth Protection]"); government cyber-safety center; mental-health crisis line 1393; child-abuse line 1391.

---

**Addendum**
- This Youth Protection Policy takes effect on June 12, 2026.
- Amendments due to legal changes may take effect without prior notice.

---

## Quick Reference
| Item | Rule |
|---|---|
| **Minimum age** | 14+ |
| **Sign-up** | guardian email consent required |
| **1:1 chat** | blocked |
| **Payment limit** | 50,000 Pi/month (default, adjustable) |
| **Payment approval** | all payments require guardian approval |
| **Harmful content** | AI auto-filtering + blocking |
| **Account monitoring** | guardian portal provided |
| **Risk reporting** | police report + government cooperation |

---

## End of Youth Protection Policy (English)

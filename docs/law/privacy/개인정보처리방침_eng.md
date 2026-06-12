# Privacy Policy
# プライバシーポリシー

**Version**: v1.0  
**Effective Date**: 2026-06-12  
**Created**: 2026-06-12  
⚠️ **This document is an AI-generated draft. Professional legal review is required before actual implementation.**

---

## Part 1: Basic Principles of Personal Information Processing

### Article 1: Purpose of Privacy Policy
Cafe.pi (hereinafter "Company") establishes and operates this Privacy Policy to comply with the Personal Information Protection Act, the Act on Promotion of Information and Communications Network Utilization and Information Protection, and other applicable laws, and to safely protect Members' personal information.

### Article 2: Personal Information Protection Officer and Department
**Personal Information Protection Officer**
- Name: [To be designated]
- Title: CEO
- Email: anakin.won@gmail.com
- Address: [Company Registration Address]

Members experiencing issues with personal information can immediately contact the officer above.

---

## Part 2: Collection and Use of Personal Information

### Article 3: Items and Purposes of Personal Information Collected

#### 3-1. Pi Account-Based Login (Required)

| Item | Scope | Purpose of Collection | Legal Basis |
|---|---|---|---|
| Pi UID | Unique identifier | Member identification, service provision, transaction records | Terms of Use Agreement |
| Pi username | Username | Profile display, chat peer identification | Terms of Use Agreement |
| Registration timestamp | TIMESTAMP | Member management, statistics | Terms of Use Agreement |
| Pi wallet address* | Blockchain public address | Payment transaction records, settlement reference (unrelated to real name) | Terms of Use Agreement |

*Note: The Company does not directly custody assets in the Pi wallet; only transaction records are stored.

#### 3-2. Google OAuth Integration (Optional)

| Item | Scope | Purpose of Collection | Legal Basis |
|---|---|---|---|
| Google Account unique ID (sub) | OAuth unique identifier | Account linking, duplicate registration prevention | Terms of Use Agreement |
| Email address | Authenticated email | Account recovery, customer communication, newsletter (separate consent) | Terms of Use Agreement |
| Profile photo URL | Google-provided image link | Profile display | Terms of Use Agreement |
| Name | Google-registered name | My Page display (optional) | Terms of Use Agreement |

#### 3-3. Chat and Content (Required)

| Item | Scope | Purpose of Collection | Legal Basis |
|---|---|---|---|
| Chat messages | Text, images, voice recordings | Service provision, dispute resolution, detection of malicious conduct | Terms of Use Agreement |
| Posts | Text, images, attachments | Service provision, copyright protection, community management | Terms of Use Agreement |
| Chat time, post time | Timestamp | Service management, dispute evidence | Terms of Use Agreement |

#### 3-4. Transaction Information (Required)

| Item | Scope | Purpose of Collection | Legal Basis |
|---|---|---|---|
| Payment transaction ID | Pi SDK transaction hash | Pi Network blockchain record, transaction tracking | Terms of Use Agreement |
| Payment amount | Pi units | Statistics, tax reporting | Terms of Use Agreement |
| Recipient/sender information | Pi wallet address or Member ID | Transaction record of counterparties | Terms of Use Agreement |
| Payment type | Tip/subscription/product purchase | Service type classification | Terms of Use Agreement |
| Transaction result | Success/failure | Transaction record management | Terms of Use Agreement |

#### 3-5. Technical Information (Auto-collected, Required)

| Item | Scope | Purpose of Collection | Legal Basis | Retention Period |
|---|---|---|---|---|
| IP address | Automatically recorded upon access | Fraudulent access detection, service analysis, location-based services | Terms of Use Agreement | 1 year |
| Device information | User-Agent, OS, browser | Service optimization, technical support, compatibility management | Terms of Use Agreement | 1 year |
| Access logs | Login time, page access time | Usage statistics, security monitoring, service improvement | Terms of Use Agreement | 1 year |
| Cookie/local storage | Session tokens, language settings, theme | User experience improvement, auto-login | Terms of Use Agreement | Session termination or 12 months |

#### 3-6. Location Information (Optional, if location-based service is used)

| Item | Scope | Purpose of Collection | Legal Basis |
|---|---|---|---|
| Location code (locale) | Country/region code (e.g., ko-KR) | Multilingual services, currency exchange rate application | Terms of Use Agreement |
| Estimated location | IP-based location estimation | Content localization | Terms of Use Agreement |

**Optional Consent Item**: Refer to Location-Based Service Terms and Location Information Collection and Use Agreement

---

### Article 4: Withdrawal of Consent and Information Modification

#### 4-1. Withdrawal of Consent
Members may withdraw consent for personal information collection and use at any time. Methods of withdrawal:
1. My Page > Personal Information Settings > "Withdraw Consent"
2. Email: anakin.won@gmail.com (Subject: "Personal Information Consent Withdrawal")
3. Customer support channels

Service use may be restricted after consent withdrawal.

#### 4-2. Correction and Deletion of Information
Members may correct personal information as follows:
1. My Page > Edit Profile: Change nickname, bio
2. Disconnect linked account: Disconnect Google account link (Pi UID retained)
3. Request deletion: Submit via anakin.won@gmail.com

---

## Part 3: Retention and Usage Period of Personal Information

### Article 5: Retention and Usage Periods

#### 5-1. Standard Retention Periods

| Information Item | Retention Period | Legal Basis |
|---|---|---|
| Pi UID, username, profile | Service use period + 3 years after member withdrawal | Personal Information Protection Act Article 39 (dispute resolution), logical deletion policy |
| Chat messages, posts | Service provision period + 1 year (immediate if deletion requested) | Copyright protection, dispute evidence |
| Transaction records (Pi SDK metadata) | 5 years | Tax law Article 44, record retention requirement |
| IP, access logs | 1 year | Information and Communications Network Act Article 44 (illegal conduct tracking) |
| Google OAuth linking information | Immediately upon disconnection | Minimal collection principle |
| Cookie/local storage | Session termination or 12 months | User settings priority |
| Location information (IP-based) | 1 year | Location Information Protection Act |

#### 5-2. Processing Upon Member Withdrawal
Upon Member withdrawal:
1. Personal information is immediately **logically deleted** (del_yn = 'Y', del_dtm recorded)
2. Principle: Physical deletion after 3 years from withdrawal
3. **Exceptions**: Transaction records, chat evidence retained for statutory retention periods (5 years)
4. Members may request complete deletion of personal information prior to withdrawal via My Page

---

## Part 4: Third-Party Disclosure of Personal Information

### Article 6: Third-Party Disclosure Status

#### 6-1. Required Disclosures

| Recipient | Information Disclosed | Purpose | Legal Basis | Disclosure Timing |
|---|---|---|---|---|
| **Supabase** (Singapore) | Pi UID, username, chat messages, transaction records, IP, device information | Cloud data storage, DB hosting | Terms of Use Agreement, data processor contract | Immediate |
| **Vercel** (Global CDN) | Profile images, static content, access logs | Web hosting, CDN provision | Terms of Use Agreement, data processor contract | Immediate |
| **Google Cloud** | Translated content requests (partial) | Multilingual translation API | Terms of Use Agreement, as needed | As needed |
| **Anthropic** (Claude API) | Content analysis, recommendation engine learning | AI-based feature improvement | Terms of Use Agreement, de-identified processing | As needed |

#### 6-2. Prohibition of Disclosure Without Legal Basis
The Company does not disclose personal information to third parties such as advertisers or marketers without explicit Member consent.

#### 6-3. International Transfer
International transfer occurs due to Supabase (Singapore), Vercel (Global), Google Cloud, etc. listed in the table above. Members are deemed to acknowledge and consent to such transfer.

---

## Part 5: Personal Information Processing Entrustment

### Article 7: Entrustment Status

| Entrustee | Entrusted Work | Data Processing Contract |
|---|---|---|
| Supabase | Database hosting, backup, recovery | Data processing contract in place |
| Vercel | Web application hosting, CDN | Data processing contract in place |
| Anthropic | AI-based content analysis (optional) | Data processing contract in place |

**Company Responsibility**: The Company imposes contractual obligations on entrustees to handle personal information safely. Changes to entrustment will be notified.

---

## Part 6: Personal Information Security

### Article 8: Security Measures
1. **Encryption**:
   - Communication security: HTTPS/TLS 1.3 or higher
   - Storage encryption: Sensitive information (Pi wallet address, etc.) encrypted with AES-256

2. **Access Control**:
   - Personal information access granted only to employees with business need
   - Regular access review and revocation

3. **Intrusion Detection**:
   - Malware detection system
   - Real-time log monitoring
   - Security surveillance once per month

4. **Personal Information Breach Response**:
   - Immediate internal reporting upon incident occurrence
   - Report to National Police Agency and Korea Communications Commission (within 5 days)
   - Notification to affected Members (Personal Information Protection Act Article 34)

### Article 9: Member's Security Obligations
Members must comply with the following:
- Set strong passwords (combination of letters, numbers, special characters)
- Do not share password with others
- Confirm logout when using public devices
- Report immediately upon suspicious login

---

## Part 7: Rights of Information Subjects

### Article 10: Information Subject Rights

#### 10-1. Right to Access
Members may request and access their personal information.
- Request method: My Page > "My Information" or email (anakin.won@gmail.com)
- Response period: Within 10 days of request
- Fee: Free

#### 10-2. Right to Correct and Delete
1. **Correction Request**:
   - My Page > Edit Profile
   - Email request: anakin.won@gmail.com

2. **Deletion Request**:
   - Information retained beyond statutory retention periods may be deleted
   - Transaction records retained for 5 years (not subject to deletion)
   - Response period: Within 10 days

#### 10-3. Right to Suspend Processing
- Information subjects may request suspension of processing if the collection purpose is achieved or no longer necessary
- Email: anakin.won@gmail.com

#### 10-4. Right to Withdraw Consent
See Article 4

---

## Part 8: Changes to Personal Information Processing Policy

### Article 11: Policy Change Notification
1. Upon change to the Privacy Policy, the Company specifies the reason for change and provides notification at least 7 days before the effective date.
2. Notification methods: Service notice, email
3. Items subject to notification:
   - Addition/deletion of major personal information collection items
   - Shortened retention periods
   - New third-party disclosures
   - Change of countries for international transfer

---

## Part 9: Cookies and Similar Technologies

### Article 12: Cookie Policy
1. **Purpose of Cookies**:
   - Auto-login (considering Pi Browser cookie storage limitations)
   - Saving user settings (language, theme)
   - Service usage statistics

2. **Cookie Rejection**:
   - Cookies may be rejected via browser settings
   - However, some features may be restricted

3. **Local Storage**:
   - Pi Browser compatibility: `localStorage.setItem('pi_token', ...)`
   - Users may delete via developer tools

---

## Part 10: Marketing Information Receipt

### Article 13: Email/Push Notifications
1. **Consent to Receive Marketing Information**:
   - Separate consent required (Information and Communications Network Act Article 50)
   - Consent determined via optional checkbox during registration

2. **Opt-out**:
   - My Page > Notification Settings
   - Email footer "Unsubscribe" link
   - SMS: Reply "Unsubscribe"

3. **Effect of Opt-out**:
   - Marketing email delivery suspended
   - Important notices (service maintenance, security alerts) continue to be sent

---

## Part 11: Processing of Information of Children (Under 14 Years Old)

### Article 14: Child Personal Information Protection
1. **Child Member Registration Policy**:
   - Registration for children under 14 years of age is not permitted
   - Date of birth verification required upon registration (adult verification)

2. **Parental/Guardian Consent**:
   - Members aged 14 or older but under 18 require parental/guardian consent
   - Consent method: Verification via parental/guardian email

3. **Child Information Protection**:
   - Minimal collection of child information
   - Blocking of adult-oriented content
   - Payment feature restrictions

---

## Part 12: Miscellaneous

### Article 15: Currency and Regular Review
- The Policy undergoes regular review at least once per year
- Immediate updates upon changes to applicable laws
- Last review date: June 12, 2026

### Article 16: Links
- Personal Information Protection Laws: https://www.law.go.kr/
- Personal Information Protection Commission: https://www.pipc.go.kr/
- Korea Consumer Agency Dispute Resolution: https://www.kca.go.kr/

### Article 17: Dispute Resolution Contact Information
**Personal Information Breach Report**:
- Personal Information Protection Commission: 1833-6958 / https://www.pipc.go.kr/
- Police Agency Cyber Bureau: https://cyberbureau.police.go.kr/

**Company Contact**:
- Email: anakin.won@gmail.com
- My Page > Customer Support

---

**Supplementary Provisions**
- This Privacy Policy takes effect on June 12, 2026.

---

**Contact Information**
- Email: anakin.won@gmail.com
- Address: [Company Registration Address]
- Business Registration Number: (In Preparation)

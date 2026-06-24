# Service Terms of Use
# サービス利用規約

**Version**: v1.0  
**Effective Date**: 2026-06-12  
**Created**: 2026-06-12  

---

## Part 1: General Provisions

### Article 1: Purpose
These Terms of Use govern the conditions and procedures for using the Cafe.pi service (hereinafter "Service" or "Company"), a Pi Network-based community platform (hereinafter "Platform"), and define the rights and obligations between the Company and Users. By registering for and using the Service, Users are deemed to have accepted these Terms.

### Article 2: Definitions of Terms
1. **User**: An individual or legal entity that agrees to these Terms and uses the Service.
2. **Company**: The operator of Cafe.pi.
3. **Service**: All features provided via Pi Browser and web browsers, including chat rooms, forums, cafe marketplace, and voice chat.
4. **Pi Network**: The Pi virtual asset and Pi Browser-based authentication and payment infrastructure.
5. **Pi Account**: A user account created and managed at Pi Network's official website (minepi.com).
6. **Member**: A User who has agreed to use the Service and completed registration.
7. **Content**: Any text, images, audio, video, links, or other material posted or uploaded within the Service.
8. **Payment**: Transactions of Pi virtual assets between Members via Pi SDK (tips, subscription fees, marketplace purchases).

### Article 3: Posting and Amendment of Terms
1. The Company posts these Terms on the Service's initial screen and at the `docs/law/terms/` path at all times.
2. When amending these Terms, the Company specifies the reason and content of the amendment and provides notice at least 7 days before the effective date via Service announcement or email.
3. If a Member does not agree to amended Terms, they may request service suspension or withdrawal. If the Member continues to use the Service without explicit consent within 14 days of notice, they are deemed to have accepted the amended Terms.

---

## Part 2: Member Registration and Management

### Article 4: Registration Procedure and Qualifications
1. Individuals wishing to use the Service may register as Members through the following procedure:
   - (1) Select "Login with Pi Account" or "Login with Google Account" on the registration screen.
   - (2) Complete Pi Browser or Google OAuth authentication.
   - (3) Confirm agreement to these Terms, the Privacy Policy, and the Personal Information Collection and Use Agreement.
   - (4) Enter additional profile information (e.g., nickname) and complete registration.

2. Minimum requirements for membership:
   - An individual 14 years of age or older (minors require parental/guardian consent — see Article 5).
   - A valid Pi Account or Google Account.
   - A resident of South Korea or a country where the Service is supported (confirmed via IP-based location verification).

3. Registration may be refused in the following cases:
   - The applicant is subject to a court or government ban on using the Service.
   - The applicant previously withdrew due to Terms violation within the past 6 months.
   - The applicant attempts to register using another person's account.
   - Technical faults or fraudulent transactions are detected.
   - Other cases where registration could significantly impede Service operations.

### Article 5: Minor Members
1. Minors aged 14 or older but under 18 must obtain parental/guardian consent to register.
2. The Company implements the following protections for minors:
   - Payment function restrictions (requiring parental approval or additional age verification).
   - Restricted access to adult-oriented forums or content.
   - Minimized personal information collection.
3. If a minor is found to have registered without parental consent, the Company may immediately suspend the account.
4. Minor Members may request removal of function restrictions after reaching adulthood.

### Article 6: Management of Member Information
1. Members are responsible for ensuring that information provided during registration is accurate and for promptly updating any changes.
2. The Company is not liable for damages arising from inaccurate information provided by Members.
3. Members must cooperate with the Company's requests for verification of information accuracy.

### Article 7: Member Obligations
1. Members must comply with the following:
   - These Terms and applicable laws and regulations.
   - Prohibition of infringement on others' personal information, reputation, or copyrights.
   - Maintenance of account security and prohibition of account transfer or gifting to others.
   - Assumption of responsibility for violations of these Terms and prevention of liability shift to the Company.
   - Prohibition of intentionally causing technical failures (spam, DDoS attacks, etc.).
   - Prohibition of illegal transactions, promotion of drugs, violence, or adult content.
   - Prohibition of indecent communication or harassment.

2. If a Member violates Article 1 above, the Company may take the following measures:
   - Delete the Content.
   - Issue warnings to, suspend, or permanently block the account.
   - Suspend or terminate the Member's use of the Service.
   - Pursue damages.

---

## Part 3: Service Provision and Suspension

### Article 8: Service Provision
1. The Service includes:
   - Chat Rooms: One-to-many text and voice chat.
   - Forums: Announcement, general discussion, guide, and marketplace forums.
   - Cafe Marketplace: Member-to-member trading of goods and services.
   - Pi Payment Features: Virtual asset transfers for tips, subscription fees, and product purchases.

2. The Service is provided 24 hours a day, 7 days a week, except during scheduled maintenance (once monthly, date TBD) or emergency maintenance, when the Service may be temporarily suspended.

### Article 9: Service Suspension or Modification
1. The Company may suspend or modify the Service without prior notice in the following cases:
   - Acts of God, war, terrorism, or other force majeure events.
   - Network or server failures, or cyberattacks.
   - Government orders or directives.
   - Changes or suspension of Pi Network or Google authentication infrastructure.

2. For scheduled or planned maintenance, the Company provides notification at least 3 days in advance via Service announcement.

3. The Company is not liable for damages resulting from Service suspension (failed transactions, data loss, etc.) unless the Company is at fault.

### Article 10: Service Termination
1. The Company may terminate the entire Service due to business reasons or technical issues.
2. In the event of Service termination, the Company provides notice at least 60 days in advance, and Member personal information is handled according to the Privacy Policy.

---

## Part 4: Pi Payment and Transactions

### Article 11: Special Nature of Payment and Disclaimer
1. **Volatility of Pi Virtual Asset**: Pi is a blockchain-based virtual asset subject to market volatility. The Company is not liable for damages arising from Pi value fluctuations at the time of payment.

2. **Irreversibility of Transactions**: Payments via Pi SDK are recorded as blockchain transactions, and after completion, cancellations or refunds are technically impossible. Refund policies are governed by a separate document (`docs/law/refund/환불및청약철회정책_kor.md`).

3. **Network Risk**: The Company acts as an intermediary regarding Pi Network blockchain network delays, failures, reorganization (reorg), or other issues resulting in failed transactions, duplicate deductions, or errors, and while the Company will make its best efforts, the Company does not assume final liability.

4. **No Direct Asset Custody**: The Company does not directly hold or custody Members' Pi assets. All transactions occur directly from a Member's Pi wallet (Pi Wallet or Pi Browser built-in wallet).

### Article 12: Payment Method and Approval
1. Tips, subscription fees, marketplace product purchases, and other payments are processed via Pi SDK's `invokeContract()` method or official payment UI.
2. Upon payment approval, the Company provides a transaction completion notice, indicating the establishment of a transaction between Members.
3. Upon payment, funds are deducted from the Member's Pi wallet and immediately deposited into the recipient's wallet (blockchain delays possible).

### Article 13: Subscription Management
1. Subscription services are offered on a monthly, quarterly, or annual basis, with recurring payments according to the Member's chosen period.
2. Subscription cancellation is available at any time via Service Settings > Subscription Management. Refunds for the remaining subscription period follow the stated policy.
3. Resubscription after cancellation is treated as a new transaction.

### Article 14: Basic Principles of Marketplace Transactions
1. The Marketplace is a venue for Member-to-member trading of goods and services. The Company serves as an intermediary only and does not warrant the legality or quality of transactions.
2. If actual goods differ from descriptions, transaction parties must resolve the issue through negotiation, and the Company will not intervene.
3. Upon discovery of illegal goods trading (counterfeits, drugs, weapons, etc.), the Company may delete the related Content and suspend the Member's account.

---

## Part 5: Content and Copyrights

### Article 15: Copyright and Usage Rights for Content
1. Copyrights for Content created by Members remain with the creator.
2. By posting Content on the Service, Members grant the Company the following rights:
   - Public display, storage, and transmission of Content within the Service.
   - Use of Content for Service promotion, statistics, and analysis.
   - Use of Content for customer support and legal issue resolution.
3. Members must not create Content that infringes on others' copyrights, publicity rights, or publicity rights.

### Article 16: Prohibited Content
The following Content is prohibited:
1. Illegal transactions (drugs, weapons, adult items, etc.).
2. Unauthorized disclosure of personal information (names, phone numbers, addresses, account information, etc.).
3. Defamation, insults, profanity, threats, or harassment.
4. Obscene material, extreme violence, or encouragement of self-harm.
5. Spam, advertising, or duplicate posting.
6. Copyright-infringing content (unauthorized upload without copyright holder permission).
7. Technical attack information (hacking code, malicious links, etc.).
8. Religious or political extremism or promotion of discrimination or hate.

### Article 17: Content Deletion and Sanctions
1. Upon discovery of Content violating Article 16, the Company may delete it without prior notice.
2. Depending on the severity of violation, the Company may take the following measures:
   - Minor: One warning.
   - Significant: 7-day account suspension.
   - Repeated (3+ times per month): 30-day account suspension.
   - Severe (illegal transactions, personal information exposure, etc.): Permanent account ban.

3. Members may file an objection to the deletion of Content. The Company reviews and responds within 7 days.

### Article 18: Voice Chat Operating Rules
1. Prohibitions set forth in Article 16 apply to voice chat (both one-to-many and one-to-one).
2. Upon receipt of complaints regarding inappropriate voice chat (profanity, harassment, etc.), the Company may record and store the chat for evidence purposes.
3. Repeated instances of malicious voice chat are subject to sanctions under Article 17.

---

## Part 6: Dispute Resolution and Limitation of Liability

### Article 19: Dispute Resolution Procedure
1. In the event of a dispute between the Company and a Member, the following procedure applies:
   - (Step 1) Resolution through negotiation between parties (within 7 days).
   - (Step 2) Request for mediation by the Company's Customer Support Team (within 7 days).
   - (Step 3) Application for dispute resolution by the Korea Consumer Agency.
   - (Step 4) Civil litigation.

2. When filing a dispute, a Member must provide the following information:
   - Member ID, transaction date, transaction amount, and description of the dispute.
   - Supporting documentation (screenshots, transaction receipts, etc.).

### Article 20: Limitation of Liability
1. The Company is not liable for the following:
   - Service suspension due to acts of God, war, terrorism, or government actions.
   - Failures or changes to Pi Network or Google authentication infrastructure.
   - Data loss due to hacking, viruses, or unauthorized access.
   - Information disclosure due to a Member's account management negligence.
   - Legality, quality, or completion of Member-to-member transactions.
   - Damages from Pi virtual asset price fluctuations.
   - Product defects or shipping delays in the Marketplace.
   - Indirect damages from Service errors or suspension (business loss, lost profits, etc.).

2. However, direct damages resulting from the Company's gross negligence (intentional information disclosure, unauthorized asset seizure, etc.) are excluded from this limitation.

### Article 21: Disclaimer of Warranty
1. The Service is provided "as is." The Company does not warrant:
   - The integrity, validity, or accuracy of the Service.
   - That the Service is suitable for a particular purpose.
   - The ability to recover from losses due to Service use.
2. Members are responsible for computer damage and data loss resulting from their use.

---

## Part 7: Personal Information and Security

### Article 22: Personal Information Processing
1. The collection, use, storage, and third-party disclosure of Member personal information follows the Privacy Policy at `docs/law/privacy/개인정보처리방침_kor.md`.
2. Upon agreeing to personal information collection and use, Members read and accept this agreement along with the Privacy Policy and Personal Information Collection and Use Agreement.

### Article 23: Information Security
1. The Company operates systems equipped with encryption, access controls, and intrusion detection systems to protect Member personal information.
2. Upon discovery of an information breach, the Company immediately reports to law enforcement and notifies affected Members.
3. Members share responsibility for maintaining account security (using strong passwords, confirming logout, etc.).

---

## Part 8: Governing Law and Jurisdiction

### Article 24: Governing Law
All matters related to these Terms and Service use are governed by the laws of the Republic of Korea. For international disputes, the following laws are prioritized:
1. Framework Act on Consumer Protection in Electronic Commerce.
2. Law on the Regulation of Terms and Conditions.
3. Personal Information Protection Act.
4. Act on Promotion of Information and Communications Network Utilization and Information Protection, Etc.

### Article 25: Jurisdiction
The courts having jurisdiction over disputes arising from Service use are the courts in the Member's domicile or the courts having jurisdiction over the Company's registered address.

---

## Part 9: Miscellaneous

### Article 26: Notices
The Company's important notices are posted on the Service's initial screen, via email, or through app push notifications. Members are responsible for regularly checking announcements.

### Article 27: External Application of Terms
Matters not specified in these Terms are governed by applicable laws and common practice.

### Article 28: Interpretation of Terms
In interpreting these Terms, the interpretation most favorable to the Member applies (following consumer protection principles).

---

**Supplementary Provisions**
- These Terms of Use take effect on June 12, 2026.
- If current Terms exist, amendments will be noted and announced.

---

**Contact**: anakin.won@gmail.com  
**Address**: (Company Registration Address)  
**Business Registration Number**: (In Preparation)

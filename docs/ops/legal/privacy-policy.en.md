# Privacy Policy

> English version ｜ 简体中文见 [privacy-policy.zh.md](./privacy-policy.zh.md)
> Last updated: 2026-06-08
> Applicable products: StudyBuddy WeChat Mini Program + iOS / Android apps

We (XXX Technology Co., Ltd.) take your privacy very seriously. This Policy explains how we collect, use, store, share, and protect your personal information.

## 1. Information We Collect

### 1.1 Information You Provide

| Information | Scenario | Required? |
| --- | --- | --- |
| WeChat OpenID / Apple Sub / Google Sub | First login | Yes |
| Nickname | Profile | Yes |
| Avatar | Profile | Optional |
| School / Major / Grade | Profile | Optional |
| Phone number | Same-school matching | Optional |
| Location | When creating activities | Optional |
| Activity content (title / description / tags) | Activities you post | Yes |
| Reviews (rating / comment) | After activity ends | Optional |

### 1.2 Information Automatically Collected

- Device info: model, OS version, device ID
- Network info: IP address, network type
- Logs: access time, time spent, error logs

## 2. How We Use Information

We use the collected information for:

1. **Account system**: registration, login, authentication
2. **Core features**: posting activities, signing up, matching, reviews
3. **Content safety**: calling WeChat `msg_sec_check` API to review your content (issue #26)
4. **Service improvement**: anonymized data analytics to optimize the product
5. **Customer support**: respond to inquiries and complaints
6. **Legal obligations**: cooperate with lawful requests from judicial / administrative authorities

## 3. Storage and Protection

### 3.1 Storage Location

- **Within mainland China**: Alibaba Cloud / Tencent Cloud (Shenzhen + Shanghai dual-center, geo-redundant)
- **Overseas** (only when you opt into "overseas mode"): AWS Frankfurt (eu-central-1) + Virginia (us-east-1)

### 3.2 Storage Period

| Information | Period |
| --- | --- |
| Account basic info | Fully cleared within **30 days** after account deletion |
| Activities / reviews | Cleared together with account |
| Operation logs | **180 days** (legal requirement) |
| Access Token | **15 minutes** (JWT expiry) |
| Refresh Token | **30 days** (sliding window) |

### 3.3 Security Measures

- Transport: full-site HTTPS / TLS 1.3
- Storage: passwords bcrypt (cost = 12), sensitive fields AES-256-GCM
- Access control: role-based minimal privileges (RBAC), audit logs retained 365 days
- Vulnerability response: please send to security@studybuddy.app, acknowledged within 48h

## 4. Information Sharing and Disclosure

We **do not sell** your personal information. We share only in the following cases:

1. **Necessary sharing**: with activity organizers (only the nickname + avatar of those who joined that specific activity)
2. **Same-school matching**: when you opt in, share school / major info with other same-school users
3. **Service providers**: only the necessary storage / auth info to cloud providers (Alibaba Cloud / WeChat)
4. **Legal requirements**: lawful requests from courts, public security authorities, etc.
5. **Your consent**: other cases with your explicit consent

## 5. Your Rights

You have the following rights over your personal information:

| Right | How to Exercise |
| --- | --- |
| **Access / Copy** | Profile → Settings → Export Data (JSON / CSV) |
| **Correct** | Profile → Edit |
| **Delete** | Profile → Settings → Delete Account (30-day full purge) |
| **Withdraw authorization** | Settings → Privacy → disable feature (same-school / location / phone) |
| **Complain / Report** | Report button on each activity / profile, or email report@studybuddy.app |
| **Data protection complaint** | Cyberspace Administration of China, hotline 12377 |

## 6. Cookies and Local Storage

### 6.1 WeChat Mini Program

WeChat mini programs run inside the WeChat client and **do not use** traditional cookies. We use `wx.setStorageSync` for local storage, only storing:
- Login state (accessToken + refreshToken)
- User preferences (e.g. "enable same-school matching")

### 6.2 iOS / Android Apps

- iOS: use `Keychain` for tokens, `UserDefaults` for preferences
- Android: use EncryptedSharedPreferences for tokens, SharedPreferences for preferences

## 7. Third-Party SDKs

We use the following third-party SDKs, each collecting only the information necessary for its function:

| SDK | Provider | Purpose | Information Collected |
| --- | --- | --- | --- |
| WeChat Open Platform | Tencent | Login / share / payment | OpenID, UnionID, nickname, avatar |
| Apple Sign In | Apple | iOS login | Apple Sub, nickname, email (optional) |
| Google Sign In | Google | Android login | Google Sub, nickname, email (optional) |
| Mapbox | Mapbox Inc. | Map / location | Geolocation (only when creating activity) |
| Alibaba Cloud OSS | Alibaba Cloud | Image / file storage | Uploaded files |
| WeChat `msg_sec_check` | Tencent | Content moderation | Text content |

## 8. Minor Protection

StudyBuddy is for **users aged 18 and above**. Registration requires ticking the "I am 18 or older" checkbox.

We **do not** actively collect information from minors. If you find a user under 18, please contact support@studybuddy.app, and we will immediately delete their account.

## 9. Policy Changes

Updates to this Policy will be notified to you via in-app notice **7 days before** they take effect. Continued use of the Service is deemed acceptance of the updated Policy.

## 10. Contact Us

- Data Protection Officer: dpo@studybuddy.app
- Customer support: support@studybuddy.app
- Reports: report@studybuddy.app
- Security: security@studybuddy.app
- Address: XXX Tech Park, XXX Road, Nanshan District, Shenzhen, China

The final right of interpretation of this Policy belongs to XXX Technology Co., Ltd.

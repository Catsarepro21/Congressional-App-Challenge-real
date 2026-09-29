# SafeScale Health privacy policy — draft for review

**Status:** Draft. Complete the developer identity, contact, effective date, and public URL before publishing this as a privacy policy or using it for an app-store listing.

**Effective date:** [date]
**Developer:** [legal name or organization]
**Contact:** [public support email]
**Policy URL:** [public HTTPS URL]

## What SafeScale handles

SafeScale lets you enter a profile, allergies, medications, meals, activity, symptoms, contacts, and medical notes. With your permission, the native app can read selected Apple Health or Android Health Connect data. On supported iPhone builds, you can optionally connect a Google health account. Camera and photo access is used when you choose a scan; location and motion access support optional workout features.

Native saved records and connection credentials are encrypted in app storage with a key held in device secure storage. The web preview stores records in browser storage; it does not provide the same app-level encryption. Clearing the app or browser data removes locally saved records. Your operating system, backups, and any copies you export have separate controls.

## Optional external requests

- **Google health account:** If you connect it, SafeScale uses Google OAuth to obtain permission and read the requested health data. An enabled automatic sync can refresh readings while the app is active. Disconnecting inside SafeScale removes its saved connection; revoke the account permission with Google separately.
- **Google Gemini:** Cloud food-photo, ingredient-label, medical-document, or health-chat requests require a separate approval for each request. The approval shows the destination and the data being sent. A medical-document request sends the **full, unredacted original image** to Google, which may contain identifying and medical details. Asking the model to omit identifiers in its response does not redact the uploaded image. A health-chat request can include a health snapshot and recent conversation as shown in the approval flow.
- **Open Food Facts:** An optional online barcode lookup sends the barcode after approval; it does not send the health profile.

SafeScale also offers local rules and, on compatible Apple devices, on-device model features. Selecting an AI preference does not itself authorize a cloud upload. External providers handle information under their own terms and privacy policies. [Verify and add current provider-policy links and any other production integrations.]

## Your choices and deletion

Connections and cloud AI are optional. You can use manual entry, decline an individual upload, disconnect a health source, export a JSON copy, and delete SafeScale's local records in the app. Deleting local data does not remove records in Apple Health, Google services, your photo library, previously exported copies, or information already received by an external provider. Review those services' controls separately.

## Sharing and retention

SafeScale does not include an app-operated health-record server in the reviewed code. Local records remain until you delete them or clear app/browser data. Optional requests transmit only after the described user action or connected-service sync. [Verify production hosting, diagnostics, analytics, support logs, and third-party retention before final publication.]

## Safety and age-related details

The experimental stability index and AI explanations are for personal tracking, not diagnosis or treatment. [Confirm intended audience, age restrictions, jurisdiction-specific notices, and the legal basis for any children's data before publication.]

## Changes and questions

We will update this page when data practices change. Contact [public support email] with privacy questions.

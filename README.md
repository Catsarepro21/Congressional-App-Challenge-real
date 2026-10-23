# SafeScale Health

## October 23, 2026: local-only security changes

The current source blocks cloud AI, remote image loads, and unrelated external services. Apple Health and Android Health Connect remain local device integrations. Optional **Google Health / Fitbit import on iPhone** is restored: explicit sign-in uses PKCE and read-only Google API requests; connection tokens are retained only inside encrypted native records after new consent. Journal records, photos, medical records and chats are not uploaded. On-device photo failure does not fall back to cloud processing. Manual exports remain an explicit user action and produce unencrypted copies outside the vault.

The October 23 device-video follow-up fixes the barcode reticle intercepting the camera permission button, adds Settings/resume handling and image-picker permission descriptions, and makes Apple Foundation Models distinguish ordinary wellness guidance from claims about the user's recorded facts. Unavailable models still use clearly labeled local rules. Historical verification notes below describe earlier revisions; live iPhone camera and Google sign-in need acceptance testing on the updated IPA.

Native records use AES encryption with a device secure-storage key. Browser records now require a passphrase-derived encrypted vault; the passphrase is not saved. Supported photo attachments are embedded inside encrypted records rather than saved as cache references. Original photos and any OS-retained temporary copies remain subject to platform storage behavior.

Profile → **Test on-device text model** uses fictional context to exercise the actual Apple Foundation Models bridge. Select On-Device AI to use the native model for chat. Unsupported or unavailable models use labeled local rules and never escalate to cloud.

See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for evidence, limitations, and the iPhone acceptance checks. These source changes do not update existing IPA files. Native compilation and actual iPhone inference still require a new build and device validation. Older dated notes below describe prior states.

## September 13, 2026: personalized daily experience

- Today supports persistent hide/show/reorder controls, with fasting hidden by default. An active fasting timer remains discoverable even if its card is hidden.
- The connected timeline combines dated meals, water, symptoms, mood, vitals, completed workouts, retained daily sleep summaries, and newly recorded medication doses. Filter by type and date. Date-only records remain untimed; undated legacy meals are excluded rather than assigned invented dates.
- Medication completion history persists across days; repeated completion is idempotent and undo removes that day's completion event. Historical doses predating this version cannot be reconstructed.
- Medical ID now opens its dedicated screen.
- Sleep stages union duplicate intervals, keep unspecified/conflicting sleep separate from Core, and no longer invent empty-data efficiency. Missing nights are excluded from duration-target comparisons. The proportional stage bar is labeled accurately, not as a chronological hypnogram.
- Recovery requires recorded inputs instead of default scores. Fasting displays elapsed-time bands instead of claiming measured ketosis or autophagy. Weekly reports group calories by recorded day and restrict inputs to the last seven local dates.
- Manual meal logging works without a photo. Cloud photo analysis requires a send action and validates returned fields. Offline photo recognition and native AI stubs are explicitly unavailable; no synthetic meal fallback is used.
- See [AI_ROADMAP.md](AI_ROADMAP.md) for the current AI architecture, remaining work, and acceptance criteria.

Validation: 47 tests passed; TypeScript passed; web and iOS JavaScript exports passed. Browser checks covered card hide/reorder persistence after reload, manual meal save into the timeline, filtering, and Medical ID navigation. Today was visually inspected at desktop and 390-pixel phone width.

This changes source code only: no native IPA was rebuilt or re-signed, and signing files were not modified. Live HealthKit, cloud inference, and native camera behavior require device validation. Sleep history retains the existing seven-day storage limit; the timeline does not reconstruct older sleep records. Native saved records now use encrypted app storage; the web preview uses browser storage.


## September 10, 2026: focused daily-care redesign

The main experience now has five tabs: Today, Journal, Records, Medical ID, and Settings. The responsive layout uses shared, accessible components and replaces the oversized home/settings screens.

- **Today:** daily medication schedule, mark taken/undo, stock and refills, latest native health readings with sync time, and links to the journal and profile.
- **Journal:** mood/stress check-ins, free-text visit questions, symptom observations, search and filtering, and individual entry deletion.
- **Records:** manual records with calendar-date validation, search/category filters, and a reviewable visit summary that downloads as text on web or opens native sharing. The export explicitly excludes API keys, OAuth credentials, raw FHIR and document images; it is not a full backup.
- **Medical ID:** saved identity, allergies, medications, and contacts. Calls require confirmation and are disabled for fictional samples. This does not configure the OS lock-screen Medical ID.
- **Settings:** optional profile fields, allergy and contact management, and isolated sample mode. Onboarding needs no account or body measurements.

Medication status is scoped to the local calendar date and refreshed after hydration, foregrounding, and while open. Undo restores only stock actually deducted. Legacy completion flags have no date, so they reset to pending on first use; existing inventory is retained. Previously stored records and profiles are kept. Legacy meal entries no longer modify measured activity telemetry.

The experimental scanner, fitness and analytics screens are no longer routed from the main experience. Their source and persisted data remain in the repository for future focused work. Unvalidated stability scores, triage, vaccine suggestions and unsupported wearable connection buttons are not part of the new main flow. The redesign does not perform cloud AI requests.

### Verification

- TypeScript check and 17 regression tests, including local dates, dose completion/undo, legacy rollover, persistence, export exclusions, native-reader regressions and sample isolation.
- Expo web and iOS JavaScript exports.
- Local Chromium layout and interaction checks with fictional entries. Native HealthKit/Health Connect, iOS compilation/signing, actual notification delivery and phone calls still require device testing.

Native saved records use encrypted app storage; the web preview uses browser storage. Health sync retains the existing native adapters, including their remaining data-provenance limitations. A native JavaScript export is not an Xcode build or proof of device integration.

---

# Earlier repair notes and free installation

Updated September 9, 2026.

## What is now fixed

- iOS workflow now selects Xcode 26.4 on macOS 26, matching Expo SDK 56. Removed dependency-source rewrites that attempted to force modern Swift onto Xcode 16.2.
- Updated Expo dependencies to their SDK-compatible patch versions and regenerated the lockfile.
- Corrected the CommonJS HealthKit import in the health service and onboarding.
- Added the HealthKit config plugin. Removed unused background delivery and APNs push entitlements; local reminders remain supported. Plugin order matters: the local-notifications-only plugin must be first so its entitlement cleanup runs last.
- iOS queries time out instead of hanging indefinitely; empty or denied queries do not invent normal heart rate or eight hours of sleep. Sleep stages merge overlapping intervals and exclude awake/in-bed time.
- Failed native sync no longer falls through to random values. Direct Fitbit/Strava/Polar/Withings integrations explicitly report that they are not implemented.
- Unknown blood type remains Unknown. It is no longer inferred from gender or silently set to O-positive. Previously saved blood types are not changed automatically because the app cannot distinguish user-entered values from old defaults; review them yourself.
- Profile hydration completes before onboarding is displayed. Test Mode restores the original data and does not persist sample data over personal records.
- Daily medication reminder trigger works across native platforms and rejects invalid times.
- Added browser dependencies and working web confirmation dialogs. Missing scores display No data rather than Low.
- Updated obsolete Gemini model endpoints and legacy file-reading imports. Corrected claims about on-device redaction and the offline dictionary. No medical photos, credentials, or real health data were sent to Google during testing.

## Use it free on Windows now

From this project folder:

```powershell
npm ci
npm run web
```

Choose Enter Manually. Profiles and logs stay in this browser's storage. This is a browser preview, not a complete replacement for the native app: Apple Health, native reminders, background tracking, camera permissions and device-specific functions require separate device testing. Clearing browser data removes its local records.

The preview used during this repair is http://localhost:8081 while the development server is running. It contains a fictional Test Profile used for verification.

## Free native iPhone use, including HealthKit

Apple's current iOS capability table marks HealthKit as available to free Apple Developer accounts. Paid membership is not an inherent HealthKit requirement. Free Personal Team signing expires after seven days.

The most dependable supported route is a Mac with full Xcode 26.4 or newer (command-line tools alone are insufficient), Node 22+, and CocoaPods:

```sh
npm ci
npx expo prebuild --platform ios
open ios/SafeScaleHealth.xcworkspace
```

1. Sign in to Xcode with your Apple Account. You do not need to purchase membership.
2. In the app target's Signing & Capabilities, select your Personal Team and automatic signing. Use a unique bundle identifier; update app.json to the same identifier so future prebuilds preserve it.
3. Keep HealthKit. Do not add Push Notifications, iCloud or other unsupported capabilities. This project uses local reminders and does not need APNs.
4. Connect your iPhone, complete Apple's trust/Developer Mode steps if prompted, select it as the run destination, and Run. Use a Release run configuration if you want a bundled app that does not depend on a running development server.
5. Grant the requested Health access on the phone. Add a known sample in Apple Health and verify it appears after sync. A successful authorization request does not prove that every read permission was granted; Apple deliberately protects that distinction.
6. Rebuild/re-sign before the seven-day profile expires.

A successful simulator build or unsigned IPA does not prove that signing and HealthKit work on your iPhone.

## Windows-only native route

The corrected GitHub Actions workflow can compile the unsigned IPA on a hosted Mac after the changes are pushed to your repository. Its artifact is SafeScaleHealth-Unsigned-IPA. Nothing was pushed or dispatched during this repair.

An unsigned IPA must then be signed before installation. Sideloadly and AltStore Classic document free-account sideloading from Windows with seven-day renewal. Whether a particular tool preserves and provisions HealthKit for this exact app must be verified on your phone; do not treat a successful installation as evidence that HealthKit works. Start with the official vendor instructions, and enter your Apple credentials yourself. No sideloading software was installed during this repair.

The EAS preview profile is internal distribution, not a bypass for Apple's signing requirements. The simulator profile is for an iOS simulator, not an iPhone. SDK 56 Expo Go is not available in the App Store according to Expo's release notes, and stock Expo Go would not supply this app's custom HealthKit module anyway.

## Getting full membership without paying personally

- An accredited school, eligible nonprofit, or government organization can apply for Apple's fee waiver and add you to its development team. This is an organization waiver, not an automatic individual student discount.
- Swift Student Challenge winners receive a one-year membership. Winning is required, so this is not an immediate guaranteed solution.

## Verification and remaining work

Passed: TypeScript check; SDK dependency compatibility check; nine regression tests; generated entitlement inspection showing HealthKit and no APNs; web and iOS JavaScript bundling. Browser verification covered manual onboarding, dashboard, Fitness, Analytics, Settings, profile saving, persisted profile after reload, and a working cancelable confirmation dialog.

Not verified: native Xcode compile/IPA, device signing, actual HealthKit/Health Connect reads, real notification delivery, camera scanning, GPS tracking, Google OAuth and Gemini responses. Those need the corresponding hardware/accounts or macOS build run.

Remaining product risks: daily medication status rollover and daily log date boundaries need a dedicated audit; Android/cloud aggregation and data provenance need further work; experimental stability scores, drug-interaction rules, triage, vaccine schedules, and allergen recommendations are not clinically validated. Native saved records are encrypted; browser preview storage is not app-encrypted. A public EXPO_PUBLIC API key is bundled into clients, so a shared production key requires a server-side design. Cloud document extraction sends the original photo to Google; output redaction is not upload redaction. The current app should not yet be described as a reliable replacement for all health apps.

## Sources

- Apple capability table: https://developer.apple.com/help/account/reference/supported-capabilities-ios/
- Free-account limits: https://developer.apple.com/help/account/basics/about-your-developer-account
- School/nonprofit fee waivers: https://developer.apple.com/help/account/membership/fee-waivers
- Swift Student Challenge: https://developer.apple.com/swift-student-challenge/
- Expo SDK 56: https://expo.dev/changelog/sdk-56
- Sideloadly: https://sideloadly.io/faq
- AltStore Windows: https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows
- Gemini lifecycle: https://ai.google.dev/gemini-api/docs/deprecations

## September 13: native AI repair

SafeScaleVision now has an Apple module configuration and CocoaPods specification; Expo autolinking resolves the Swift module. Image classification accepts local files only and reads orientation metadata through Vision's URL handler.

The fixed-response chat stub has been replaced with FoundationModels LanguageModelSession generation. Runtime availability is checked on iOS 26+; unavailable devices and model errors use the existing local rules without an automatic cloud request. The model receives instructions to preserve unknown data and avoid diagnoses or medication changes. See Apple's API: https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel

Nutrition context now distinguishes missing nutrients (null) from recorded zero, counts the meals contributing each nutrient, and excludes undated legacy meals from today's totals. Local chat and its data inspector label unknowns explicitly.

Validation: 72 tests passed, TypeScript passed, web/iOS JavaScript exports passed, and Expo Apple autolinking includes SafeScaleVision. Swift compilation and real inference have NOT been verified on Windows. Rebuild the unsigned IPA using the existing macOS/Xcode workflow and re-sign/install it; an older IPA cannot gain a native module through JavaScript changes. On a supported phone, enable Apple Intelligence and allow the model to download. Verify two different prompts yield relevant different answers, unavailable-model fallback works, and rotated camera/library photos classify correctly. No signing credentials or provisioning settings were changed.

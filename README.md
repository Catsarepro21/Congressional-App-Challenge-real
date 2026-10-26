# Healthfolio

Healthfolio brings medication routines, health observations, activity, and appointment records together in one app. Built for the Congressional App Challenge with TypeScript, React Native, Expo, and a custom Swift module.

## Download the iPhone prototype

**[Download the latest verified unsigned IPA](https://github.com/Catsarepro21/Congressional-App-Challenge-real/releases/download/ios-build-40047939768-1/SafeScaleHealth-unsigned.ipa)**

[Release notes and assets](https://github.com/Catsarepro21/Congressional-App-Challenge-real/releases/tag/ios-build-40047939768-1) · [Exact source used for this IPA](https://github.com/Catsarepro21/Congressional-App-Challenge-real/tree/77be5a99ff376bc49122d3328872dea68dbf9a13) · [Successful native build](https://github.com/Catsarepro21/Congressional-App-Challenge-real/actions/runs/40047939768)

Version 1.0.0, build 108, compiled October 23, 2026. The app displays as **Healthfolio**; the older SafeScale filename and bundle identifier are retained for continuity.

### Signing and feature limitations

This IPA is **unsigned**. It cannot launch through a normal iPhone installation until it is signed with a valid certificate and provisioning profile for the device. It is a prototype download, not an App Store or TestFlight installation.

- **Apple Health / HealthKit:** requires signing and provisioning that include the HealthKit entitlement, plus the user's permission. Re-signing that removes or cannot provision that entitlement will prevent the integration from working.
- **Apple on-device AI:** requires a supported device, compatible iOS, Apple Intelligence enabled, and the model downloaded and available. Otherwise, the assistant uses clearly labeled local rules.
- **Camera, photo library, motion, location, and reminders:** require the corresponding device support and permissions. Their behavior is not established by a browser preview.
- **Optional Google Health / Fitbit import:** also depends on Google OAuth project/account access and a working callback configuration. Signing alone does not guarantee it works.
- **Cloud AI uploads are disabled** in the current source. This is intentional.

A successful native build does not establish that every feature works on a particular signed device. Healthfolio organizes wellness information; it does not diagnose conditions or replace professional care.

Apple references: [running an app on a device](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html), [configuring HealthKit access](https://developer.apple.com/documentation/Xcode/configuring-healthkit-access).

### Verify the download

File size: **11,339,045 bytes**.

SHA-256:

```text
ef445b69f0c76ae1927af2388905528ad1c3010bf77422ab58720cba8f409df1
```

This repository and its assets are currently private. People without repository access cannot open these downloads or source links.

## What the app includes

- Medication schedules, daily taken/undo controls, remaining stock, and reminders.
- A journal for symptoms, mood, and visit questions.
- A connected timeline and a reviewable visit-summary export.
- Saved records, photo attachments, Medical ID, allergies, and emergency contacts.
- Activity tracking and optional device-health imports.
- An on-device assistant with labeled local-rule fallback.
- An isolated competition demo using fictional records.

## Privacy and storage

Native records and photo chunks are encrypted using a device secure-storage key. Browser records use a passphrase-derived encrypted vault; the passphrase is not stored. Current source blocks cloud AI and unrelated external services. Optional Google Health / Fitbit sign-in permits bounded token exchange and read-only imports; it does not upload journal entries, medical records, photos, or chats.

Manual exports are unencrypted copies outside the vault. Apple Health, original photos, OS backups, and other applications have their own storage behavior. See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for implementation details and remaining acceptance checks. That file and [APP_AUDIT.md](APP_AUDIT.md) contain dated historical findings; read later updates before treating an earlier statement as current.

## Run from source

Use Node.js 22.13 or newer:

```sh
npm ci
npm run web
```

For an isolated browser walkthrough, choose a new local vault passphrase, finish onboarding without personal details, then select **Profile → Enter Competition Demo**. Use fictional data for recordings and reviews.

The browser preview does not provide native HealthKit, native camera behavior, or Apple Foundation Models. A custom native build is required for those features; stock Expo Go does not include this project's custom modules.

To build for iPhone, use the repository's **Build iOS IPA (Unsigned)** GitHub Actions workflow. For a local native build, use a compatible Mac/Xcode toolchain, generate the iOS project with Expo, and open `ios/Healthfolio.xcworkspace`. Configure your own signing team and HealthKit capability in Xcode; keep signing certificates and provisioning profiles out of Git.

## Verification on October 26, 2026

- TypeScript check passed.
- **143 automated tests passed**, with no failures or skipped tests.
- Tracked-file/common-credential checks passed.
- The published IPA matches the recorded build checksum, its ZIP integrity check passes, and it contains the bundled JavaScript and Healthfolio metadata. It contains no embedded provisioning profile or resource-signature directory.
- The native iOS workflow for source commit `77be5a9` completed successfully.
- A fresh production-dependency audit reported **0 critical and 5 high package flags**, inherited through Expo tooling's `node-forge` and `zod` dependencies. These remain unresolved in this prototype; this is not a zero-vulnerability release. An incompatible Expo downgrade was not applied.

Run the repeatable source checks with:

```sh
npm run check:secrets
npm run typecheck
npm test
```

Signing, installation, live HealthKit access, native AI responses, notification delivery, and actual Google sign-in still require acceptance testing on the intended device. No new physical-device verification is claimed by this repository review.

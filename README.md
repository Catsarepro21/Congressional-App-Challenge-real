# Healthfolio

A health organizer for medications, symptoms, activity, medical records, and appointment summaries. Built with React Native, Expo, TypeScript, and Swift.

## Web preview

**[Open Healthfolio in your browser](https://healthfolio-demo.vercel.app/)**

Complete the regular setup, then try logging a dose, adding a journal entry, or preparing a visit summary. Use fictional details only. Entries stay in the current tab and reset when you reload. For a ready-made fictional profile, choose **Profile → Enter Competition Demo**. Exit Competition Demo to return to your own entries for the session.

Healthfolio was designed for iOS. Some features are unavailable in the browser, including health device sync, camera scanning, photo attachments, workout sensors, and reminders. The browser assistant uses built-in rules. The preview is for demonstration only and does not provide medical advice.

![Healthfolio's Today screen after browser setup](docs/healthfolio-demo.webp)

**[Download the unsigned IPA](https://github.com/Catsarepro21/Congressional-App-Challenge-real/releases/download/ios-build-40424644493-1/SafeScaleHealth-unsigned.ipa)** · [Release notes](https://github.com/Catsarepro21/Congressional-App-Challenge-real/releases/tag/v1.0.0) · [IPA source](https://github.com/Catsarepro21/Congressional-App-Challenge-real/tree/e57d05a19ca7688477eacf1680de1a2fe26a4e57)

## Installation

- The IPA must be signed before it can install and run on an iPhone.
- Apple Health requires HealthKit-enabled signing and permission.
- On-device AI requires compatible hardware and Apple Intelligence; otherwise, local rules are used.
- Camera, location, reminders, and Google Health depend on their permissions and account setup.

Build 109 includes the cleanup and storage-recovery fixes.

## Development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run web:preview
```

To build and preview the same production web bundle that Vercel serves:

```sh
npm run build:web
npx expo serve --port 4173
```

Open http://localhost:4173. For Vercel, import the repository at its root in a Hobby workspace. The checked-in configuration runs `npm ci` and `npm run build:web`, then publishes `dist/`. No environment variables or external services are required.

`npm run web` starts the local web app with its encrypted browser vault. Native features require a custom build. Use the **Build iOS IPA (Unsigned)** GitHub workflow, or generate the iOS project on a compatible Mac and open `ios/Healthfolio.xcworkspace`.


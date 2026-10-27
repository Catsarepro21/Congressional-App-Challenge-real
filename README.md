# Healthfolio

A health organizer for medications, symptoms, activity, medical records, and appointment summaries. Built with React Native, Expo, TypeScript, and Swift.

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
npm run web
```

For a fictional walkthrough: finish onboarding, then select **Profile → Enter Competition Demo**. Native features require a custom build. Use the **Build iOS IPA (Unsigned)** GitHub workflow, or generate the iOS project on a compatible Mac and open `ios/Healthfolio.xcworkspace`.


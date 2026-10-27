# Healthfolio

A health organizer for medications, symptoms, activity, medical records, and appointment summaries. Built with React Native, Expo, TypeScript, and Swift.

**[Download the unsigned IPA](https://github.com/Catsarepro21/Congressional-App-Challenge-real/releases/download/v1.0.0/Healthfolio-unsigned-77be5a9.ipa)** · [Release notes](https://github.com/Catsarepro21/Congressional-App-Challenge-real/releases/tag/v1.0.0) · [IPA source](https://github.com/Catsarepro21/Congressional-App-Challenge-real/tree/77be5a99ff376bc49122d3328872dea68dbf9a13)

## Installation

- The IPA must be signed before it can install and run on an iPhone.
- Apple Health requires HealthKit-enabled signing and permission.
- On-device AI requires compatible hardware and Apple Intelligence; otherwise, local rules are used.
- Camera, location, reminders, and Google Health depend on their permissions and account setup.

The downloadable IPA is build 108 from October 23. Later cleanup and recovery fixes in this branch are not included in that binary. The release's automatic source ZIP uses an older tag; use the **IPA source** link above.

## Development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run web
```

For a fictional walkthrough: finish onboarding, then select **Profile → Enter Competition Demo**. Native features require a custom build. Use the **Build iOS IPA (Unsigned)** GitHub workflow, or generate the iOS project on a compatible Mac and open `ios/Healthfolio.xcworkspace`.


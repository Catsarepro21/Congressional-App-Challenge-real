# SafeScale local-only security audit

Reviewed October 23, 2026 against the current working tree. User requirement: encrypted health records, no external health-data uploads, and functioning local AI. Intended device reported by the user: iPhone 16, iOS 27.2.

**Later October 23 scope update:** The user explicitly requested restoration of Google Health / Fitbit import on iOS. This supersedes the blanket network/sign-in ban in the earlier review below. A separate allowlisted transport now permits Google OAuth token exchange and read-only Google Health/People requests. No journal/photo/chat/medical-record upload endpoint is enabled. New consent is required; legacy tokens cannot silently reconnect. Google tokens stay in the encrypted native vault and are excluded from browser persistence and exports. Disconnect/deletion cancels in-progress imports. OAuth project permissions, test-user configuration and actual account access must still be verified by signing in on the device.

The supplied device video also confirmed a barcode permission button beneath a touch-intercepting reticle and overly restrictive native model instructions. The reticle now ignores touches, permanent denial opens Settings, permissions refresh on resume, image-picker privacy strings are explicitly configured, and ordinary non-clinical wellness suggestions are allowed while personal claims remain grounded in records. These are source/runtime-handler fixes; automated checks do not prove camera hardware or live model quality.

## Result

The source has been hardened for local processing and encrypted record storage. The automated checks and browser onboarding pass. This is not a security certification or proof of an installed native build: no Swift compilation, signed IPA installation, native encryption read/write trial, or actual Foundation Models inference was possible on this Windows host.

Existing IPA files were not rebuilt, re-signed, uploaded, or installed. Existing personal records were not deleted. Application source and tests changed; no remote repository push or deployment was performed.

## Findings and fixes

| Finding | Impact before this review | Change |
|---|---|---|
| Browser health records persisted as plaintext | Anyone with access to browser storage could read saved records | Passphrase-derived AES-256-GCM vault, PBKDF2-SHA-256 with 600,000 iterations and random 16-byte salt, fresh 12-byte IV and 128-bit authentication tag per write. Key is non-extractable and held in memory; passphrase/key are not persisted. Legacy JSON waits for passphrase setup before encryption. |
| Cloud functionality remained enabled by consent or prior preferences | Medical context, conversation, reports, or photos could leave the device after approval | Every application fetch site imports a deny transport that never calls global fetch. The consent compatibility gateway always denies cloud execution. No approval or stored setting can enable uploads. |
| Failed local photo identification could fall back to Gemini | A supposedly local workflow could offer cloud processing | Removed that fallback. Cloud photo entry points reject; local failure remains a visible failure/manual-entry path. |
| External Google account connections and automatic refresh remained reachable | Network sign-in, token refresh, and external health queries were possible | Removed Google connection choices and callback configuration, blocked authorization entry points, restricted sync coordinator to local Apple Health/Android Health Connect, and strip legacy tokens/cloud preferences during storage hydration and saving. |
| Remote image URIs could trigger requests outside fetch | A stored image URL could contact a remote server | Render only allowed local file/content/blob or raster image data URIs. Remote URLs and SVG data URLs are rejected. |
| Photo attachments were file references outside the record vault | Encrypting the JSON did not encrypt those referenced photo bytes | New picker photos become inline image bytes and are saved inside the encrypted records. Supported legacy local image attachments are inlined during read/save; missing attachments are marked missing without deleting the surrounding health record. Only app-cache copies are candidates for cleanup; original library files are preserved. |
| Attachment preparation could reorder asynchronous saves | A slower older save could overwrite a newer record or finish after deletion | Serialize preparation and persistence together; deletion waits for in-flight writes. Regression test exercises both cases. |
| Notification previews contained medication names/doses and vaccine details | Sensitive details appeared outside the app on notification surfaces | Use generic reminder text and omit medication names from notification payloads. Previously scheduled OS notifications need replacement/device verification. |
| Android automatic backup was enabled | Device backup/transfer could include app storage | Disable Android backup in config and checked-in manifest. Add a release manifest/config plugin removing INTERNET permission; debug keeps local Metro development access. Android native build/merged manifest remain unverified. |
| Onboarding text contradicted the storage implementation | Users were told records were not encrypted | Update disclosures, remove cloud controls, label explicit exports as unencrypted copies. Cover the native React view when inactive; OS snapshot timing needs device validation. |

## Native encryption

The existing native implementation uses Expo Crypto AES-GCM with a generated 256-bit key. Key material is stored in Expo SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Records use the `safescale-aes-v1:` envelope. Authentication failures block hydration and replacement instead of opening defaults over unreadable saved data. Legacy plaintext JSON is encrypted before it is returned to the app.

The filesystem contains ciphertext, but a running unlocked app necessarily has decrypted records in memory. This change does not protect a rooted/jailbroken/compromised device or a malicious browser extension. No custom home-grown cipher was introduced.

Browser vault test credentials used only for the isolated localhost:8084 review: `Synthetic demo vault 2026!`. Do not use that public test passphrase for personal records. Browser testing used no personal profile or health data. Passphrase recovery is intentionally unavailable. Reloading/closing the tab discards the in-memory key; the encrypted records remain.

## Local AI

The Swift bridge explicitly creates `LanguageModelSession(model: SystemLanguageModel.default, ...)`, checks runtime availability, and uses the on-device Apple model. There is no Private Cloud Compute or third-party model selection in this bridge. Image identification uses Apple Vision on local file bytes or an inline local image; it does not download images.

The TypeScript chat path calls that bridge when On-Device AI is selected. Availability checks and generation have deadlines. If unsupported, not ready, disabled, or errored, the app returns a reply labeled **SafeScale local rules**. This fallback is deterministic and should not be presented as generative AI. Local image classification failure offers manual entry/search rather than upload.

Profile → **Test on-device text model** asks the real bridge a question about a fictional apple-for-breakfast record. It requires a nonempty reply with `isLocal: true` and provider `apple-foundation`. It does not pass personal records. This test is available independently of the ordinary ingredient benchmark, which only exercises a local dictionary.

User-reported hardware/software is a target, not proof of availability. Apple Intelligence must be enabled and its model downloaded. The native module must be compiled into the installed app; older IPA files cannot acquire it from JavaScript changes.

## Verification

- TypeScript passed.
- All **115 automated tests passed**, including real Web Crypto passphrase authentication, fresh-IV ciphertext, tampering rejection, legacy migration, transport denial, stale approval rejection, local model routing with a mocked bridge, photo inlining, notification redaction, save ordering, and deletion ordering.
- Targeted credential/file checks passed. They are not a complete secret/history audit.
- Web and iOS JavaScript/Hermes exports passed. The first sandboxed iOS export failed to write its temporary Hermes output; the permitted rerun outside the filesystem restriction passed. A JavaScript export does not compile Swift.
- Expo Apple autolinking resolves `safescale-vision`, `SafeScaleVisionModule`, and its podspec.
- Browser verified: encrypted vault creation, entry into onboarding, local-only provider choices, updated encryption disclosure, and main app after onboarding. A reload verification was interrupted when another extension UI blocked browser automation; relocking and passphrase reload behavior are covered by core tests, not a completed browser reload trial.
- After explicit user approval, the live npm production-dependency audit completed. Initially it reported **7 flagged packages: 1 critical and 6 high**. Installed compatible overrides for `shell-quote` 1.11.0, `compression` 1.8.2, and `source-map-js` 1.2.2 and updated the lockfile without running dependency install scripts. The follow-up audit reports **0 critical, 4 high**. Those remaining package flags (`node-forge`, `@expo/code-signing-certificates`, `@expo/cli`, `expo`) derive from the same unpatched `node-forge` RSA signature-verification issue, GHSA-86w9-cpqp-85rv. Local dependency inspection traces them through Expo CLI/signing tooling. This finding remains unresolved; it is not proof of health-data exfiltration from the phone app. npm's suggested Expo 44 downgrade was not applied to this SDK 56 app.
- Following the dependency patches, all 115 tests, TypeScript, and fresh web/iOS JavaScript/Hermes exports passed again. The final configuration still requires native compilation and device validation.
- Git history shows `.env` was tracked in June and removed in September. The inspected initial committed version did not contain a recognizable Google API-key pattern. Current signing certificates, provisioning profiles, IPAs, and `.env` are ignored rather than tracked. This does not prove no historical credential was ever exposed; rotate any key known to have been publicly shared.

## Boundaries that remain

1. **Manual export/share is still possible when the user selects it.** These are unencrypted copies outside the vault, not automatic uploads. The app now states this explicitly. A claim that health data can never leave under any circumstances would be inaccurate while export/share exists.
2. **Apple Health, photo-library originals, and OS backup/iCloud settings are separate.** SafeScale cannot guarantee what the operating system or other authorized apps do with their copies. The app's new external-service deny policy applies to its own service calls. OS-retained cache copies are cleaned up only where safe and accessible; cleanup failure does not erase the encrypted health record. No secure-erasure claim is made.
3. **Browser delivery and development tooling need a network origin.** The preview still fetches its own local code/assets and uses Metro development tooling. This is distinct from health-data service uploads. Use a bundled release build for the offline device test.
4. **Native and Android claims need compiled/device evidence.** SecureStore, camera/cache cleanup, HealthKit permissions, OS notifications, inactive-view snapshot protection, the Android merged release manifest, and Apple model inference remain device acceptance items.
5. **An unpatched dependency issue remains.** The live audit completed with 4 high package flags inherited from one `node-forge` issue in Expo tooling, and no critical findings. This is not a zero-vulnerability dependency set; await a compatible upstream fix or separately evaluate an SDK/toolchain migration. September's audit result is historical.

## iPhone acceptance before recording

1. Build the current native source using the existing macOS workflow or Xcode, sign, and install it. Preserve the current app's records; do not uninstall merely to recreate onboarding.
2. Enable Apple Intelligence and finish the model download while online. Open Profile → select On-Device AI.
3. Run **Test on-device text model**. It must return an actual model response; an unavailable/error message or dictionary benchmark is not proof.
4. Enable airplane mode and turn Wi-Fi off explicitly. Ask two different questions and confirm relevant replies labeled Apple on-device, not SafeScale local rules. If model guardrails decline a health question, verify the fictional test independently; never silently route it to a cloud model.
5. Save a fictional record and meal photo, force-quit, reopen, and confirm they survive through encrypted storage. Inspect the app-container data if available: the main record store should contain the encrypted envelope and no readable fixture text. Verify photo cleanup only within app cache, preserving originals.
6. Exercise Apple Health permission/read locally. Receiving permission alone does not prove data was read. Confirm a known sample appears and no cloud sign-in flow exists.
7. Replace old scheduled reminders and inspect their lock-screen previews. Check app switching/locking does not expose the current record in the preview.
8. With a network inspection tool, confirm no external app-service requests occur while using the representative flows. This network trace has not been captured in this review.

## October 23 follow-up to independent review

- Native photos are inlined only in application memory. On disk, photos use random opaque references and separately encrypted 128 KiB chunks; the main encrypted record contains references. Unchanged photos are not encrypted again for ordinary health updates. New allocations are journaled before writing, old chunks are collected after the record commit, and explicit deletion enumerates only this app's photo namespace, including interrupted-save orphans.
- Attachments are bounded to 14 million encoded characters each and 20 million across the current record; non-photo record JSON is bounded to 768 KiB before encryption. A save failure preserves the committed record and displays a retry notice while keeping editing available. This is bounded prototype storage, not unlimited photo archiving.
- Cache copies are cleaned after successful encrypted persistence. Picker base64 is requested only on web; iOS `/private/var` cache aliases and WebP/HEIF MIME types are handled. Oversized/unreadable legacy file attachments are marked missing without discarding the rest of the record. Originals outside app cache are never deleted.
- Browser corruption now rejects hydration rather than leaving it pending. Explicit deletion cancels pending unlocks, suppresses reset-state persistence, removes photo chunks and records, drops the browser key, and requires creation of a new vault. Recovery screens offer a separate, explicit destructive reset confirmation.
- Export filtering now excludes `photoUri` and `documentImage` at every nesting level, matching the existing disclosure. Exports remain deliberately unencrypted and initiated by the user.
- Relative image paths are denied. Dead Gemini photo/text request implementations and chat escalation controls were removed; legacy text entry points remain local. Cloud feature defaults are false.
- Native Vision validates regular-file status and compressed byte size, then downsamples to at most 2048 pixels per edge before classification. Local text input/history and output lengths are bounded. Input character limits are not an exact model tokenizer; an unavailable/over-capacity model still falls back to the clearly labeled local rules.
- Follow-up tests use synthetic records and real AES-GCM/Web Crypto to check large photos, small encrypted rows, save failures, unchanged-photo reuse, restart hydration, cleanup ordering, missing attachments, browser reset/rekey, pending-unlock deletion, relative image denial, and photo-free export. Physical-device cache inspection and native inference remain separate acceptance checks. The previously signed `de71ce8` IPA predates these fixes.

## References checked

- [Expo Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/) — AES API, key sizes, sealed-data handling. Local installed SDK 56 source/types were also inspected.
- [Apple Foundation Models](https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models) — on-device generation and availability checks.
- [Unpatched node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
- [shell-quote fix](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), [compression fix](https://github.com/advisories/GHSA-vc2v-76pw-4v95), [source-map-js fix](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

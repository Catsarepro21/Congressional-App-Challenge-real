# SafeScale Health audit

## Focused reliability follow-up — September 16, 2026

- Workout location and motion permission checks now share a queue across recording restarts. Existing grants and permanent denials do not open new prompts, cancelled setup skips queued prompts, and an OS failure does not block later permission checks.
- Delayed cumulative step events cannot reduce the workout's saved step count. Cleanup ignores late callbacks and immediately removes GPS subscriptions that finish starting after recording stops.
- Sample-mode transitions clear obsolete sync flags. A request started before a mode change or data deletion cannot clear the busy flag for a newer sync. Two regression tests cover discarded completions and ensure concurrent syncs stay blocked.
- Five sensor regression tests exercise production permission and hook code with mocked native APIs. All **104 tests**, TypeScript, targeted secret checks, and web/iOS JavaScript exports pass. Real permission dialogs and movement still require native device verification; these checks do not compile Swift or validate HealthKit.


## Follow-up implementation — September 15, 2026

- Dependency overrides align all Metro copies on 0.84.5, the old Expo XML parser on 0.8.15, and xcode's UUID dependency on CommonJS-compatible 11.1.1. npm install/audit reports **0 known vulnerabilities**. Build exports and Expo config introspection pass with this resolved lockfile.
- Profile offers a JSON health-record export excluding credentials and a typed-confirmation local deletion flow. Deletion cancels app notifications, removes the saved state, attempts to remove its device key, resets profile/chat/workouts, and invalidates outstanding sync completions. External HealthKit/Google records, photos, source attachments, and exported copies remain outside local deletion. No user records were deleted during UI verification.
- Reading snapshots retain source/import metadata and Apple Health sample times where provided. Today's totals roll over at midnight; old samples remain labeled as saved readings. Live zones require a sample no older than five minutes. Missing provider sample times stay unknown. Android no longer substitutes minimum heart rate for resting heart rate, and overlapping Android sleep intervals are merged.
- Optional GPS and pedometer subscriptions live at the app root and survive tab navigation. Users explicitly enable recording and grant permissions. This implements **foreground recording**; background/screen-lock sensor collection is not implemented. The timer continues, gaps add no inferred route distance, and the UI states the limitation. Routes retain the latest 10,000 points; accumulated distance remains separate. See [Expo pedometer behavior](https://docs.expo.dev/versions/v54.0.0/sdk/pedometer/).
- New immutable workouts use the native HealthKit sync identifier/version metadata with stable local IDs. Retry is exposed only for records created with this mechanism; legacy uncertain saves cannot be safely retried automatically. Requests stop waiting after 15 seconds, and in-flight retries are deduplicated. Native verification remains required. See [Apple sync metadata](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier).
- iOS cloud consent uses a native alert over the presenting sheet; stale request IDs cannot authorize another upload. Android/web retain the custom dialog.
- Copied workout/device-parser tests now execute production functions. New tests cover export redaction, deletion while syncing, midnight rollover, stale readings, GPS outliers/gaps, and retry identity. The legacy workout path also no longer increments imported telemetry, and manual workout/strength fields reject invalid values instead of inventing defaults.

Validation to date: **97/97 tests**, TypeScript, targeted secret checks, web/iOS JavaScript exports, and Expo config introspection pass. The web UI opens and exposes export and typed-delete controls; the destructive button is disabled without confirmation. Native Swift compilation/build status is recorded separately below when available.

Still requires external acceptance: rotate the previously exposed Gemini key; sign/install the new native IPA; verify migration/relaunch, camera and Foundation Models, sensor permissions and actual movement, and repeat HealthKit saves on the phone. Native API calls cannot be validated from the Windows web preview. Full background GPS, recovery-model clinical validation, and complete historic sample timestamps from providers are outside this implemented foreground feature.


## Remediation update — September 14, 2026

The numbered findings below preserve the original audit evidence and line references, which may now be outdated. The following changes supersede their original status.

- Native saved state now uses authenticated AES-GCM encryption with a device SecureStore key. Legacy JSON migrates only after successful encryption. Failed reads block replacement; failed writes show a retry screen. Web health records remain ordinary browser storage, while API/OAuth credentials are stripped from persistence.
- The tracked `.env` is removed from the current tree, public Gemini-key fallbacks are removed, and Profile has a masked user-key form. The old key remains in Git history and MUST be revoked/rotated by its owner. A targeted credential-file/key-pattern check runs in CI; it is not comprehensive secret scanning. The existing Android debug signing fixture is exempt only by its exact hash; release Android signing still needs a private release key.
- Chat preserves bounded session history across navigation, passes recent context to model requests, supports cancel/retry/clear, respects model opt-out, and cancels pending consent on abort. Network deadlines include response parsing. Stopping a native request stops waiting; it does not cancel Apple's underlying inference task.
- Native model availability is queried from the bridge and distinguishes image Vision from text generation. Filename-based image guesses are removed. Ingredient checks are explicitly deterministic, share allergen aliases, and no longer certify unknown ingredients or recommend unchecked substitutes.
- Local workouts no longer increment imported activity totals. Each record shows pending/saved/not-confirmed HealthKit status; saves time out, and sample mode does not write workouts to HealthKit. Deleting a local record does not delete an external HealthKit copy. Interrupted pending saves need reconciliation; automatic retries are intentionally absent until duplicate-safe native identifiers are implemented.
- Imported vital context is labeled latest saved data with import time, not today's measurements. Individual sample freshness and daily rollover remain incomplete.
- CI installs the lockfile, and the Git-based HealthKit package is pinned to a commit. Compatible audit fixes reduced the reported dependency entries to 18 (13 moderate, 5 high). Remaining image-size/Metro, XML/plist, and uuid/xcode chains need upstream-compatible remediation; no forced downgrade was applied.
- Earlier fixes in `ae62f6a` address false health defaults, fasting certainty, barcode portions and unknown nutrients, request-bound consent, manual vitals validation, vaccine dates, and workout elapsed-time restoration.

Validation: 91 automated tests pass; TypeScript passes; web and iOS JavaScript exports pass with environment loading disabled; targeted secret check passes. The exported web build was opened and an offline chat response and Profile privacy controls were verified. No real patient data was uploaded for validation.

Native acceptance remains required: rebuild/install the IPA, verify legacy storage migration and relaunch, locked-device retry, Foundation Models availability/generation, real camera Vision, nested consent-sheet presentation, HealthKit save outcomes, and background/resume behavior. JavaScript export does not compile Swift or prove these device flows. The new secure-storage dependency requires a native rebuild, not just a JavaScript update. Preserve the existing installation and records while testing migration.

Still open: per-reading timestamps/stale-data handling, complete privacy export/delete controls, duplicate-safe workout reconciliation, real GPS/step capture, some copied-logic tests, remaining dependency advisories, and on-device acceptance. This update is not a claim that all defects are fixed.

## Original audit

Reviewed September 13–14, 2026 against working tree based on `da6b4de`. Includes the pending native chat, vision registration, and nutrition fixes from the preceding task. This is an audit, not a claim that every possible defect has been found. No application fixes or credential changes were made during this audit.

## Verification performed

- Current automated suite: **72/72 pass**. TypeScript check: **passes**.
- Browser walkthrough: Today, Activity, an active workout, Journal, vitals form, Records, and Profile. The temporary audit workout was discarded without saving it.
- Synthetic probes execute actual TypeScript services with mocked dependencies/network. Confirmed barcode portion errors, missing nutrient defaults, consent fail-open behavior, a consent callback race, filename-based vision results, decimal BP misclassification, allergen matching failures, and vaccine date conversion. Local reproduction: `node dist-preview/audit-repro.cjs`. This diagnostic file is in an ignored preview directory and may be removed by a future export.
- Live npm advisory check: **20 affected package entries: 7 high, 13 moderate, 0 critical**. This counts dependency entries, including propagated findings, not 20 independent exploitable app vulnerabilities.
- Secret check inspected only presence/tracking; no secret values are included here. No personal health data or photos were uploaded for this audit.
- Not verified here: a fresh Xcode build, physical iPhone/Android behavior, HealthKit write acceptance/ring credit, real camera recognition quality, Apple model responses, background execution, or notification delivery. The Windows web preview cannot establish those.

## Must fix before wider use

### 1. Committed Gemini credential — P1, confirmed

`.env` is tracked in HEAD and contains a nonempty `EXPO_PUBLIC_GEMINI_API_KEY`; the `.env` ignore rule is commented out in `.gitignore`. Code also reads that public variable. This exposes a credential to anyone with repository access; builds that load the variable can expose it to app recipients. CI currently disables dotenv, which does not remove the credential from Git.

**Fix:** revoke/rotate the exposed credential, remove it from tracking, add secret scanning, and select a supported credential architecture. A shared developer key belongs behind an authenticated, rate-limited backend. User-supplied keys need secure local storage and an actual settings form. History cleanup does not replace revocation. Expo explicitly documents that public environment values are visible in compiled apps. [Expo documentation](https://docs.expo.dev/guides/environment-variables/)

### 2. Credentials and health records use unencrypted application storage — P1, confirmed

`src/store/useSafeScaleStore.ts:1587` persists the profile wholesale at line 1611, including `geminiApiKey` and `healthConnections` access/refresh tokens, alongside health records. This is not evidence that other ordinary sandboxed apps can read them; it is an unnecessary exposure in storage, backups, and a compromised app environment.

**Fix:** move tokens/keys to Keychain/Keystore-backed storage, exclude them from Zustand persistence, migrate and delete old copies, and define encrypted health-record storage and backup policy. AsyncStorage provides no encryption of its own. [Project documentation](https://react-native-async-storage.github.io/2.0/)

### 3. Allergen results can falsely declare food safe — P1, reproduced

`src/services/AllergenEngine.ts:103` uses substring matching. `['Milk']` with allergy `['Dairy']` returns no match. `src/components/care/BarcodeScannerModal.tsx:105` skips checks if ingredients are missing, but line 312 still displays **“Safe from your allergies”** whenever there are no warnings. The engine also returns static “Gluten Free,” “High Protein,” and “Low Sodium” tags for missing ingredients (`AllergenEngine.ts:155`); those tags are not inferred from food data.

**Fix:** distinguish unknown/not checked from no match; remove safety guarantees and invented tags; use a reviewed allergen alias/group dictionary, ingredient coverage, and explicit label verification. Test missing ingredients and names used in the Profile examples, including Dairy.

### 4. Activity invents HRV and heart-rate measurements — P1, seen in UI

`src/components/care/AutonomicCardioCard.tsx:10` substitutes 52 ms when HRV is missing. Line 46 labels ordinary `heartRate` as resting heart rate and substitutes 64 bpm. The empty profile visibly shows both values and “Optimal Recovery.” `src/screens/ActivityScreen.tsx:208` also substitutes 120 bpm to calculate Zone 2 even while displaying “-- bpm.”

**Fix:** show “Not recorded,” use the actual resting-heart-rate field, suppress zones and interpretation without fresh measurements, and include sample timestamp/source.

### 5. Fasting chat claims measured ketosis and autophagy from a timer — P1, source-confirmed

`src/services/LocalHealthChatEngine.ts:122` announces a metabolic stage and lines 125–129 make definite statements about ketosis, cellular renewal, glucose, and insulin. `HealthContextAggregator.ts:163` derives this exclusively from elapsed time. This contradicts the more careful wording already in `FastingService.ts:21`–24.

**Fix:** reuse the elapsed-time labels and limitations everywhere, including AI prompts and quick pills. Do not turn the legacy saved stage keys into physiological findings.

### 6. Workout time stops when leaving Activity — P1, seen in UI

`src/screens/ActivityScreen.tsx:88` increments elapsed seconds in a screen-owned interval. Leaving the tab unmounts the timer; returning prefers the old nonzero `durationSeconds`. In the walkthrough, time spent in Journal was omitted and the workout returned at 00:08. `useSafeScaleStore.ts:1397` then prefers that stale duration when finishing. Calories also derive from that incomplete duration.

**Fix:** derive duration from timestamps, accounting explicitly for pauses, outside screen lifecycle. Persist the active session and restore it after termination; active workout state is currently omitted from persistence. Verify tab switching, screen lock, resume, and app termination on device.

### 7. Barcode portions and missing nutrients are wrong — P1, reproduced

`src/services/BarcodeLookupService.ts:138`–169 selects each nutrient independently from serving or per-100g values but keeps the declared serving label. A synthetic product with a 30 g serving and 400 kcal/100 g returns **400 kcal for 30 g**, rather than 120. Missing sodium becomes zero and confidence is “high.” Partial records can mix serving and 100 g bases in one result.

**Fix:** normalize every nutrient to one explicit weight basis, scale only with validated serving weight, preserve unknown values, and distinguish database provenance from completeness/confidence.

### 8. Cloud consent fails open — P1, reproduced under guard failure

`CloudAIService.ts:103` catches errors loading the consent guard and runs the action anyway (lines 154, 204). The same pattern exists in `FoodVisionService.ts:180`–193 and `WeeklyReportService.ts:225`–244. A synthetic missing-guard probe performed the upload without consent. This is a failure-path defect, not evidence the guard fails on every normal launch.

**Fix:** statically import the guard and fail closed or use a local fallback if it is unavailable. Test import/init failure, denial, cancellation, and concurrency.

### 9. Vitals form can save invented or invalid readings — P1, UI/source-confirmed

`src/screens/JournalScreen.tsx:298` initializes BP to 120/80, immediately displays a classification, and permits saving without entering a measurement. Glucose and oxygen are converted to numbers without range/finite validation at lines 328–340; `useSafeScaleStore.ts:1147` accepts them unchanged.

**Fix:** start with blank fields; require at least one actual reading; validate each entered value and BP pair at both form and store boundaries. Preserve measurement time and units.

## Other confirmed defects and privacy gaps

### 10. On-device AI is disabled for every device — P2

`src/services/AIIntelligenceService.ts:58` unconditionally returns `isOnDeviceSupported: false`. `AIProviderSelector.tsx:66` uses it to disable the choice. The newly implemented native bridge is never consulted by this selector. **Fix:** independent runtime capability checks for image classification and language generation, with accurate platform-specific availability messages.

### 11. No reachable API-key setup despite instructions to use Profile — P2

`HealthChatScreen.tsx:113` and `FoodVisionService.ts:289` direct users to add a Gemini key in Profile. Profile has no key field, and the router in `App.tsx:103` does not expose Settings. A repository-wide search found readers/defaults but no current key-editing UI. **Fix:** provide secure configuration and a connection check, or remove the unsupported setup instructions. Fresh installations without an injected key cannot complete this setup.

### 12. Medical-document consent misrepresents redaction — P2, dormant service path

`CloudAIService.ts:197` says “PII auto-redacted,” but lines 61–72 encode the original image unchanged. The model prompt only requests redaction from the response. The original image therefore reaches Google when this service runs. Synthetic probing confirms unchanged bytes. The caller is in legacy `ScanScreen`, which is not currently routed by `App.tsx`; no live document upload was demonstrated.

**Fix before reconnecting this feature:** say that the original document is sent, preview the exact payload, or implement actual local redaction before upload. Also schema-validate extraction: `{}` currently becomes an active prescription with default text (`CloudAIService.ts:182`). Require user review before saving medical interpretations.

### 13. Barcode lookups bypass the advertised network-consent boundary — P2

`BarcodeLookupService.ts:122` contacts Open Food Facts on a local miss, without consulting the guard or AI preference. The active barcode modal calls it directly. The barcode and request metadata leave the device, not the full health profile. **Fix:** disclose and authorize online product lookup explicitly, with a local-only mode. Define whether the guard covers all networking or only AI; its current contract promises all outbound APIs.

### 14. Consent approvals are not bound to a request ID — P2, service-level reproduction

`CloudPermissionGuard.ts:47` rejects the old request and replaces it with a new one; `approveCurrentRequest` approves whichever resolver is now active. A callback captured while A was displayed can approve replacement B. `CloudPermissionModal.tsx:101` passes this unbound callback. **Fix:** approve/deny a specific immutable request ID and queue or reject concurrent requests. The service race was reproduced; a user clicking within the UI rerender timing window was not simulated.

### 15. Cloud chat sends more context than the sensitive-field list describes — P2

`LocalHealthChatEngine.ts:297` lists vitals, nutrition, and medication names. The actual context includes name, age, allergies, chronic conditions, medication dosage/time, sleep, and fasting (`HealthContextAggregator.ts:263`). **Fix:** preview and minimize the exact payload, including all sensitive categories. The permanent “Zero Cloud Data” header (`HealthChatScreen.tsx:150`) must change when cloud is used.

### 16. Native vision can infer food from a filename without opening it — P2, reproduced

`NativeVisionService.ts:113`–119 assigns 0.92 confidence to filename matches if native classification is unavailable/fails. A nonexistent `banana.jpg` returns banana labels. `classifyAndLookup` can label this “on-device” with high confidence. **Fix:** remove filename inference from production or label it as an unverified text suggestion requiring confirmation. A food class also cannot establish actual portion weight or hidden ingredients; ask the user to confirm both.

### 17. Vaccine reminders can be scheduled a day early — P2, reproduced

`NotificationService.ts:227` parses a date-only string as UTC and then sets local hours. In America/New_York, requested `2099-01-02` becomes local **2099-01-01 at 09:00**. **Fix:** parse calendar components in local time, set the desired hour first, then validate the final timestamp. Verify timezone changes and same-day scheduling. Probe validates construction, not OS notification delivery.

### 18. Old readings are presented as today's data — P2

`useSafeScaleStore.ts:435` rolls over medications, not biometric/ring snapshots. `HealthSyncService.ts:39` rejects an all-zero result and preserves earlier readings. `HealthContextAggregator.ts:269` labels the persisted snapshot “TODAY VITALS,” and searches historical BP/glucose/oxygen without a freshness cutoff. **Fix:** separate last-known values from today's aggregates, retain timestamps and availability per metric, and distinguish a measured zero from missing access/data.

### 19. BP classification mishandles decimals; HRV labels disagree — P2

`CardioDiagnosticsService.ts:41` uses closed integer ranges, while the form accepts decimals. The actual service classifies **139.5/79 as Normal**. Separately, HRV service thresholds are 35/65, the card uses 38/75, and its legend says 35/80. **Fix:** continuous ordered BP comparisons or validated integer input; one HRV presentation policy. Avoid definitive autonomic diagnoses from a single uncontextualized SDNN value.

### 20. HealthKit save failures are silently discarded — P2

`useSafeScaleStore.ts:1352` and 1434 ignore the boolean returned by `saveWorkoutToHealthKit`; rejected saves have no pending/error state or retry. The finish dialog promises syncing (`ActivityScreen.tsx:129`). **Fix:** track local save separately from HealthKit success, show failures, and retry with stable IDs to avoid duplicates. Actual HealthKit write behavior still requires device verification.

### 21. Deleting a workout leaves its added totals behind — P2

`addWorkout` and `finishLiveWorkout` increment local ring/calorie totals. `useSafeScaleStore.ts:1451` deletes only workout arrays. **Fix:** derive local totals from records, distinguish HealthKit totals from local estimates, and explain whether deletion affects an exported HealthKit workout. Do not subtract blindly from authoritative synced totals.

### 22. Chat escalation can send the assistant's answer as the question — P2

`HealthChatScreen.tsx:111` falls back to the last message's text when input is empty. After a normal exchange, that is the assistant reply. **Fix:** escalate the last user turn and explicitly display the question being sent.

### 23. Chat is not conversational across turns — P2

`LocalHealthChatEngine.sendMessage` receives only the newest question and health snapshot; native generation creates a fresh session and cloud requests contain one prompt. Prior messages exist only in screen state and disappear on navigation. **Fix:** send a bounded conversation history, support cancel/retry, and provide an explicit conversation retention/delete choice. Keep model context within limits and separate user data from system instructions.

### 24. Cloud chat/OCR can remain pending indefinitely — P2

`LocalHealthChatEngine.ts:313` and `CloudAIService.ts:84` have no app timeout or cancellation. The screen remains loading until the request settles; native generation also has no user cancellation. **Fix:** bounded requests, cancellation on user action, actionable error states, and careful retries. Food photo analysis already has a timeout; reuse that approach consistently.

### 25. Live recording does not collect a GPS route or steps — P2, source-confirmed gap

`startLiveWorkout` initializes distance and route to zero/empty. Its screen updates only duration/calories. A repository search found no location/pedometer subscription feeding tracking state. **Fix:** either implement permission-aware tracking with native background behavior, or explicitly describe the current feature as a timer with estimated calories. Do not market it as measured live route/step tracking.

### 26. Build ignores the audited lockfile — P2

`.github/workflows/build-ios.yml:53` removes `package-lock.json` before installing dependencies. `react-native-health` also follows Git `master` in `package.json`. Consequently a future IPA can use different code from the audited local install. **Fix:** pin the native dependency revision and use the lockfile with a reproducible install; make compatibility changes explicit and tested.

### 27. Dependency advisories need targeted remediation — P2, live registry result

The npm audit reports 7 high and 13 moderate affected dependency entries. Direct advisory-bearing packages include `@xmldom/xmldom`, `image-size`, `shell-quote`, and `uuid`; several parent packages inherit findings through Expo/Metro/config tooling. An exploitable production-mobile path was not established. Do not interpret “prod dependency” as necessarily shipped runtime code.

**Fix:** review the installed paths, update compatible patched transitive versions/upstream dependencies, then rerun bundling and native builds. Do not apply `npm audit fix --force` blindly: the suggested changes include downgrading Expo to 46.0.21 and Health Connect to 1.0.2.

### 28. Some passing tests verify copied logic, not application code — P2

`tests/workout.test.cjs:5` defines its own device-name parser; later tests similarly reproduce workout formulas. These can pass when the real implementation breaks. The suite also lacks coverage for the actual timer/tab lifecycle and the above consent failure cases. **Fix:** import production functions and add integration tests for the observed failures. Native Swift needs native build/device coverage, not just TypeScript checks.

## Improvements after the correctness fixes

1. **One honest data model:** every metric should carry value, unit, source, measured time, and whether it is measured, estimated, missing, or incomplete. Share that model across cards, exports, and AI.
2. **A smaller, clearer Today screen:** prioritize the next medication, a quick meal/check-in action, and recent reliable readings; keep detailed fasting/HRV interpretation optional.
3. **AI that explains its evidence:** cite the relevant saved reading/date in each answer, disclose the actual provider, respect the global disabled setting, and distinguish rules from model generation. Native chat currently attempts generation independently of the food-AI preference.
4. **A completed nutrition flow:** confirm identified food, portion, ingredients, and units; make nutrient values editable; distinguish photo estimates from label/database values; retain corrections for future suggestions.
5. **Privacy controls users can find:** secure credential setup, clear upload previews, notification privacy settings, export, and a complete delete-my-data operation that also clears credentials, attachments, and reminders. The reviewed Profile screen lacks a complete deletion control.
6. **Reliable reminders:** display whether scheduling succeeded, allow generic lock-screen wording instead of medication names/dosages, reconcile schedules after edits/imports, and support more than one daily dose without ambiguous duplicate entries.
7. **Accessible, consistent navigation:** restore useful legacy features deliberately or remove unreachable screens. Add labels to empty-label Profile fields/icon controls and verify VoiceOver, large text, keyboard navigation, and small phone layouts.
8. **A release checklist tied to real flows:** clean-install onboarding; denied permissions; unavailable model; offline/timeout; midnight/timezone changes; background/resume; denied HealthKit writes; empty/malformed food data; export/delete; and a signed physical-device smoke test.

Recommended order: credential exposure and consent → allergen/measurement truthfulness → recording, dates, and data freshness → AI setup/conversation → dependency/build reproducibility → UI polish and new features.

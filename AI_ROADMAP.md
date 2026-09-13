# SafeScale AI implementation roadmap

Reviewed September 13, 2026 against this workspace. This is an implementation plan, not a claim that these features are complete.

## What exists

- FoodVisionService sends meal photos to Gemini and requests estimated nutrients and ingredients. Cloud calls need a Gemini API key. The endpoint remains the repository's existing Gemini 2.5 Flash configuration; its successful use was not verified in this pass.
- CloudAIService includes ingredient-label and medical-document extraction. AIIntelligenceService routes ingredient analysis; LocalAIService is a static ingredient dictionary, not an on-device model.
- WeeklyReportService builds summaries locally and can request a cloud narrative. Scanner/analytics code is not all reachable from the current main navigation.
- Native Apple/Android inference methods are placeholders. OS version alone previously enabled an inaccurate capability claim. Capability reporting now says unavailable until a real bridge is implemented.

## Improvements delivered with the daily experience

Removed filename-based meal guesses and the generic 450-calorie fallback. Offline users can record a meal name and optional calories without a photo. Cloud photo analysis requires an explicit send action; failures remain failures. All returned nutrient fields must be finite and nonnegative, and ingredients/confidence must have the expected shape. Cloud requests have a 30-second network timeout. Closed dialogs ignore late results. No cloud AI request was made during validation.

These safeguards do not complete nutrition AI: results still need editable portions, better input/image handling, grounded nutrition data, and real model evaluations. Validation of response shape is not validation of factual accuracy.

## Phase 1: Finish nutrition end to end

1. Introduce a versioned analysis result with actual provider, model version, creation time, image type, per-food items, quantities, units, uncertainty, nutrient source identifiers, and user corrections. Save reviewed results separately from the original model proposal.
2. Normalize image orientation and resize/compress before sending. Handle JPEG, PNG, HEIC, native file URIs, and browser blob URIs explicitly. Reject unsupported/oversized files with a useful message. Support cancellation throughout reading, upload, and inference.
3. Use schema-constrained model output plus runtime validation. Handle blocked responses, truncation, 401/403, rate limits, timeouts, and offline conditions. Retry only transient failures, with backoff and an explicit retry limit. Never replace errors with invented food values.
4. Ask the model to propose food identities and approximate portions. Let users correct individual foods, grams/servings, preparation, sauces, and oil before saving. Treat photo-derived quantities as estimates; model self-reported confidence is not a calibrated probability.
5. Look up nutrients in USDA FoodData Central or a suitable packaged-food source. Calculate totals deterministically from the reviewed quantities, retain food IDs and source/version, and distinguish database matches from model-only estimates. Provide barcode and nutrition-label entry where feasible.
6. Keep allergen matching explicit: a recognized ingredient can trigger a warning, but a lack of detected allergens never establishes food safety. Hidden ingredients and cross-contact cannot be ruled out by a photograph. Review substitution suggestions against all recorded allergies.
7. For distribution, put a shared cloud API key behind an authenticated backend with rate limits, request size caps, cost controls, and redacted logs. Do not bundle shared keys in EXPO_PUBLIC variables. If retaining user-owned keys, use platform secure storage and explain the API account requirement.
8. Make provider consent consistent across meals, documents, and summaries. Never automatically move an on-device request to the cloud. Show exactly which image/text or aggregate fields will be sent and to whom.

Completion evidence: a labeled meal-photo evaluation set with weighed portions, nutrient error reported separately from food identification, tests for no-food/ambiguous images and invalid responses, native camera/library trials, browser image trials, cancellation tests, and a user-reviewed save that appears in the journal and timeline. Use fictional or explicitly approved material for cloud evaluation.

## Phase 2: Implement actual on-device AI

Build an Expo-compatible Swift native module, expose runtime availability checks from Apple's SystemLanguageModel, and distinguish unsupported device, disabled Apple Intelligence, unavailable model, and supported operations. Validate against the actual deployment target and SDK. Apple's capabilities evolve; do not infer photo support or model availability from iOS version alone. Use supported Vision/image APIs or a separately evaluated food recognition model for photo tasks, with an explicit manual fallback.

Begin with small, bounded text tasks: convert a user's meal description into an editable draft; summarize selected journal entries; assemble appointment questions. Test in airplane mode and confirm no network traffic. Android needs its own real runtime integration and evaluation; keep it unavailable until implemented.

## Phase 3: Improve usefulness across the app

- Natural-language logging: “Lunch was two eggs and toast” becomes a reviewable draft, with quantities and unknown ingredients clearly editable.
- Weekly summaries: calculate values in ordinary code first, then ask AI to explain those values. Attach links back to the exact days and report missing-day coverage.
- Appointment preparation: summarize user-selected symptoms and notes, preserve dates, and require review before exporting.
- Personal patterns: report sample count, missing days, and observed associations. Never describe correlation as causation or infer illness from a trend.
- Record explanation: quote and link to the specific lab/document field being explained, retain units/reference ranges, and allow the user to correct extraction errors before saving.

Avoid autonomous diagnoses, medication changes, fasting prescriptions, or treating an experimental recovery score as a clinical measurement.

## Primary documentation

- Apple model availability: https://developer.apple.com/documentation/FoundationModels/generating-content-and-performing-tasks-with-foundation-models
- Apple evolving model/image capabilities: https://developer.apple.com/documentation/Updates/FoundationModels
- Gemini image inputs: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- USDA food data lookup: https://fdc.nal.usda.gov/api-guide/

const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");

function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      Date,
      console,
      Set,
      Map,
      Array,
      Math,
      Number,
      String,
      Boolean,
      JSON,
      Error,
      setTimeout,
      clearTimeout,
      AbortController,
      fetch: mocks.fetch || globalThis.fetch,
      require: (name) => {
        if (name in mocks) return mocks[name];
        if (name === './OfflinePolicy') return load('src/services/OfflinePolicy.ts'); if (name === './RequestControl') return load('src/services/RequestControl.ts'); throw Error(name);
      },
    },
  );
  return exports;
}

// 1. Load USDA database
const usdaData = load("src/data/usda_common_foods.ts", {
  "../types/usda": {},
});

// 2. Load USDALookupService
const usdaLookup = load("src/services/USDALookupService.ts", {
  "../data/usda_common_foods": usdaData,
  "../types": {},
});

// 3. Load NaturalLanguageMealParser
const nlpParser = load("src/services/NaturalLanguageMealParser.ts", {
  "./USDALookupService": usdaLookup,
  "../types": {},
});

// 4. Load NativeVisionService
const nativeVision = load("src/services/NativeVisionService.ts", {
  "./USDALookupService": usdaLookup,
  "../../modules/safescale-vision": {
    isVisionSupportedAsync: async () => true,
    classifyImageAsync: async (uri) => {
      if (uri.includes("burger")) {
        return {
          classifications: [
            { identifier: "cheeseburger", confidence: 0.95 },
            { identifier: "sandwich", confidence: 0.82 },
          ],
          totalObservations: 2,
        };
      }
      if (uri.includes("apple")) {
        return {
          classifications: [
            { identifier: "apple", confidence: 0.91 },
            { identifier: "fruit", confidence: 0.88 },
          ],
          totalObservations: 2,
        };
      }
      return { classifications: [], totalObservations: 0 };
    },
  },
  "../types": {},
});

// 5. Load FoodVisionService
const foodVision = load("src/services/FoodVisionService.ts", {
  "expo-file-system/legacy": {
    readAsStringAsync: async () => "base64",
    EncodingType: { Base64: "base64" },
  },
  "./USDALookupService": usdaLookup,
  "./NativeVisionService": nativeVision,
  "./NaturalLanguageMealParser": nlpParser,
  "../types": {},
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("NaturalLanguageMealParser: parses single item with quantity", () => {
  const parser = nlpParser.NaturalLanguageMealParser;
  const result = parser.parseMealText("2 eggs");

  assert.ok(result);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.source, "on-device");
  // 1 large egg is 72 kcal -> 2 eggs = 144 kcal
  assert.equal(result.calories, 144);
  assert.equal(result.protein, 12.6);
  assert.ok(result.ingredients.includes("egg"));
});

test("NaturalLanguageMealParser: parses multi-item breakfast with fractions and units", () => {
  const parser = nlpParser.NaturalLanguageMealParser;
  const result = parser.parseMealText("2 eggs, 1 slice whole wheat bread, and black coffee");

  assert.ok(result);
  assert.equal(result.items.length, 3);
  // Total calories: 2 eggs (144) + 1 wheat bread (110) + black coffee (2) = 256 kcal
  assert.equal(result.calories, 256);
  assert.ok(result.protein > 16);
  assert.ok(result.carbs > 20);
  assert.equal(result.source, "on-device");

  // Check ingredients contain egg, wheat/gluten
  assert.ok(result.ingredients.includes("egg"));
  assert.ok(result.ingredients.includes("wheat"));
});

test("NaturalLanguageMealParser: handles word numbers like 'half', 'one', 'two'", () => {
  const parser = nlpParser.NaturalLanguageMealParser;
  const result = parser.parseMealText("half an avocado and two bananas");

  assert.ok(result);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].quantity, 0.5);
  assert.equal(result.items[1].quantity, 2);
  // Avocado (240 / 2 = 120) + 2 bananas (105 * 2 = 210) = 330 kcal
  assert.equal(result.calories, 330);
});

test("NaturalLanguageMealParser: throws clean error on gibberish input", () => {
  const parser = nlpParser.NaturalLanguageMealParser;
  assert.throws(() => parser.parseMealText("xyzqwe notafooditem"), /Could not recognize foods/);
});

test("NativeVisionService: maps Apple Vision classifications to USDA entries", () => {
  const service = nativeVision.NativeVisionService;

  const mockVisionLabels = [
    { identifier: "cheeseburger", confidence: 0.94 },
    { identifier: "sandwich", confidence: 0.75 },
  ];

  const match = service.mapClassificationsToUSDA(mockVisionLabels);
  assert.ok(match);
  assert.equal(match.confidence, "high");
  assert.match(match.food.name.toLowerCase(), /cheeseburger/);
  assert.equal(match.food.calories, 380);
});

test("NativeVisionService: classifyAndLookup executes full pipeline with on-device source", async () => {
  const service = nativeVision.NativeVisionService;
  const result = await service.classifyAndLookup("file:///photos/burger.jpg");

  assert.ok(result);
  assert.equal(result.source, "on-device");
  assert.equal(result.confidence, "high");
  assert.match(result.foodName.toLowerCase(), /cheeseburger/);
  assert.equal(result.calories, 380);
});

test("FoodVisionService: analyzeImage on-device routes through native vision when available", async () => {
  const fv = foodVision.FoodVisionService;
  const result = await fv.analyzeImage("file:///photos/apple.jpg", "on-device");

  assert.ok(result);
  assert.equal(result.source, "on-device");
  assert.match(result.foodName.toLowerCase(), /apple/);
  assert.equal(result.calories, 95);
});

test("FoodVisionService: analyzeImage on-device parses natural language description", async () => {
  const fv = foodVision.FoodVisionService;
  const result = await fv.analyzeImage("file:///photo.jpg", "on-device", "", "2 eggs and toast");

  assert.ok(result);
  assert.equal(result.source, "on-device");
  assert.ok(result.calories > 200);
  assert.ok(result.ingredients.includes("egg"));
});

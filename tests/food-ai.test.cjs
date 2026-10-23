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
        if (name === './OfflinePolicy') return mocks.fetch ? {offlineFetch:mocks.fetch} : load('src/services/OfflinePolicy.ts'); if (name === './RequestControl') return load('src/services/RequestControl.ts'); throw Error(name);
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

// 3. Load BarcodeLookupService
const barcodeService = load("src/services/BarcodeLookupService.ts", {
  "./USDALookupService": usdaLookup,
  "../types": {},
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("USDA database integrity: all entries have valid non-negative macros and names", () => {
  const foods = usdaData.USDA_COMMON_FOODS;
  assert.ok(Array.isArray(foods));
  assert.ok(foods.length >= 40, `Expected at least 40 common foods, found ${foods.length}`);

  for (const food of foods) {
    assert.ok(typeof food.fdcId === "number" && food.fdcId > 0, `Invalid fdcId in ${food.name}`);
    assert.ok(typeof food.name === "string" && food.name.length > 0, `Invalid name`);
    assert.ok(typeof food.category === "string" && food.category.length > 0, `Invalid category in ${food.name}`);
    assert.ok(typeof food.servingUnit === "string" && food.servingUnit.length > 0, `Invalid unit in ${food.name}`);
    assert.ok(typeof food.calories === "number" && food.calories >= 0 && Number.isFinite(food.calories), `Bad calories in ${food.name}`);
    assert.ok(typeof food.protein === "number" && food.protein >= 0 && Number.isFinite(food.protein), `Bad protein in ${food.name}`);
    assert.ok(typeof food.carbs === "number" && food.carbs >= 0 && Number.isFinite(food.carbs), `Bad carbs in ${food.name}`);
    assert.ok(typeof food.fat === "number" && food.fat >= 0 && Number.isFinite(food.fat), `Bad fat in ${food.name}`);
    assert.ok(typeof food.fiber === "number" && food.fiber >= 0 && Number.isFinite(food.fiber), `Bad fiber in ${food.name}`);
    assert.ok(typeof food.sugar === "number" && food.sugar >= 0 && Number.isFinite(food.sugar), `Bad sugar in ${food.name}`);
    assert.ok(typeof food.sodium === "number" && food.sodium >= 0 && Number.isFinite(food.sodium), `Bad sodium in ${food.name}`);
  }
});

test("USDALookupService: exact and fuzzy search matching", () => {
  const service = usdaLookup.USDALookupService;

  // Exact fruit search
  const appleResults = service.searchFoods("apple");
  assert.ok(appleResults.length > 0);
  assert.match(appleResults[0].food.name.toLowerCase(), /apple/);

  // Banana search
  const bananaResults = service.searchFoods("banana");
  assert.ok(bananaResults.length > 0);
  assert.equal(bananaResults[0].food.name, "Banana (Raw)");

  // Alias search (e.g. "french fries" -> "French Fries (Fast food, medium order)")
  const friesResults = service.searchFoods("french fries");
  assert.ok(friesResults.length > 0);
  assert.match(friesResults[0].food.name.toLowerCase(), /french fries/);

  // Case and punctuation insensitive search (e.g. "CHICKEN BREAST!!")
  const chickenResults = service.searchFoods("CHICKEN BREAST!!");
  assert.ok(chickenResults.length > 0);
  assert.match(chickenResults[0].food.name.toLowerCase(), /chicken breast/);

  // Category filter
  const fruitCategoryResults = service.searchFoods("", { category: "Fruits" });
  assert.ok(fruitCategoryResults.length > 0);
  for (const item of fruitCategoryResults) {
    assert.equal(item.food.category, "Fruits");
  }
});

test("USDALookupService: barcode lookup for common packaged foods", () => {
  const service = usdaLookup.USDALookupService;

  // Coca-cola barcode: '049000028904'
  const coke = service.getFoodByBarcode("049000028904");
  assert.ok(coke, "Coca-Cola should resolve from offline database");
  assert.match(coke.name.toLowerCase(), /cola|soda/);

  // Leading zero tolerance (e.g. without leading 0)
  const cokeWithoutZero = service.getFoodByBarcode("49000028904");
  assert.ok(cokeWithoutZero, "Barcode should match without leading zeroes");

  // Quaker Oats: '030000010402'
  const oats = service.getFoodByBarcode("030000010402");
  assert.ok(oats, "Quaker Oats should resolve from offline database");
  assert.match(oats.name.toLowerCase(), /oatmeal/);

  // Non-existent barcode
  const missing = service.getFoodByBarcode("9999999999999");
  assert.equal(missing, undefined);
});

test("USDALookupService: toFoodAnalysisResult formats and scales correctly", () => {
  const service = usdaLookup.USDALookupService;
  const salmon = service.getFoodById(175168);
  assert.ok(salmon);

  // Base portion (1x)
  const baseResult = service.toFoodAnalysisResult(salmon, 1);
  assert.equal(baseResult.source, "usda");
  assert.equal(baseResult.confidence, "high");
  assert.equal(baseResult.calories, salmon.calories);
  assert.equal(baseResult.protein, salmon.protein);
  assert.ok(Array.isArray(baseResult.ingredients));
  assert.ok(baseResult.ingredients.includes("fish"));

  // 2x portion
  const doubleResult = service.toFoodAnalysisResult(salmon, 2);
  assert.equal(doubleResult.calories, salmon.calories * 2);
  assert.equal(doubleResult.protein, Math.round(salmon.protein * 2 * 10) / 10);
});

test("BarcodeLookupService: local USDA hit resolves offline with source 'usda'", async () => {
  const service = barcodeService.BarcodeLookupService;
  // Test with Chobani barcode: '894700010045'
  const result = await service.lookupBarcode("894700010045");
  assert.ok(result);
  assert.equal(result.source, "usda");
  assert.match(result.foodName.toLowerCase(), /greek yogurt/);
  assert.ok(result.calories > 0);
  assert.ok(result.protein > 0);
  assert.ok(result.ingredients.includes("dairy") || result.ingredients.includes("milk"));
});

test("BarcodeLookupService: Open Food Facts fallback parses product nutriments", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      status: 1,
      product: {
        product_name: "Mock Granola Crunch",
        serving_size: "50g",
        nutriments: {
          "energy-kcal_serving": 210,
          proteins_serving: 6.0,
          carbohydrates_serving: 32.0,
          fat_serving: 7.0,
          fiber_serving: 3.5,
          sugars_serving: 9.0,
          sodium_serving: 0.12, // in grams -> 120mg
        },
        ingredients_tags: ["en:oats", "en:honey", "en:almonds"],
      },
    }),
  });

  const customBarcodeService = load("src/services/BarcodeLookupService.ts", {
    "./USDALookupService": usdaLookup,
    "../types": {},
    "./CloudPermissionGuard": {CloudPermissionGuard: {requestPermission: async () => true}},
    fetch: mockFetch,
  }).BarcodeLookupService;

  // Use a UPC that is NOT in local USDA DB
  const result = await customBarcodeService.lookupBarcode("7350083380001");
  assert.ok(result);
  assert.equal(result.source, "openfoodfacts");
  assert.equal(result.foodName, "Mock Granola Crunch");
  assert.equal(result.calories, 210);
  assert.equal(result.protein, 6.0);
  assert.equal(result.carbs, 32.0);
  assert.equal(result.fat, 7.0);
  assert.equal(result.fiber, 3.5);
  assert.equal(result.sugar, 9.0);
  assert.equal(result.sodium, 120);
  assert.ok(result.ingredients.includes("oats"));
  assert.ok(result.ingredients.includes("honey"));
});

test("BarcodeLookupService: rejects invalid or missing barcodes with clean message", async () => {
  const service = barcodeService.BarcodeLookupService;
  await assert.rejects(service.lookupBarcode(""), /valid numeric barcode/);
  await assert.rejects(service.lookupBarcode("abc"), /valid numeric barcode/);
});

test("FoodVisionService: analyzeImageOffline with food hint resolves against USDA", async () => {
  const fv = load("src/services/FoodVisionService.ts", {
    "expo-file-system/legacy": {
      readAsStringAsync: async () => "dummyBase64",
      EncodingType: { Base64: "base64" },
    },
    "./USDALookupService": usdaLookup,
    "../types": {},
  }).FoodVisionService;

  const result = await fv.analyzeImageOffline("file:///photo.jpg", "banana");
  assert.ok(result);
  assert.equal(result.foodName, "Banana");
  assert.equal(result.source, "on-device");
  assert.equal(result.calories, 105);
});

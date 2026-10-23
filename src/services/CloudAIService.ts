import { offlineFetch as fetch } from './OfflinePolicy';
import { controlledRequest } from './RequestControl';
/**
 * @file src/services/CloudAIService.ts
 * @description Cloud-backed Visual AI services using Google Gemini 2.5 Flash Vision.
 *
 * Provides:
 *   - analyzeIngredientsOCR: extracts product name, brand, and clean ingredients list.
 *   - analyzeDocumentOCR: reads medical records (prescriptions, labs, vaccines) with strict PII removal.
 */

import * as FileSystem from 'expo-file-system/legacy';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Prompt to extract food ingredients
const INGREDIENT_OCR_PROMPT = `You are a professional food label scanner.
Analyze this image of a food ingredient label. Extract the brand name, product name, and the list of ingredients.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanations, no other text):
{
  "brand": "The brand name of the product (or empty string if not found)",
  "name": "The name of the product (or empty string if not found)",
  "ingredients": ["Ingredient 1", "Ingredient 2", "Ingredient 3", ...]
}

Base ingredients on the printed panel. Convert all text to standard title casing and remove accidental symbols.
Strict privacy guideline: Do NOT include any person's name or other identifying details.`;

// Prompt to parse medical documents with strict PII removal
const DOCUMENT_OCR_PROMPT = `You are an expert clinical records parser.
Analyze this medical document image (such as a prescription, lab report, or vaccination card).
Identify the document type and extract the structured clinical details.

Strict privacy guideline: You MUST redact/exclude all personally identifiable information (PII) of the patient, such as names, dates of birth, social security numbers, phone numbers, email addresses, and home addresses. Never include them in your output.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanations, no other text):
{
  "type": "Prescription" | "LabResult" | "Immunization",
  "title": "A short descriptive title (e.g. 'Amoxicillin 500mg', 'Metabolic Panel', 'COVID-19 Vaccine')",
  "value": "The clinical details (e.g. dosage instructions '1 pill daily', lab values 'Glucose: 105 mg/dL', or vaccine details '0.5mL Dose 2')",
  "provider": "The clinic, doctor, laboratory, or pharmacy name (or empty string if not found)",
  "status": "A status description (e.g. 'Active', 'Final Report', 'Completed')"
}
`;

/**
 * Convert a local image URI to a base64-encoded string for the Gemini API.
 */
const uriToBase64 = async (uri: string): Promise<string> => {
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
};

/**
 * Executes a Gemini 2.5 Flash Vision content generation request.
 */
const executeGeminiRequest = async (
  imageUri: string,
  apiKey: string,
  promptText: string,
): Promise<string> => {
  const base64Image = await uriToBase64(imageUri);
  const mimeType = imageUri.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  };

  return controlledRequest(async signal => {
    const response = await fetch(GEMINI_API_URL, {
      method:'POST', signal, headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(requestBody),
    });
    if (!response.ok) throw new Error(`Image analysis failed (HTTP ${response.status}).`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || '').join('');
    if (!text?.trim()) throw new Error('No text could be extracted. Try a clearer image.');
    return text;
  });
};

let guardRef: typeof import('./CloudPermissionGuard').CloudPermissionGuard | null = null;
function getGuard() {
  if (!guardRef) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      guardRef = require('./CloudPermissionGuard').CloudPermissionGuard;
    } catch {}
  }
  return guardRef;
}

export const CloudAIService = {
  /**
   * Scans a food label photo and extracts ingredients details.
   */
  analyzeIngredientsOCR: async (
    imageUri: string,
    apiKey: string,
  ): Promise<{ brand: string; name: string; ingredients: string[] }> => {
    const action = async () => {
      const rawText = await executeGeminiRequest(imageUri, apiKey, INGREDIENT_OCR_PROMPT);
      const jsonText = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(jsonText) as {
        brand?: string;
        name?: string;
        ingredients?: string[];
      };

      if (!Array.isArray(parsed.ingredients) || !parsed.ingredients.length || !parsed.ingredients.every(i => typeof i === 'string' && i.trim())) throw new Error('No reliable ingredient list was extracted. Check the label manually.');
      return {
        brand: parsed.brand || '',
        name: parsed.name || 'Scanned Label',
        ingredients: parsed.ingredients && parsed.ingredients.length > 0
          ? parsed.ingredients
          : ['Ingredients details unavailable'],
      };
    };

    const guard = getGuard();
    if (guard) {
      return await guard.executeWithPermission(
        {
          purpose: 'Scan food package ingredients with Google Gemini Vision Cloud API',
          endpoint: 'https://generativelanguage.googleapis.com (Gemini 2.5 Flash Vision)',
          dataPayloadSummary: 'Cropped label image bytes',
          sensitiveFields: ['Label photo'],
        },
        action,
      );
    }

    throw new Error('Cloud consent is unavailable. No data was sent.');
  },

  /**
   * Scans a medical document photo and extracts clinical info with PII redacted.
   */
  analyzeDocumentOCR: async (
    imageUri: string,
    apiKey: string,
  ): Promise<{
    type: 'Prescription' | 'LabResult' | 'Immunization';
    title: string;
    value: string;
    provider: string;
    status: string;
  }> => {
    const action = async () => {
      const rawText = await executeGeminiRequest(imageUri, apiKey, DOCUMENT_OCR_PROMPT);
      const jsonText = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(jsonText) as {
        type?: 'Prescription' | 'LabResult' | 'Immunization';
        title?: string;
        value?: string;
        provider?: string;
        status?: string;
      };

      if (!['Prescription','LabResult','Immunization'].includes(parsed.type || '') || typeof parsed.title !== 'string' || !parsed.title.trim() || typeof parsed.value !== 'string' || !parsed.value.trim()) throw new Error('The document could not be reliably extracted. Enter its details manually.');
      return {
        type: parsed.type || 'Prescription',
        title: parsed.title || 'Scanned Record',
        value: parsed.value || 'Extraction details unavailable',
        provider: parsed.provider || 'Clinical Provider',
        status: parsed.status || 'Active',
      };
    };

    const guard = getGuard();
    if (guard) {
      return await guard.executeWithPermission(
        {
          purpose: 'Scan clinical medical document with Google Gemini Vision Cloud API',
          endpoint: 'https://generativelanguage.googleapis.com (Gemini 2.5 Flash Vision)',
          dataPayloadSummary: 'Original medical document image. Personal details are sent to Google; they are not redacted before upload.',
          sensitiveFields: ['Medical document image'],
        },
        action,
      );
    }

    throw new Error('Cloud consent is unavailable. No data was sent.');
  },
};

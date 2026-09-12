/**
 * @file src/utils/deviceName.ts
 * @description Smart device-name parser to auto-detect the user's name from their device hostname.
 *
 * Examples:
 *   "Rehan's iPhone"          -> "Rehan"
 *   "Rehan Abbu’s iPad Pro"   -> "Rehan Abbu"
 *   "Alex - iPhone"           -> "Alex"
 *   "iPhone de Mateo"         -> "Mateo"
 *   "iPhone von Lukas"        -> "Lukas"
 */

import { Platform } from 'react-native';

/**
 * Pure function to extract a human name from a device name string.
 */
export function parseOwnerNameFromDeviceName(rawDeviceName?: string | null): string | null {
  if (!rawDeviceName || typeof rawDeviceName !== 'string') return null;
  const trimmed = rawDeviceName.trim();
  if (!trimmed) return null;

  // Pattern 1: English possessive: "Name's iPhone", "Name’s iPad", "First Last's Apple Watch"
  // Handles straight ' and curly ’
  const possessiveMatch = trimmed.match(/^(.+?)(?:['’]s)\s+(?:iPhone|iPad|Apple\s*Watch|Watch|MacBook|Mac|Phone|Device|Galaxy|Pixel).*/i);
  if (possessiveMatch && possessiveMatch[1]) {
    const candidate = possessiveMatch[1].trim();
    if (isValidHumanName(candidate)) return candidate;
  }

  // Pattern 2: Hyphenated: "Name - iPhone", "Name - iPad"
  const hyphenMatch = trimmed.match(/^(.+?)\s*[-–—]\s*(?:iPhone|iPad|Phone|Watch|Apple\s*Watch).*/i);
  if (hyphenMatch && hyphenMatch[1]) {
    const candidate = hyphenMatch[1].trim();
    if (isValidHumanName(candidate)) return candidate;
  }

  // Pattern 3: Romance languages: "iPhone de Name", "iPad de Name"
  const romanceMatch = trimmed.match(/(?:iPhone|iPad|Watch)\s+(?:de|di|da)\s+(.+)/i);
  if (romanceMatch && romanceMatch[1]) {
    const candidate = romanceMatch[1].trim();
    if (isValidHumanName(candidate)) return candidate;
  }

  // Pattern 4: German: "iPhone von Name"
  const germanMatch = trimmed.match(/(?:iPhone|iPad|Watch)\s+(?:von)\s+(.+)/i);
  if (germanMatch && germanMatch[1]) {
    const candidate = germanMatch[1].trim();
    if (isValidHumanName(candidate)) return candidate;
  }

  return null;
}

/**
 * Sanity check to avoid returning generic hardware strings as names.
 */
function isValidHumanName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 50) return false;
  // Discard generic device terms
  const blacklisted = new Set([
    'iphone', 'ipad', 'apple', 'watch', 'phone', 'device', 'my', 'the',
    'android', 'pixel', 'samsung', 'galaxy', 'windows', 'user', 'owner',
    'administrator', 'admin', 'test',
  ]);
  const lower = name.toLowerCase();
  if (blacklisted.has(lower)) return false;
  // Must contain at least one alphabetic character
  return /[a-zA-Z\u00C0-\u024F]/.test(name);
}

/**
 * Reads the device name from expo-constants or react-native runtime and extracts
 * the owner's suggested name.
 */
export function getSuggestedOwnerName(): string | null {
  try {
    // Attempt expo-constants
    const Constants = require('expo-constants').default ?? require('expo-constants');
    const devName = Constants.deviceName || Constants.installationId;
    if (devName && typeof devName === 'string') {
      const parsed = parseOwnerNameFromDeviceName(devName);
      if (parsed) return parsed;
    }
  } catch {
    // Graceful fallback if expo-constants is unavailable
  }

  return null;
}

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const TATWEEL = /\u0640/g;
const PUNCTUATION = /[\u2000-\u206F\u2E00-\u2E7F!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~«»،؛؟]/g;
const MULTI_WHITESPACE = /\s+/g;

const ARABIC_PUNCT_BREAKS = /\u061F|\u061B|\u060C/g;
const ARABIC_CHAR_MAP: Record<string, string> = {
  '\u0622': '\u0627', // Alef with madda
  '\u0623': '\u0627', // Alef with hamza above
  '\u0624': '\u0648',
  '\u0625': '\u0627',
  '\u0626': '\u064A',
  '\u0629': '\u0647',
  '\u0649': '\u064A',
};

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const INDIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function normalizeEnglish(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(MULTI_WHITESPACE, ' ')
    .trim();
}

export function normalizeArabic(text: string): string {
  if (!text) return '';
  let normalized = text;

  normalized = normalized.replace(ARABIC_DIACRITICS, '');
  normalized = normalized.replace(TATWEEL, '');
  normalized = normalized.replace(ARABIC_PUNCT_BREAKS, ' ');
  normalized = normalized.replace(PUNCTUATION, ' ');

  normalized = replaceNumerals(normalized);

  normalized = normalized
    .split('')
    .map(char => ARABIC_CHAR_MAP[char] || char)
    .join('');

  normalized = normalized.replace(MULTI_WHITESPACE, ' ').trim();
  return normalized;
}

export function normalizeAny(text: string): string {
  if (!text) return '';
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  return hasArabic ? normalizeArabic(text) : normalizeEnglish(text);
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  return normalizeAny(text)
    .split(' ')
    .filter(Boolean);
}

export function replaceNumerals(text: string): string {
  if (!text) return '';
  let result = text;
  ARABIC_DIGITS.forEach((digit, index) => {
    const regex = new RegExp(digit, 'g');
    result = result.replace(regex, String(index));
  });
  INDIAN_DIGITS.forEach((digit, index) => {
    const regex = new RegExp(digit, 'g');
    result = result.replace(regex, String(index));
  });
  return result;
}

export function normalizeScriptureReference(ref: string): string {
  if (!ref) return '';
  return replaceNumerals(ref)
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(MULTI_WHITESPACE, ' ')
    .trim();
}

export function extractLeadingSectionId(rowId: string): string {
  if (!rowId) return '';
  const sectionId = rowId.split('-')[0];
  return sectionId;
}

export function sanitizeSnippet(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

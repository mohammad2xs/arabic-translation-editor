/**
 * Arabic Text Enhancement Library
 * Provides orthography and typography normalization without changing meaning
 */

export interface ArabicEnhancementOptions {
  /** Convert digits to western (ASCII) format */
  normalizeDigits?: boolean
  /** Normalize punctuation marks */
  normalizePunctuation?: boolean
  /** Remove excessive tatweel (kashida) elongation */
  removeTatweel?: boolean
  /** Normalize spacing around punctuation */
  normalizeSpacing?: boolean
  /** Convert quotes to ASCII style */
  normalizeQuotes?: boolean
  /** Preserve bracket/quote balance */
  preserveBalance?: boolean
}

export interface EnhancementResult {
  /** Enhanced Arabic text */
  enhanced: string
  /** Original text for comparison */
  original: string
  /** List of changes made */
  changes: EnhancementChange[]
  /** Any warnings or issues detected */
  warnings: string[]
  /** Whether bracket/quote balance was preserved */
  balancePreserved: boolean
}

export interface EnhancementChange {
  /** Type of change made */
  type: 'digits' | 'punctuation' | 'tatweel' | 'spacing' | 'quotes'
  /** Original text segment */
  from: string
  /** Enhanced text segment */
  to: string
  /** Position in text */
  position: number
}

const DEFAULT_OPTIONS: ArabicEnhancementOptions = {
  normalizeDigits: true,
  normalizePunctuation: true,
  removeTatweel: true,
  normalizeSpacing: true,
  normalizeQuotes: true,
  preserveBalance: true
}

// Arabic-Indic digit mappings
const ARABIC_DIGITS: { [key: string]: string } = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
}

// Eastern Arabic-Indic digit mappings
const EASTERN_ARABIC_DIGITS: { [key: string]: string } = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
}

// Punctuation normalizations
const PUNCTUATION_MAP: { [key: string]: string } = {
  '؟': '?',    // Arabic question mark
  '؛': ';',    // Arabic semicolon
  '،': ',',    // Arabic comma
  '٪': '%',    // Arabic percent sign
  '٫': ',',    // Arabic decimal separator
  '٬': ',',    // Arabic thousands separator
}

// Quote normalizations
const QUOTE_MAP: { [key: string]: string } = {
  '"': '"',    // Left double quotation mark
  '"': '"',    // Right double quotation mark
  ''': "'",    // Left single quotation mark
  ''': "'",    // Right single quotation mark
  '„': '"',    // Double low-9 quotation mark
  '‚': "'",    // Single low-9 quotation mark
  '«': '"',    // Left-pointing double angle quotation mark
  '»': '"',    // Right-pointing double angle quotation mark
  '‹': "'",    // Single left-pointing angle quotation mark
  '›': "'",    // Single right-pointing angle quotation mark
}

// Tatweel character (Arabic Kashida)
const TATWEEL = 'ـ'

/**
 * Check if brackets and quotes are balanced in text
 */
function checkBalance(text: string): boolean {
  const stack: string[] = []
  const pairs: { [key: string]: string } = {
    '(': ')', '[': ']', '{': '}', '"': '"', "'": "'"
  }

  for (const char of text) {
    if (char in pairs) {
      if (char === '"' || char === "'") {
        // Handle quotes (toggle behavior)
        const lastIndex = stack.lastIndexOf(char)
        if (lastIndex !== -1) {
          stack.splice(lastIndex, 1)
        } else {
          stack.push(char)
        }
      } else {
        // Handle brackets
        stack.push(char)
      }
    } else if (Object.values(pairs).includes(char)) {
      if (stack.length === 0) return false
      const last = stack.pop()!
      if (pairs[last] !== char) return false
    }
  }

  return stack.length === 0
}

/**
 * Normalize Arabic digits to western digits
 */
function normalizeDigits(text: string): { text: string; changes: EnhancementChange[] } {
  const changes: EnhancementChange[] = []
  let result = text

  // Replace Arabic-Indic digits
  for (const [arabic, western] of Object.entries(ARABIC_DIGITS)) {
    const regex = new RegExp(arabic, 'g')
    let match
    while ((match = regex.exec(result)) !== null) {
      changes.push({
        type: 'digits',
        from: arabic,
        to: western,
        position: match.index
      })
    }
    result = result.replace(regex, western)
  }

  // Replace Eastern Arabic-Indic digits
  for (const [arabic, western] of Object.entries(EASTERN_ARABIC_DIGITS)) {
    const regex = new RegExp(arabic, 'g')
    let match
    while ((match = regex.exec(result)) !== null) {
      changes.push({
        type: 'digits',
        from: arabic,
        to: western,
        position: match.index
      })
    }
    result = result.replace(regex, western)
  }

  return { text: result, changes }
}

/**
 * Normalize punctuation marks
 */
function normalizePunctuation(text: string): { text: string; changes: EnhancementChange[] } {
  const changes: EnhancementChange[] = []
  let result = text

  for (const [arabic, latin] of Object.entries(PUNCTUATION_MAP)) {
    const regex = new RegExp(arabic, 'g')
    let match
    while ((match = regex.exec(result)) !== null) {
      changes.push({
        type: 'punctuation',
        from: arabic,
        to: latin,
        position: match.index
      })
    }
    result = result.replace(regex, latin)
  }

  return { text: result, changes }
}

/**
 * Remove excessive tatweel (kashida) elongation
 */
function removeTatweel(text: string): { text: string; changes: EnhancementChange[] } {
  const changes: EnhancementChange[] = []
  let result = text

  // Replace multiple tatweels with single tatweel, then remove singles
  const multiTatweelRegex = new RegExp(TATWEEL + '{2,}', 'g')
  let match
  while ((match = multiTatweelRegex.exec(result)) !== null) {
    changes.push({
      type: 'tatweel',
      from: match[0],
      to: '',
      position: match.index
    })
  }
  result = result.replace(multiTatweelRegex, '')

  // Remove remaining single tatweels
  const singleTatweelRegex = new RegExp(TATWEEL, 'g')
  while ((match = singleTatweelRegex.exec(result)) !== null) {
    changes.push({
      type: 'tatweel',
      from: TATWEEL,
      to: '',
      position: match.index
    })
  }
  result = result.replace(singleTatweelRegex, '')

  return { text: result, changes }
}

/**
 * Normalize spacing around punctuation
 */
function normalizeSpacing(text: string): { text: string; changes: EnhancementChange[] } {
  const changes: EnhancementChange[] = []
  let result = text

  // Remove extra spaces before punctuation
  const beforePunctRegex = /\s+([.!?;:,])/g
  result = result.replace(beforePunctRegex, (match, punct, offset) => {
    if (match.length > 1) {
      changes.push({
        type: 'spacing',
        from: match,
        to: punct,
        position: offset
      })
    }
    return punct
  })

  // Ensure single space after punctuation (except at end of text)
  const afterPunctRegex = /([.!?;:,])(\S)/g
  result = result.replace(afterPunctRegex, (match, punct, nextChar, offset) => {
    const replacement = punct + ' ' + nextChar
    changes.push({
      type: 'spacing',
      from: match,
      to: replacement,
      position: offset
    })
    return replacement
  })

  // Normalize multiple spaces to single space
  const multiSpaceRegex = /  +/g
  result = result.replace(multiSpaceRegex, (match, offset) => {
    changes.push({
      type: 'spacing',
      from: match,
      to: ' ',
      position: offset
    })
    return ' '
  })

  return { text: result, changes }
}

/**
 * Normalize quotes to ASCII style
 */
function normalizeQuotes(text: string): { text: string; changes: EnhancementChange[] } {
  const changes: EnhancementChange[] = []
  let result = text

  for (const [fancy, ascii] of Object.entries(QUOTE_MAP)) {
    const regex = new RegExp(fancy, 'g')
    let match
    while ((match = regex.exec(result)) !== null) {
      changes.push({
        type: 'quotes',
        from: fancy,
        to: ascii,
        position: match.index
      })
    }
    result = result.replace(regex, ascii)
  }

  return { text: result, changes }
}

/**
 * Enhance Arabic text with orthography and typography normalization
 */
export function enhanceArabicText(
  text: string,
  options: Partial<ArabicEnhancementOptions> = {}
): EnhancementResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const warnings: string[] = []
  let result = text
  let allChanges: EnhancementChange[] = []

  // Check initial balance
  const initialBalance = checkBalance(text)
  if (!initialBalance) {
    warnings.push('Input text has unbalanced brackets or quotes')
  }

  // Apply normalizations in order
  if (opts.normalizeDigits) {
    const { text: newText, changes } = normalizeDigits(result)
    result = newText
    allChanges.push(...changes)
  }

  if (opts.normalizePunctuation) {
    const { text: newText, changes } = normalizePunctuation(result)
    result = newText
    allChanges.push(...changes)
  }

  if (opts.removeTatweel) {
    const { text: newText, changes } = removeTatweel(result)
    result = newText
    allChanges.push(...changes)
  }

  if (opts.normalizeSpacing) {
    const { text: newText, changes } = normalizeSpacing(result)
    result = newText
    allChanges.push(...changes)
  }

  if (opts.normalizeQuotes) {
    const { text: newText, changes } = normalizeQuotes(result)
    result = newText
    allChanges.push(...changes)
  }

  // Check final balance
  const finalBalance = checkBalance(result)
  const balancePreserved = !opts.preserveBalance || (initialBalance === finalBalance)

  if (opts.preserveBalance && !balancePreserved) {
    warnings.push('Enhancement process affected bracket/quote balance')
  }

  return {
    enhanced: result,
    original: text,
    changes: allChanges,
    warnings,
    balancePreserved
  }
}

/**
 * Batch enhance multiple Arabic texts
 */
export function enhanceArabicTexts(
  texts: string[],
  options: Partial<ArabicEnhancementOptions> = {}
): EnhancementResult[] {
  return texts.map(text => enhanceArabicText(text, options))
}

/**
 * Get enhancement statistics
 */
export function getEnhancementStats(results: EnhancementResult[]): {
  totalTexts: number
  totalChanges: number
  changesByType: { [key: string]: number }
  warningsCount: number
  balanceIssues: number
} {
  const changesByType: { [key: string]: number } = {}
  let totalChanges = 0
  let warningsCount = 0
  let balanceIssues = 0

  for (const result of results) {
    totalChanges += result.changes.length
    warningsCount += result.warnings.length
    if (!result.balancePreserved) balanceIssues++

    for (const change of result.changes) {
      changesByType[change.type] = (changesByType[change.type] || 0) + 1
    }
  }

  return {
    totalTexts: results.length,
    totalChanges,
    changesByType,
    warningsCount,
    balanceIssues
  }
}
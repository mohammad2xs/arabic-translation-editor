#!/usr/bin/env node

/**
 * Style Profile Derivation
 * Analyzes existing parallel pairs to extract translation methodology
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PARALLEL_PATH = path.join(PROJECT_ROOT, '.cache/parallel.jsonl')
const STYLE_PROFILE_PATH = path.join(PROJECT_ROOT, 'artifacts/reports/style-profile.json')
const STYLE_NOTES_PATH = path.join(PROJECT_ROOT, 'artifacts/reports/style-profile.md')

const SAMPLE_SIZE = 1000

async function loadParallelSegments() {
  try {
    const content = await fs.readFile(PARALLEL_PATH, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    const segments = []

    for (const line of lines) {
      try {
        const seg = JSON.parse(line)
        segments.push(seg)
      } catch (parseError) {
        console.warn(`[style] Skipping malformed line: ${line.slice(0, 100)}...`)
        continue
      }
    }

    // Filter for segments with both src and tgt present, and prefer Arabic content
    const complete = segments.filter(seg => {
      const hasBoth = seg.src && seg.tgt && seg.src.trim() && seg.tgt.trim()
      const hasArabic = /[\u0600-\u06FF]/.test(seg.src) // Arabic script
      return hasBoth && hasArabic
    })

    console.log(`[style] Loaded ${complete.length} Arabic-English parallel segments`)
    return complete
  } catch (error) {
    throw new Error(`Failed to load parallel segments: ${error.message}`)
  }
}

function analyzeDigitsPolicy(segments) {
  const sample = segments.slice(0, 500)
  let westernCount = 0
  let easternCount = 0

  for (const seg of sample) {
    const arabicText = seg.src
    // Check for western digits (0-9)
    const westernDigits = (arabicText.match(/[0-9]/g) || []).length
    // Check for eastern Arabic-Indic digits (٠-٩)
    const easternDigits = (arabicText.match(/[٠-٩]/g) || []).length

    if (westernDigits > easternDigits) westernCount++
    else if (easternDigits > westernCount) easternCount++
  }

  if (westernCount > easternCount * 2) return "western"
  if (easternCount > westernCount * 2) return "eastern"
  return "mixed"
}

function analyzePunctuation(segments) {
  const sample = segments.slice(0, 500)
  let arabicQuotes = 0
  let smartQuotes = 0
  let asciiQuotes = 0
  let arabicComma = 0
  let latinComma = 0
  let arabicQuestion = 0
  let latinQuestion = 0

  for (const seg of sample) {
    const arabicText = seg.src

    // Quotes
    if (arabicText.includes('«') || arabicText.includes('»')) arabicQuotes++
    if (arabicText.includes('"') || arabicText.includes('"')) smartQuotes++
    if (arabicText.includes('"')) asciiQuotes++

    // Comma
    if (arabicText.includes('،')) arabicComma++
    if (arabicText.includes(',')) latinComma++

    // Question mark
    if (arabicText.includes('؟')) arabicQuestion++
    if (arabicText.includes('?')) latinQuestion++
  }

  return {
    quotes: arabicQuotes > Math.max(smartQuotes, asciiQuotes) ? "arabic«»" :
            smartQuotes > asciiQuotes ? "smart" : "ascii",
    comma: arabicComma > latinComma ? "،" : ",",
    question: arabicQuestion > latinQuestion ? "؟" : "?",
    ellipsis: "…", // Default to proper ellipsis
    dash: "—" // Default to em dash
  }
}

function extractProperNouns(segments) {
  const sample = segments.slice(0, 300)
  const nounMappings = new Map()

  for (const seg of sample) {
    const arabicText = seg.src
    const englishText = seg.tgt

    // Look for capitalized words that might be proper nouns
    const englishWords = englishText.match(/[A-Z][a-z]+/g) || []
    const arabicWords = arabicText.match(/[\\u0600-\\u06FF]+/g) || []

    // Simple heuristic: if English has fewer than 5 words and Arabic similar count,
    // might be proper nouns or key terms
    if (englishWords.length <= 4 && arabicWords.length <= 6) {
      for (const arWord of arabicWords) {
        for (const enWord of englishWords) {
          if (arWord.length > 3 && enWord.length > 3) {
            const key = arWord.trim()
            if (!nounMappings.has(key)) {
              nounMappings.set(key, new Set())
            }
            nounMappings.get(key).add(enWord.trim())
          }
        }
      }
    }
  }

  // Extract stable mappings (where Arabic word consistently maps to same English)
  const stableMappings = []
  for (const [arWord, enSet] of nounMappings.entries()) {
    if (enSet.size === 1 && arWord.length > 2) {
      stableMappings.push(`${arWord} → ${Array.from(enSet)[0]}`)
    }
  }

  return stableMappings.slice(0, 50) // Top 50
}

function detectScriptureReferences(segments) {
  const sample = segments.slice(0, 200)
  let hasScriptureRefs = false
  const patterns = []

  for (const seg of sample) {
    const arabicText = seg.src
    const englishText = seg.tgt

    // Look for Quranic references (chapter:verse)
    const quranPattern = /\\b(\\d{1,3}:\\d{1,3})\\b/g
    const quranMatches = [...(englishText.matchAll(quranPattern) || [])]

    // Look for Arabic religious terms
    const islamicTerms = /سورة|آية|القرآن|الحديث|النبي|صلى الله عليه وسلم/g
    const islamicMatches = arabicText.match(islamicTerms)

    if (quranMatches.length > 0 || islamicMatches) {
      hasScriptureRefs = true
      patterns.push(...quranMatches.map(m => m[1]))
    }
  }

  return {
    detected: hasScriptureRefs,
    patterns: [...new Set(patterns)].slice(0, 10)
  }
}

function extractDoNotTranslateTerms(segments) {
  const sample = segments.slice(0, 200)
  const conservativeTerms = [
    "الله", "محمد", "النبي", "الرسول", "القرآن", "الحديث",
    "صلى الله عليه وسلم", "رضي الله عنه", "رحمه الله",
    "سورة", "آية", "الإسلام", "المسلم", "الجنة", "النار"
  ]

  // Find terms that appear in Arabic but are transliterated or kept in Arabic in English
  const foundTerms = new Set()

  for (const seg of sample) {
    const arabicText = seg.src
    for (const term of conservativeTerms) {
      if (arabicText.includes(term)) {
        foundTerms.add(term)
      }
    }
  }

  return Array.from(foundTerms)
}

async function deriveStyleProfile() {
  const segments = await loadParallelSegments()

  if (segments.length === 0) {
    throw new Error('No parallel segments found. Run npm run index:manuscript first.')
  }

  const sampleSize = Math.min(SAMPLE_SIZE, segments.length)
  const sample = segments.slice(0, sampleSize)

  console.log(`[style] Analyzing ${sampleSize} segments for style patterns...`)

  const digitsPolicy = analyzeDigitsPolicy(sample)
  const punctuation = analyzePunctuation(sample)
  const properNouns = extractProperNouns(sample)
  const scriptureRefs = detectScriptureReferences(sample)
  const doNotTranslate = extractDoNotTranslateTerms(sample)

  const styleProfile = {
    digitsPolicy,
    quotes: punctuation.quotes,
    comma: punctuation.comma,
    question: punctuation.question,
    ellipsis: punctuation.ellipsis,
    dash: punctuation.dash,
    properNouns,
    scriptureRefs,
    doNotTranslate,
    sampleSize,
    derivedAt: new Date().toISOString()
  }

  // Write JSON profile
  await fs.mkdir(path.dirname(STYLE_PROFILE_PATH), { recursive: true })
  await fs.writeFile(STYLE_PROFILE_PATH, JSON.stringify(styleProfile, null, 2) + '\\n', 'utf8')

  // Write human-readable notes
  const notes = `# Translation Style Profile

*Derived from ${sampleSize} existing parallel segments*
*Generated: ${styleProfile.derivedAt}*

## Formatting Conventions

### Numbers
- **Digits Policy**: ${digitsPolicy}
  ${digitsPolicy === 'western' ? '- Use 0-9 in Arabic text' :
    digitsPolicy === 'eastern' ? '- Use ٠-٩ in Arabic text' :
    '- Mixed usage of both western and eastern digits'}

### Punctuation
- **Quotes**: ${punctuation.quotes === 'arabic«»' ? 'Arabic guillemets « »' :
              punctuation.quotes === 'smart' ? 'Smart quotes " "' : 'ASCII quotes "'}
- **Comma**: ${punctuation.comma === '،' ? 'Arabic comma ،' : 'Latin comma ,'}
- **Question Mark**: ${punctuation.question === '؟' ? 'Arabic question mark ؟' : 'Latin question mark ?'}
- **Ellipsis**: ${punctuation.ellipsis}
- **Dash**: ${punctuation.dash}

## Content Guidelines

### Scripture References
${scriptureRefs.detected ?
  `- **Scripture references detected**: ${scriptureRefs.patterns.join(', ')}
- Preserve verse numbers and chapter references exactly
- Maintain consistent citation format` :
  '- No systematic scripture references detected'}

### Untranslated Terms
Preserve these Arabic terms without translation:
${doNotTranslate.map(term => `- ${term}`).join('\\n')}

### Proper Noun Mappings
Key stable translations observed:
${properNouns.slice(0, 10).map(mapping => `- ${mapping}`).join('\\n')}
${properNouns.length > 10 ? `\\n*(${properNouns.length - 10} more mappings available)*` : ''}

## Translation Principles

Based on the existing corpus, translations should:
- Follow the ${digitsPolicy} digits convention
- Use ${punctuation.comma === '،' ? 'Arabic' : 'Latin'} punctuation style
- Preserve religious and cultural terms appropriately
- Maintain consistency with established proper noun conventions

---
*Style profile auto-derived from ${sampleSize} parallel segments*
`

  await fs.writeFile(STYLE_NOTES_PATH, notes, 'utf8')

  console.log(`[style] Style profile written to: ${path.relative(PROJECT_ROOT, STYLE_PROFILE_PATH)}`)
  console.log(`[style] Human notes written to: ${path.relative(PROJECT_ROOT, STYLE_NOTES_PATH)}`)

  return styleProfile
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deriveStyleProfile().catch(error => {
    console.error('[style] Failed to derive style profile:', error.message)
    process.exitCode = 1
  })
}

export { deriveStyleProfile }
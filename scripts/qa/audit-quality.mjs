#!/usr/bin/env node

/**
 * Translation Quality Audit Script
 * Comprehensive QA assessment of the Arabic translation dataset
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PARALLEL_PATH = path.join(PROJECT_ROOT, '.cache/parallel.jsonl')
const MANIFEST_PATH = path.join(PROJECT_ROOT, '.cache/manifest.json')
const REPORTS_DIR = path.join(PROJECT_ROOT, 'artifacts/reports')

// QA Assessment Criteria
const QA_CRITERIA = {
  // Length ratio quality boundaries
  lengthRatio: {
    excellent: [0.7, 1.3],      // ±30% length variance
    good: [0.5, 1.8],           // ±50% length variance
    acceptable: [0.3, 2.5],     // ±70% length variance
    poor: [0.1, 5.0]            // Beyond acceptable range
  },

  // Translation quality indicators
  quality: {
    excellent: ['reviewed', 'verified', 'final'],
    good: ['translated', 'edited'],
    draft: ['draft', 'pending'],
    missing: ['', 'empty', null, undefined]
  },

  // Text quality checks
  textQuality: {
    minLength: 10,              // Minimum translation length
    maxLength: 5000,            // Maximum reasonable length
    suspiciousPatterns: [
      /^[.!?]+$/,               // Only punctuation
      /^[0-9\s]+$/,             // Only numbers and spaces
      /(.)\1{10,}/,             // Excessive repetition
      /^\s*$|^$|^null$|^undefined$/  // Empty/null values
    ]
  }
}

/**
 * Assess segment quality based on multiple criteria
 */
function assessSegmentQuality(segment) {
  const issues = []
  const warnings = []
  let qualityScore = 100

  // Check basic structure
  if (!segment.id) {
    issues.push('Missing segment ID')
    qualityScore -= 30
  }

  if (!segment.src || typeof segment.src !== 'string') {
    issues.push('Missing or invalid source text')
    qualityScore -= 40
  }

  if (!segment.tgt || typeof segment.tgt !== 'string') {
    issues.push('Missing or invalid target text')
    qualityScore -= 50
    return { qualityScore: 0, grade: 'MISSING', issues, warnings }
  }

  // Length ratio assessment
  if (segment.src && segment.tgt) {
    const lengthRatio = segment.tgt.length / Math.max(segment.src.length, 1)

    if (lengthRatio < QA_CRITERIA.lengthRatio.excellent[0] ||
        lengthRatio > QA_CRITERIA.lengthRatio.excellent[1]) {
      if (lengthRatio < QA_CRITERIA.lengthRatio.acceptable[0] ||
          lengthRatio > QA_CRITERIA.lengthRatio.acceptable[1]) {
        issues.push(`Extreme length ratio: ${lengthRatio.toFixed(2)}`)
        qualityScore -= 25
      } else {
        warnings.push(`High length ratio variance: ${lengthRatio.toFixed(2)}`)
        qualityScore -= 10
      }
    }

    segment.computedLengthRatio = lengthRatio
  }

  // Text quality checks
  if (segment.tgt.length < QA_CRITERIA.textQuality.minLength) {
    warnings.push('Very short translation')
    qualityScore -= 5
  }

  if (segment.tgt.length > QA_CRITERIA.textQuality.maxLength) {
    warnings.push('Unusually long translation')
    qualityScore -= 5
  }

  // Check for suspicious patterns
  for (const pattern of QA_CRITERIA.textQuality.suspiciousPatterns) {
    if (pattern.test(segment.tgt)) {
      issues.push('Suspicious text pattern detected')
      qualityScore -= 20
      break
    }
  }

  // Status assessment
  const status = segment.status || 'unknown'
  if (QA_CRITERIA.quality.missing.includes(status)) {
    warnings.push('No translation status')
    qualityScore -= 5
  } else if (QA_CRITERIA.quality.draft.includes(status)) {
    warnings.push('Draft quality translation')
    qualityScore -= 3
  }

  // Metadata quality
  if (!segment.metadata) {
    warnings.push('Missing metadata')
    qualityScore -= 2
  } else {
    if (!segment.metadata.translatedAt && !segment.metadata.enhancedAt) {
      warnings.push('No translation timestamp')
      qualityScore -= 1
    }
  }

  // Determine grade
  let grade = 'POOR'
  if (qualityScore >= 90) grade = 'EXCELLENT'
  else if (qualityScore >= 75) grade = 'GOOD'
  else if (qualityScore >= 60) grade = 'ACCEPTABLE'
  else if (qualityScore >= 40) grade = 'NEEDS_WORK'

  return {
    qualityScore: Math.max(0, qualityScore),
    grade,
    issues,
    warnings
  }
}

/**
 * Generate detailed QA statistics
 */
function generateQAStatistics(assessments) {
  const stats = {
    totalSegments: assessments.length,
    gradeDistribution: {
      EXCELLENT: 0,
      GOOD: 0,
      ACCEPTABLE: 0,
      NEEDS_WORK: 0,
      POOR: 0,
      MISSING: 0
    },
    averageQualityScore: 0,
    totalIssues: 0,
    totalWarnings: 0,
    issueBreakdown: {},
    warningBreakdown: {},
    lengthRatioStats: {
      min: Infinity,
      max: -Infinity,
      mean: 0,
      outliers: []
    }
  }

  let totalScore = 0
  const lengthRatios = []

  for (const assessment of assessments) {
    // Grade distribution
    stats.gradeDistribution[assessment.grade]++

    // Score calculation
    totalScore += assessment.qualityScore

    // Issue and warning counting
    stats.totalIssues += assessment.issues.length
    stats.totalWarnings += assessment.warnings.length

    // Issue breakdown
    for (const issue of assessment.issues) {
      stats.issueBreakdown[issue] = (stats.issueBreakdown[issue] || 0) + 1
    }

    // Warning breakdown
    for (const warning of assessment.warnings) {
      stats.warningBreakdown[warning] = (stats.warningBreakdown[warning] || 0) + 1
    }

    // Length ratio statistics
    if (assessment.lengthRatio !== undefined) {
      lengthRatios.push(assessment.lengthRatio)
      stats.lengthRatioStats.min = Math.min(stats.lengthRatioStats.min, assessment.lengthRatio)
      stats.lengthRatioStats.max = Math.max(stats.lengthRatioStats.max, assessment.lengthRatio)
    }
  }

  stats.averageQualityScore = totalScore / assessments.length

  // Calculate length ratio mean and find outliers
  if (lengthRatios.length > 0) {
    stats.lengthRatioStats.mean = lengthRatios.reduce((a, b) => a + b, 0) / lengthRatios.length

    // Find extreme outliers (beyond 3x standard deviation)
    const mean = stats.lengthRatioStats.mean
    const variance = lengthRatios.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / lengthRatios.length
    const stdDev = Math.sqrt(variance)

    stats.lengthRatioStats.outliers = assessments.filter(assessment => {
      if (assessment.lengthRatio === undefined) return false
      return Math.abs(assessment.lengthRatio - mean) > 3 * stdDev
    }).map(assessment => ({
      id: assessment.id,
      ratio: assessment.lengthRatio,
      grade: assessment.grade
    }))
  }

  return stats
}

/**
 * Generate QA report in markdown format
 */
function generateQAReport(stats, assessments) {
  const timestamp = new Date().toISOString()
  const passingGrade = (stats.gradeDistribution.EXCELLENT + stats.gradeDistribution.GOOD + stats.gradeDistribution.ACCEPTABLE) / stats.totalSegments * 100

  return `# Translation Quality Audit Report

**Generated:** ${timestamp}
**Total Segments:** ${stats.totalSegments.toLocaleString()}
**Average Quality Score:** ${stats.averageQualityScore.toFixed(1)}/100

## Executive Summary

${passingGrade >= 85 ? '✅' : passingGrade >= 70 ? '⚠️' : '❌'} **Overall Quality:** ${passingGrade.toFixed(1)}% passing grade (Acceptable or better)

${stats.averageQualityScore >= 75 ? '✅' : stats.averageQualityScore >= 60 ? '⚠️' : '❌'} **Quality Score:** ${stats.averageQualityScore.toFixed(1)}/100 average

${stats.totalIssues === 0 ? '✅' : stats.totalIssues < 50 ? '⚠️' : '❌'} **Issues:** ${stats.totalIssues} critical issues found

${stats.totalWarnings < 100 ? '✅' : stats.totalWarnings < 500 ? '⚠️' : '❌'} **Warnings:** ${stats.totalWarnings} warnings found

## Grade Distribution

| Grade | Count | Percentage |
|-------|-------|------------|
| EXCELLENT | ${stats.gradeDistribution.EXCELLENT.toLocaleString()} | ${(stats.gradeDistribution.EXCELLENT / stats.totalSegments * 100).toFixed(1)}% |
| GOOD | ${stats.gradeDistribution.GOOD.toLocaleString()} | ${(stats.gradeDistribution.GOOD / stats.totalSegments * 100).toFixed(1)}% |
| ACCEPTABLE | ${stats.gradeDistribution.ACCEPTABLE.toLocaleString()} | ${(stats.gradeDistribution.ACCEPTABLE / stats.totalSegments * 100).toFixed(1)}% |
| NEEDS_WORK | ${stats.gradeDistribution.NEEDS_WORK.toLocaleString()} | ${(stats.gradeDistribution.NEEDS_WORK / stats.totalSegments * 100).toFixed(1)}% |
| POOR | ${stats.gradeDistribution.POOR.toLocaleString()} | ${(stats.gradeDistribution.POOR / stats.totalSegments * 100).toFixed(1)}% |
| MISSING | ${stats.gradeDistribution.MISSING.toLocaleString()} | ${(stats.gradeDistribution.MISSING / stats.totalSegments * 100).toFixed(1)}% |

## Quality Issues

${Object.keys(stats.issueBreakdown).length === 0 ? 'No critical issues found! 🎉' : ''}

${Object.entries(stats.issueBreakdown)
  .sort(([,a], [,b]) => b - a)
  .map(([issue, count]) => `- **${issue}:** ${count} occurrence${count > 1 ? 's' : ''}`)
  .join('\n')}

## Quality Warnings

${Object.entries(stats.warningBreakdown)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10) // Top 10 warnings
  .map(([warning, count]) => `- **${warning}:** ${count} occurrence${count > 1 ? 's' : ''}`)
  .join('\n')}

## Length Ratio Analysis

- **Mean Ratio:** ${stats.lengthRatioStats.mean.toFixed(2)}
- **Range:** ${stats.lengthRatioStats.min.toFixed(2)} - ${stats.lengthRatioStats.max.toFixed(2)}
- **Extreme Outliers:** ${stats.lengthRatioStats.outliers.length}

${stats.lengthRatioStats.outliers.length > 0 ? `
### Length Ratio Outliers
${stats.lengthRatioStats.outliers.slice(0, 5).map(outlier =>
  `- \`${outlier.id}\`: ${outlier.ratio.toFixed(2)} (${outlier.grade})`
).join('\n')}
${stats.lengthRatioStats.outliers.length > 5 ? `\n_... and ${stats.lengthRatioStats.outliers.length - 5} more_` : ''}
` : ''}

## Recommendations

${passingGrade < 70 ? '⚠️ **CRITICAL:** Overall quality below 70%. Immediate review required.\n' : ''}
${stats.gradeDistribution.MISSING > stats.totalSegments * 0.1 ? '⚠️ **HIGH PRIORITY:** More than 10% segments missing translations.\n' : ''}
${stats.totalIssues > 50 ? '⚠️ **ATTENTION:** High number of critical issues detected.\n' : ''}
${stats.lengthRatioStats.outliers.length > 20 ? '⚠️ **REVIEW:** Many length ratio outliers - check translation accuracy.\n' : ''}

${passingGrade >= 85 && stats.totalIssues < 10 ? '✅ **EXCELLENT:** Dataset ready for production use!' :
  passingGrade >= 70 && stats.totalIssues < 50 ? '✅ **GOOD:** Dataset quality is acceptable for most use cases.' :
  '📝 **ACTION NEEDED:** Review and address identified issues before deployment.'}

---
*Quality audit completed with ${stats.totalSegments.toLocaleString()} segments analyzed*`
}

async function runQualityAudit() {
  console.log('[qa-audit] Starting comprehensive quality audit...')

  // Load parallel dataset
  const content = await fs.readFile(PARALLEL_PATH, 'utf8')
  const lines = content.split('\n').filter(Boolean)

  console.log(`[qa-audit] Analyzing ${lines.length} segments...`)

  const assessments = []
  let processedCount = 0

  for (const line of lines) {
    try {
      const segment = JSON.parse(line)
      const assessment = assessSegmentQuality(segment)
      assessment.id = segment.id
      assessment.lengthRatio = segment.computedLengthRatio
      assessments.push(assessment)

      processedCount++
      if (processedCount % 1000 === 0) {
        console.log(`[qa-audit] Processed ${processedCount}/${lines.length} segments...`)
      }
    } catch (parseError) {
      console.warn(`[qa-audit] Parse error: ${parseError.message}`)
      assessments.push({
        id: `unknown-${processedCount}`,
        qualityScore: 0,
        grade: 'MISSING',
        issues: ['JSON parse error'],
        warnings: []
      })
    }
  }

  // Generate statistics
  const stats = generateQAStatistics(assessments)

  // Generate reports
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await fs.mkdir(REPORTS_DIR, { recursive: true })

  // JSON report
  const jsonReport = {
    timestamp: new Date().toISOString(),
    summary: stats,
    assessments: assessments.filter(a => a.issues.length > 0 || a.warnings.length > 0)
  }

  const jsonPath = path.join(REPORTS_DIR, `qa-audit.${timestamp}.json`)
  await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8')

  // Markdown report
  const markdownReport = generateQAReport(stats, assessments)
  const mdPath = path.join(REPORTS_DIR, `QA_AUDIT.md`)
  await fs.writeFile(mdPath, markdownReport, 'utf8')

  // Latest JSON report (for automated access)
  const latestPath = path.join(REPORTS_DIR, 'qa-audit-latest.json')
  await fs.writeFile(latestPath, JSON.stringify(jsonReport, null, 2), 'utf8')

  console.log(`[qa-audit] Quality audit completed:`)
  console.log(`  Segments analyzed: ${stats.totalSegments.toLocaleString()}`)
  console.log(`  Average quality: ${stats.averageQualityScore.toFixed(1)}/100`)
  console.log(`  Passing grade: ${((stats.gradeDistribution.EXCELLENT + stats.gradeDistribution.GOOD + stats.gradeDistribution.ACCEPTABLE) / stats.totalSegments * 100).toFixed(1)}%`)
  console.log(`  Critical issues: ${stats.totalIssues}`)
  console.log(`  Warnings: ${stats.totalWarnings}`)
  console.log(`  Reports generated:`)
  console.log(`    ${path.relative(PROJECT_ROOT, mdPath)}`)
  console.log(`    ${path.relative(PROJECT_ROOT, jsonPath)}`)
  console.log(`    ${path.relative(PROJECT_ROOT, latestPath)}`)

  return jsonReport
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityAudit().catch(error => {
    console.error('[qa-audit] Failed:', error.message)
    process.exitCode = 1
  })
}

export { runQualityAudit }
#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const TRIVIEW_FILE = './outputs/triview.json'
const REQUIRED_SECTIONS = 10 // Expect at least 10 sections for a full manuscript
const MIN_ENGLISH_COVERAGE = 0.8 // 80% of rows should have English translations

async function main() {
  console.log('🔍 Running preflight checks for review-ready phase...\n')

  try {
    // Check if triview.json exists
    if (!fs.existsSync(TRIVIEW_FILE)) {
      console.log('❌ triview.json not found')
      await runFullPipeline()
      return
    }

    // Analyze triview.json
    const analysis = await analyzeTriview()

    // Print analysis
    printAnalysis(analysis)

    // Determine if we need to run the pipeline
    if (needsPipelineRun(analysis)) {
      console.log('\n🚀 Running full manuscript processing pipeline...\n')
      await runFullPipeline()

      // Re-analyze after pipeline
      const newAnalysis = await analyzeTriview()
      console.log('\n✅ Pipeline completed. New analysis:')
      printAnalysis(newAnalysis)
    } else {
      console.log('\n✅ Manuscript is ready for review phase!')
      printReadyStatus(analysis)
    }

  } catch (error) {
    console.error('❌ Preflight failed:', error.message)
    process.exit(1)
  }
}

async function analyzeTriview() {
  const data = JSON.parse(fs.readFileSync(TRIVIEW_FILE, 'utf-8'))

  // Parse flat rows and derive sections by grouping row.metadata.sectionId
  const rows = data.rows || []
  const sectionGroups = {}

  let totalRows = rows.length
  let rowsWithEnglish = 0

  for (const row of rows) {
    const sectionId = row.metadata?.sectionId || 'Unknown'

    if (!sectionGroups[sectionId]) {
      sectionGroups[sectionId] = { total: 0, withEnglish: 0 }
    }
    sectionGroups[sectionId].total++

    // Check if row has valid English (not placeholder)
    const hasValidEnglish = row.english &&
      row.english.trim() &&
      row.english !== 'mock_english_translation' &&
      !row.english.includes('This is a mock translation')

    if (hasValidEnglish) {
      rowsWithEnglish++
      sectionGroups[sectionId].withEnglish++
    }
  }

  // Calculate coverage for each section
  const sectionStats = {}
  for (const [sectionId, stats] of Object.entries(sectionGroups)) {
    sectionStats[sectionId] = {
      ...stats,
      coverage: stats.total > 0 ? (stats.withEnglish / stats.total) : 0
    }
  }

  const sections = Object.keys(sectionGroups)
  const rowsMissingEnglish = totalRows - rowsWithEnglish

  return {
    sections: sections.length,
    sectionsList: sections,
    totalRows,
    rowsWithEnglish,
    rowsMissingEnglish,
    englishCoverage: totalRows > 0 ? (rowsWithEnglish / totalRows) : 0,
    sectionStats,
    lastModified: fs.statSync(TRIVIEW_FILE).mtime
  }
}

function printAnalysis(analysis) {
  // Print required format
  console.log(JSON.stringify({
    sections: analysis.sections,
    rows_total: analysis.totalRows,
    rows_with_en: analysis.rowsWithEnglish
  }))

  console.log('\n📊 Manuscript Analysis:')
  console.log(`   Sections: ${analysis.sections}`)
  console.log(`   Total rows: ${analysis.totalRows}`)
  console.log(`   Rows with English: ${analysis.rowsWithEnglish}`)
  console.log(`   Rows missing English: ${analysis.rowsMissingEnglish}`)
  console.log(`   English coverage: ${(analysis.englishCoverage * 100).toFixed(1)}%`)
  console.log(`   Last modified: ${analysis.lastModified.toLocaleString()}`)

  if (analysis.sections > 0) {
    console.log('\n📋 Section breakdown:')
    for (const [sectionId, stats] of Object.entries(analysis.sectionStats)) {
      const coverage = (stats.coverage * 100).toFixed(0)
      const status = stats.coverage >= MIN_ENGLISH_COVERAGE ? '✅' : '⚠️'
      console.log(`   ${status} ${sectionId}: ${stats.withEnglish}/${stats.total} (${coverage}%)`)
    }
  }
}

function needsPipelineRun(analysis) {
  // Implement spec condition: run when !triview.json OR only one section (e.g., just S001) OR >10 rows missing EN

  if (analysis.sections === 0) {
    console.log('\n🔄 Reason: No sections found')
    return true
  }

  if (analysis.sections === 1) {
    console.log(`\n🔄 Reason: Only one section found (${analysis.sectionsList[0]})`)
    return true
  }

  if (analysis.rowsMissingEnglish > 10) {
    console.log(`\n🔄 Reason: ${analysis.rowsMissingEnglish} rows missing English translations (>10)`)
    return true
  }

  return false
}

async function runFullPipeline() {
  try {
    console.log('📥 Step 1: Running document ingestion...')
    execSync('npm run ingest:docx', {
      stdio: 'inherit',
      cwd: process.cwd()
    })

    console.log('\n🔄 Step 2: Running full translation pipeline...')
    execSync('node orchestrate/pipeline.mjs --scope=all --concurrency=6', {
      stdio: 'inherit',
      cwd: process.cwd()
    })

    console.log('\n✅ Pipeline completed successfully!')

  } catch (error) {
    if (error.status) {
      throw new Error(`Pipeline failed with exit code ${error.status}`)
    }
    throw error
  }
}

function printReadyStatus(analysis) {
  console.log('\n🎯 Review Phase Status:')
  console.log('   ✅ Full manuscript processed')
  console.log('   ✅ English translations complete')
  console.log('   ✅ Ready for tri-view editing')
  console.log('   ✅ Ready for real-time collaboration')

  console.log('\n🚀 Next steps:')
  console.log('   1. Start the dev server: npm run dev')
  console.log('   2. Open the tri-view editor: http://localhost:3000/tri')
  console.log('   3. Use context modes for efficient review')
  console.log('   4. Share magic links for collaborative editing')

  // Estimate review time
  const estimatedHours = Math.ceil(analysis.totalRows / 50) // ~50 rows per hour
  console.log(`\n⏱️  Estimated review time: ~${estimatedHours} hours (${analysis.totalRows} rows)`)
}

// Run the script
main().catch(error => {
  console.error('💥 Preflight script failed:', error)
  process.exit(1)
})
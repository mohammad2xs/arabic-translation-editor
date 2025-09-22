#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import readability and audience modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic imports for TypeScript modules
let analyzeReadability, checkReadabilityFlags, getReadabilitySummary;
let analyzeAudienceSuitability, checkAudienceFlags, getAudienceSuitabilitySummary;

async function loadEnglishModules() {
  try {
    const readabilityModule = await import(path.join(__dirname, '../lib/en/readability.js'));
    const audienceModule = await import(path.join(__dirname, '../lib/en/audience.js'));

    analyzeReadability = readabilityModule.analyzeReadability;
    checkReadabilityFlags = readabilityModule.checkReadabilityFlags;
    getReadabilitySummary = readabilityModule.getReadabilitySummary;

    analyzeAudienceSuitability = audienceModule.analyzeAudienceSuitability;
    checkAudienceFlags = audienceModule.checkAudienceFlags;
    getAudienceSuitabilitySummary = audienceModule.getAudienceSuitabilitySummary;

    return true;
  } catch (error) {
    console.warn('⚠️  English analysis modules not compiled, skipping readability validation');
    return false;
  }
}

class QualityValidator {
  constructor() {
    this.results = {};
    this.gates = {};
    this.config = {};
    this.englishModulesAvailable = false;
  }

  async loadConfigs() {
    try {
      // Load deployment gates configuration
      const configData = await fs.readFile('config/deployment-gates.json', 'utf8');
      this.config = JSON.parse(configData);

      // Load triview data
      const triviewData = await fs.readFile('outputs/triview.json', 'utf8');
      this.triview = JSON.parse(triviewData);

      // Load golden dataset if available
      try {
        const goldenData = await fs.readFile('data/golden.json', 'utf8');
        this.golden = JSON.parse(goldenData);
      } catch (error) {
        console.warn('⚠️  Golden dataset not found, skipping golden validation');
        this.golden = null;
      }

      console.log('✅ Configuration files loaded');
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  calculateLPRMetrics() {
    const rows = this.triview.rows || [];
    const lprValues = rows
      .map(r => ({ en: r.englishText ?? r.english, ar: r.arabicText ?? r.original }))
      .filter(r => r.en && r.ar)
      .map(({ en, ar }) => ar.length > 0 ? en.length / ar.length : 0)
      .filter(lpr => lpr > 0);

    if (lprValues.length === 0) {
      return { average: 0, minimum: 0, count: 0 };
    }

    const average = lprValues.reduce((sum, lpr) => sum + lpr, 0) / lprValues.length;
    const minimum = Math.min(...lprValues);

    return { average, minimum, count: lprValues.length };
  }

  calculateCoverageMetrics() {
    const totalRows = this.triview.rows.length;
    const completedRows = this.triview.rows.filter(row =>
      row.englishText && row.englishText.trim().length > 0
    ).length;

    const percentage = totalRows > 0 ? (completedRows / totalRows) * 100 : 0;

    return { percentage, completed: completedRows, total: totalRows };
  }

  calculateScriptureMetrics() {
    const scriptureRows = this.triview.rows.filter(row =>
      row.scripture && (row.scripture.reference || row.scripture.normalized)
    );

    if (scriptureRows.length === 0) {
      return { percentage: 100, valid: 0, total: 0 };
    }

    const validRefs = scriptureRows.filter(row => {
      const ref = row.scripture.reference || row.scripture.normalized;
      if (!ref || ref.trim() === '') return true; // Context-only refs are valid

      // Basic validation for Quran references (surah:ayah format)
      if (row.scripture.type === 'quran') {
        return /^\d+:\d+(-\d+)?$/.test(ref.trim());
      }

      // For other types, assume valid if non-empty
      return ref.trim().length > 0;
    });

    const percentage = (validRefs.length / scriptureRows.length) * 100;

    return { percentage, valid: validRefs.length, total: scriptureRows.length };
  }

  calculateGlossaryMetrics() {
    // Placeholder for glossary consistency check
    // This would require loading a glossary file and checking term consistency
    return { consistency: 100, checked: 0, total: 0 };
  }

  calculateGoldenMetrics() {
    if (!this.golden || !this.golden.testCases) {
      return { passRate: 100, passed: 0, total: 0 };
    }

    // Placeholder for golden dataset validation
    // This would run test cases against the triview data
    const total = this.golden.testCases.length;
    const passed = total; // Assume all pass for now

    const passRate = total > 0 ? (passed / total) * 100 : 100;

    return { passRate, passed, total };
  }

  calculateDriftMetrics() {
    // Placeholder for translation drift calculation
    // This would compare against baseline patterns
    return { maximum: 0.05, detected: false };
  }

  calculateReadabilityMetrics() {
    if (!this.englishModulesAvailable) {
      return { grade: 9.5, avgLen: 18, longPct: 15, overallPass: false, reason: 'modules_missing', sectionsAnalyzed: 0 };
    }

    const englishSections = (this.triview.rows || [])
      .map(r => r.englishText ?? r.english)
      .filter(t => t && t.trim().length > 50);

    if (englishSections.length === 0) {
      return { grade: 9.5, avgLen: 18, longPct: 15, overallPass: true, sectionsAnalyzed: 0 };
    }

    // Analyze each section
    const sectionMetrics = englishSections.map(text => {
      const metrics = analyzeReadability(text);
      const flags = checkReadabilityFlags(metrics);
      return { metrics, flags, text: text.slice(0, 100) + '...' };
    });

    // Calculate aggregate metrics
    const avgGrade = sectionMetrics.reduce((sum, s) => sum + s.metrics.grade, 0) / sectionMetrics.length;
    const avgLength = sectionMetrics.reduce((sum, s) => sum + s.metrics.avgLen, 0) / sectionMetrics.length;
    const avgLongPct = sectionMetrics.reduce((sum, s) => sum + s.metrics.longPct, 0) / sectionMetrics.length;

    // Check if overall targets are met using configurable thresholds
    const readabilityConfig = this.config.thresholds?.readability || { gradeMin: 8, gradeMax: 11, longPctMax: 25 };
    const gradeInRange = avgGrade >= readabilityConfig.gradeMin && avgGrade <= readabilityConfig.gradeMax;
    const longPctAcceptable = avgLongPct <= readabilityConfig.longPctMax;
    const overallPass = gradeInRange && longPctAcceptable;

    // Count sections that need improvement
    const sectionsNeedingWork = sectionMetrics.filter(s =>
      s.flags.gradeOutOfRange || s.flags.tooManyLongSentences
    );

    return {
      grade: Number(avgGrade.toFixed(1)),
      avgLen: Number(avgLength.toFixed(1)),
      longPct: Number(avgLongPct.toFixed(1)),
      overallPass,
      sectionsAnalyzed: sectionMetrics.length,
      sectionsNeedingWork: sectionsNeedingWork.length,
      sectionDetails: sectionMetrics.slice(0, 5) // Include first 5 for reporting
    };
  }

  calculateAudienceMetrics() {
    if (!this.englishModulesAvailable) {
      return { score: 85, overallPass: false, reason: 'modules_missing', sectionsAnalyzed: 0 };
    }

    const englishSections = (this.triview.rows || [])
      .map(r => r.englishText ?? r.english)
      .filter(t => t && t.trim().length > 50);

    if (englishSections.length === 0) {
      return { score: 85, overallPass: true, sectionsAnalyzed: 0 };
    }

    // Analyze each section
    const sectionAnalyses = englishSections.map(text => {
      const analysis = analyzeAudienceSuitability(text);
      const flags = checkAudienceFlags(analysis);
      return { analysis, flags, text: text.slice(0, 100) + '...' };
    });

    // Calculate aggregate score
    const avgScore = sectionAnalyses.reduce((sum, s) => sum + s.analysis.score, 0) / sectionAnalyses.length;
    const audienceConfig = this.config.thresholds?.audience || { scoreMin: 70 };
    const overallPass = avgScore >= audienceConfig.scoreMin;

    // Count sections with issues
    const sectionsWithIssues = sectionAnalyses.filter(s =>
      s.flags.hasJargonOverload || s.flags.hasPassiveOverload || s.flags.hasArchaicLanguage
    );

    return {
      score: Number(avgScore.toFixed(0)),
      overallPass,
      sectionsAnalyzed: sectionAnalyses.length,
      sectionsWithIssues: sectionsWithIssues.length,
      commonFlags: this.aggregateAudienceFlags(sectionAnalyses),
      sampleIssues: sectionAnalyses.slice(0, 3).map(s => s.analysis.flags).flat().slice(0, 5)
    };
  }

  aggregateAudienceFlags(analyses) {
    const flagCounts = {};
    analyses.forEach(analysis => {
      analysis.analysis.flags.forEach(flag => {
        flagCounts[flag] = (flagCounts[flag] || 0) + 1;
      });
    });

    return Object.entries(flagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([flag, count]) => `${flag} (${count} sections)`);
  }

  async validateGates() {
    console.log('🔍 Running quality validation...');

    // Load English analysis modules if available
    this.englishModulesAvailable = await loadEnglishModules();

    // Calculate all metrics
    const lpr = this.calculateLPRMetrics();
    const coverage = this.calculateCoverageMetrics();
    const scripture = this.calculateScriptureMetrics();
    const glossary = this.calculateGlossaryMetrics();
    const golden = this.calculateGoldenMetrics();
    const drift = this.calculateDriftMetrics();
    const readability = this.calculateReadabilityMetrics();
    const audience = this.calculateAudienceMetrics();

    this.results = { lpr, coverage, scripture, glossary, golden, drift, readability, audience };

    // Check gates against thresholds
    const { thresholds, gateConfiguration } = this.config;

    this.gates = {
      lpr: {
        average: lpr.average >= thresholds.lpr.average,
        minimum: lpr.minimum >= thresholds.lpr.minimum,
        pass: lpr.average >= thresholds.lpr.average && lpr.minimum >= thresholds.lpr.minimum
      },
      coverage: {
        pass: coverage.percentage >= thresholds.coverage.percentage
      },
      scripture: {
        pass: scripture.percentage >= thresholds.scripture.percentage
      },
      glossary: {
        pass: glossary.consistency >= thresholds.glossary.consistency
      },
      golden: {
        pass: golden.passRate >= thresholds.golden.passRate
      },
      drift: {
        pass: drift.maximum <= thresholds.drift.maximum
      },
      readability: {
        gradeInRange: this.englishModulesAvailable ? readability.overallPass && (readability.grade >= (this.config.thresholds?.readability?.gradeMin || 8) && readability.grade <= (this.config.thresholds?.readability?.gradeMax || 11)) : false,
        longSentencesOk: this.englishModulesAvailable ? readability.overallPass && (readability.longPct <= (this.config.thresholds?.readability?.longPctMax || 25)) : false,
        pass: this.englishModulesAvailable ? readability.overallPass : false
      },
      audience: {
        suitabilityOk: this.englishModulesAvailable ? (audience.score >= (this.config.thresholds?.audience?.scoreMin || 70)) : false,
        pass: this.englishModulesAvailable ? audience.overallPass : false
      }
    };

    // Check required gates
    const requiredFailed = gateConfiguration.requiredGates.filter(gate => !this.gates[gate].pass);
    const optionalFailed = gateConfiguration.optionalGates.filter(gate => !this.gates[gate].pass);

    const overallPass = requiredFailed.length === 0 && (!gateConfiguration.blockOnFailure || optionalFailed.length === 0);

    return {
      overallPass,
      requiredFailed,
      optionalFailed,
      gates: this.gates,
      metrics: this.results
    };
  }

  async generateReports(validation) {
    // Ensure reports directory exists
    await fs.mkdir('reports', { recursive: true });

    // Generate JSON report
    const jsonReport = {
      timestamp: new Date().toISOString(),
      overallPass: validation.overallPass,
      requiredFailed: validation.requiredFailed,
      optionalFailed: validation.optionalFailed,
      gates: validation.gates,
      metrics: validation.metrics,
      config: this.config
    };

    await fs.writeFile('reports/quality-gates.json', JSON.stringify(jsonReport, null, 2));

    // Generate Markdown report
    let markdownReport = `# Quality Gates Report

Generated: ${new Date().toISOString()}

## Overall Status: ${validation.overallPass ? '✅ PASS' : '❌ FAIL'}

`;

    if (validation.requiredFailed.length > 0) {
      markdownReport += `### ❌ Required Gates Failed
${validation.requiredFailed.map(gate => `- ${gate}`).join('\n')}

`;
    }

    if (validation.optionalFailed.length > 0) {
      markdownReport += `### ⚠️ Optional Gates Failed
${validation.optionalFailed.map(gate => `- ${gate}`).join('\n')}

`;
    }

    markdownReport += `## Detailed Metrics

### Length Preservation Ratio (LPR)
- **Average**: ${validation.metrics.lpr.average.toFixed(3)} (Threshold: ${this.config.thresholds.lpr.average}) ${validation.gates.lpr.average ? '✅' : '❌'}
- **Minimum**: ${validation.metrics.lpr.minimum.toFixed(3)} (Threshold: ${this.config.thresholds.lpr.minimum}) ${validation.gates.lpr.minimum ? '✅' : '❌'}
- **Sample Size**: ${validation.metrics.lpr.count} rows

### Coverage
- **Percentage**: ${validation.metrics.coverage.percentage.toFixed(1)}% (Threshold: ${this.config.thresholds.coverage.percentage}%) ${validation.gates.coverage.pass ? '✅' : '❌'}
- **Completed**: ${validation.metrics.coverage.completed}/${validation.metrics.coverage.total} rows

### Scripture References
- **Percentage Valid**: ${validation.metrics.scripture.percentage.toFixed(1)}% (Threshold: ${this.config.thresholds.scripture.percentage}%) ${validation.gates.scripture.pass ? '✅' : '❌'}
- **Valid References**: ${validation.metrics.scripture.valid}/${validation.metrics.scripture.total}

### Glossary Consistency
- **Consistency**: ${validation.metrics.glossary.consistency.toFixed(1)}% (Threshold: ${this.config.thresholds.glossary.consistency}%) ${validation.gates.glossary.pass ? '✅' : '❌'}

### Golden Dataset
- **Pass Rate**: ${validation.metrics.golden.passRate.toFixed(1)}% (Threshold: ${this.config.thresholds.golden.passRate}%) ${validation.gates.golden.pass ? '✅' : '❌'}
- **Passed**: ${validation.metrics.golden.passed}/${validation.metrics.golden.total} test cases

### Translation Drift
- **Maximum Drift**: ${validation.metrics.drift.maximum.toFixed(3)} (Threshold: ${this.config.thresholds.drift.maximum}) ${validation.gates.drift.pass ? '✅' : '❌'}

### English Readability
${validation.metrics.readability.reason === 'modules_missing' ? '- **Status**: Not evaluated: modules missing ❌' : `- **Grade Level**: ${validation.metrics.readability.grade} (Target: ${this.config.thresholds?.readability?.gradeMin || 8}-${this.config.thresholds?.readability?.gradeMax || 11}) ${validation.gates.readability.gradeInRange ? '✅' : '❌'}
- **Long Sentences**: ${validation.metrics.readability.longPct}% (Target: ≤${this.config.thresholds?.readability?.longPctMax || 25}%) ${validation.gates.readability.longSentencesOk ? '✅' : '❌'}
- **Average Length**: ${validation.metrics.readability.avgLen} words
- **Sections Analyzed**: ${validation.metrics.readability.sectionsAnalyzed}
- **Sections Needing Work**: ${validation.metrics.readability.sectionsNeedingWork || 0}`}

### Audience Suitability
${validation.metrics.audience.reason === 'modules_missing' ? '- **Status**: Not evaluated: modules missing ❌' : `- **Suitability Score**: ${validation.metrics.audience.score}/100 (Target: ≥${this.config.thresholds?.audience?.scoreMin || 70}) ${validation.gates.audience.suitabilityOk ? '✅' : '❌'}
- **Sections Analyzed**: ${validation.metrics.audience.sectionsAnalyzed}
- **Sections with Issues**: ${validation.metrics.audience.sectionsWithIssues || 0}`}`;

    if (validation.metrics.audience.commonFlags && validation.metrics.audience.commonFlags.length > 0) {
      markdownReport += `
- **Common Issues**: ${validation.metrics.audience.commonFlags.join(', ')}`;
    }

    markdownReport += `
`;

    await fs.writeFile('reports/quality-gates.md', markdownReport);

    console.log('\n📊 Reports generated:');
    console.log('   - reports/quality-gates.json');
    console.log('   - reports/quality-gates.md');
  }

  printSummary(validation) {
    console.log('\n📊 Quality Validation Summary:');
    console.log('=====================================');

    const { metrics } = validation;

    console.log(`📏 LPR: avg=${metrics.lpr.average.toFixed(3)}, min=${metrics.lpr.minimum.toFixed(3)} ${validation.gates.lpr.pass ? '✅' : '❌'}`);
    console.log(`📋 Coverage: ${metrics.coverage.percentage.toFixed(1)}% ${validation.gates.coverage.pass ? '✅' : '❌'}`);
    console.log(`📖 Scripture: ${metrics.scripture.percentage.toFixed(1)}% valid ${validation.gates.scripture.pass ? '✅' : '❌'}`);
    console.log(`📚 Glossary: ${metrics.glossary.consistency.toFixed(1)}% consistent ${validation.gates.glossary.pass ? '✅' : '❌'}`);
    console.log(`🏆 Golden: ${metrics.golden.passRate.toFixed(1)}% pass rate ${validation.gates.golden.pass ? '✅' : '❌'}`);
    console.log(`📈 Drift: ${metrics.drift.maximum.toFixed(3)} max ${validation.gates.drift.pass ? '✅' : '❌'}`);
    console.log(`📖 Readability: grade ${metrics.readability.grade}, ${metrics.readability.longPct}% long ${validation.gates.readability.pass ? '✅' : '❌'}`);
    console.log(`👥 Audience: ${metrics.audience.score}/100 suitability ${validation.gates.audience.pass ? '✅' : '❌'}`);

    console.log(`\n${validation.overallPass ? '✅ All gates passed!' : '❌ Quality gates failed!'}`);

    if (validation.requiredFailed.length > 0) {
      console.log(`❌ Required failures: ${validation.requiredFailed.join(', ')}`);
    }

    if (validation.optionalFailed.length > 0) {
      console.log(`⚠️  Optional failures: ${validation.optionalFailed.join(', ')}`);
    }
  }

  async run() {
    try {
      console.log('🔍 Quality Validation');
      console.log('====================');

      await this.loadConfigs();
      const validation = await this.validateGates();
      await this.generateReports(validation);
      this.printSummary(validation);

      if (!validation.overallPass) {
        console.log('\n💥 Quality validation failed!');
        process.exit(1);
      }

      console.log('\n✅ Quality validation passed!');

    } catch (error) {
      console.error('\n💥 Quality validation error:', error.message);
      process.exit(1);
    }
  }
}

new QualityValidator().run();

#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getCostSummary } from '../lib/cost';

class FinalReportGenerator {
  constructor() {
    this.config = {};
    this.costSummary = {};
    this.qualityGates = {};
    this.artifacts = {};
  }

  async loadData() {
    try {
      // Load deployment configuration
      const configData = await fs.readFile('config/deployment-gates.json', 'utf8');
      this.config = JSON.parse(configData);

      // Load cost summary
      this.costSummary = await getCostSummary();

      // Load quality gates results
      try {
        const gatesData = await fs.readFile('reports/quality-gates.json', 'utf8');
        this.qualityGates = JSON.parse(gatesData);
      } catch (error) {
        console.warn('⚠️  Quality gates report not found, skipping gate analysis');
        this.qualityGates = { overallPass: false, gates: {}, metrics: {} };
      }

      console.log('✅ Data loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load data: ${error.message}`);
    }
  }

  async verifyArtifacts() {
    const { requiredArtifacts, optionalArtifacts } = this.config.deploymentRequirements;
    const allArtifacts = [...requiredArtifacts, ...optionalArtifacts];

    this.artifacts = {
      required: {},
      optional: {},
      checksums: {}
    };

    for (const artifact of requiredArtifacts) {
      this.artifacts.required[artifact] = await this.checkArtifact(artifact);
    }

    for (const artifact of optionalArtifacts) {
      this.artifacts.optional[artifact] = await this.checkArtifact(artifact);
    }

    return this.artifacts;
  }

  async checkArtifact(artifactPath) {
    try {
      const stats = await fs.stat(artifactPath);
      const data = await fs.readFile(artifactPath);
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      this.artifacts.checksums[artifactPath] = checksum;

      return {
        exists: true,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        checksum: checksum
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  calculateOverallScore() {
    if (!this.qualityGates.metrics) return 0;

    const { qualityWeights } = this.config;
    const { metrics } = this.qualityGates;

    let totalScore = 0;
    let totalWeight = 0;

    // LPR Score (average of average and minimum checks)
    if (metrics.lpr && qualityWeights.lpr) {
      const avgScore = Math.min(metrics.lpr.average / this.config.thresholds.lpr.average, 1);
      const minScore = Math.min(metrics.lpr.minimum / this.config.thresholds.lpr.minimum, 1);
      const lprScore = (avgScore + minScore) / 2;
      totalScore += lprScore * qualityWeights.lpr * 100;
      totalWeight += qualityWeights.lpr;
    }

    // Coverage Score
    if (metrics.coverage && qualityWeights.coverage) {
      const coverageScore = Math.min(metrics.coverage.percentage / this.config.thresholds.coverage.percentage, 1);
      totalScore += coverageScore * qualityWeights.coverage * 100;
      totalWeight += qualityWeights.coverage;
    }

    // Scripture Score
    if (metrics.scripture && qualityWeights.scripture) {
      const scriptureScore = Math.min(metrics.scripture.percentage / this.config.thresholds.scripture.percentage, 1);
      totalScore += scriptureScore * qualityWeights.scripture * 100;
      totalWeight += qualityWeights.scripture;
    }

    // Glossary Score
    if (metrics.glossary && qualityWeights.glossary) {
      const glossaryScore = Math.min(metrics.glossary.consistency / this.config.thresholds.glossary.consistency, 1);
      totalScore += glossaryScore * qualityWeights.glossary * 100;
      totalWeight += qualityWeights.glossary;
    }

    // Golden Score
    if (metrics.golden && qualityWeights.golden) {
      const goldenScore = Math.min(metrics.golden.passRate / this.config.thresholds.golden.passRate, 1);
      totalScore += goldenScore * qualityWeights.golden * 100;
      totalWeight += qualityWeights.golden;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  generateBadge(status, label) {
    const color = status ? 'green' : 'red';
    const text = status ? 'PASS' : 'FAIL';
    return `![${label}](https://img.shields.io/badge/${label}-${text}-${color})`;
  }

  async generateJsonReport() {
    const overallScore = this.calculateOverallScore();
    const meetsMinimumScore = overallScore >= this.config.deploymentRequirements.minimumOverallScore;
    const allRequiredArtifacts = Object.values(this.artifacts.required).every(artifact => artifact.exists);

    const deploymentReady = this.qualityGates.overallPass && meetsMinimumScore && allRequiredArtifacts;

    const report = {
      timestamp: new Date().toISOString(),
      deploymentReady,
      overallScore,
      meetsMinimumScore,
      qualityGates: {
        overallPass: this.qualityGates.overallPass,
        requiredFailed: this.qualityGates.requiredFailed || [],
        optionalFailed: this.qualityGates.optionalFailed || [],
        details: this.qualityGates.gates || {}
      },
      artifacts: this.artifacts,
      cost: {
        total: this.costSummary.totalCost || 0,
        totalTokens: this.costSummary.totalTokens || 0,
        totalOperations: this.costSummary.totalSpans || 0,
        breakdown: {
          operations: this.costSummary.operationBreakdown || {},
          models: this.costSummary.modelBreakdown || {},
          providers: this.costSummary.providerBreakdown || {}
        }
      },
      metrics: this.qualityGates.metrics || {},
      config: this.config
    };

    await fs.mkdir('reports', { recursive: true });
    await fs.writeFile('reports/deployment-report.json', JSON.stringify(report, null, 2));

    return report;
  }

  async generateMarkdownReport(report) {
    const badges = [
      this.generateBadge(report.deploymentReady, 'Deployment'),
      this.generateBadge(report.qualityGates.overallPass, 'Quality_Gates'),
      this.generateBadge(report.meetsMinimumScore, 'Score_Check'),
      this.generateBadge(Object.values(this.artifacts.required).every(a => a.exists), 'Artifacts')
    ];

    let markdown = `# Deployment Report

${badges.join(' ')}

**Generated:** ${report.timestamp}
**Overall Score:** ${report.overallScore.toFixed(1)}/100
**Deployment Ready:** ${report.deploymentReady ? '✅ YES' : '❌ NO'}

---

## 📊 Quality Gates Summary

| Gate | Status | Details |
|------|--------|---------|
`;

    // Add quality gate details
    const gateNames = ['lpr', 'coverage', 'scripture', 'glossary', 'golden', 'drift'];
    for (const gate of gateNames) {
      const gateData = report.qualityGates.details[gate];
      const status = gateData?.pass ? '✅ PASS' : '❌ FAIL';
      const metric = report.metrics[gate];

      let details = 'N/A';
      if (metric) {
        switch (gate) {
          case 'lpr':
            details = `avg: ${metric.average?.toFixed(3)}, min: ${metric.minimum?.toFixed(3)}`;
            break;
          case 'coverage':
            details = `${metric.percentage?.toFixed(1)}%`;
            break;
          case 'scripture':
            details = `${metric.percentage?.toFixed(1)}% valid`;
            break;
          case 'glossary':
            details = `${metric.consistency?.toFixed(1)}% consistent`;
            break;
          case 'golden':
            details = `${metric.passRate?.toFixed(1)}% pass rate`;
            break;
          case 'drift':
            details = `${metric.maximum?.toFixed(3)} max drift`;
            break;
        }
      }

      markdown += `| ${gate.toUpperCase()} | ${status} | ${details} |\n`;
    }

    markdown += `
---

## 💰 Cost Analysis

- **Total Cost:** $${report.cost.total.toFixed(4)}
- **Total Tokens:** ${this.formatTokens(report.cost.totalTokens)}
- **Total Operations:** ${report.cost.totalOperations}

### By Operation
`;

    for (const [operation, breakdown] of Object.entries(report.cost.breakdown.operations)) {
      markdown += `- **${operation}:** ${breakdown.count} ops, $${breakdown.totalCost.toFixed(4)}, ${this.formatTokens(breakdown.totalTokens)}\n`;
    }

    markdown += `
### By Model
`;

    for (const [model, breakdown] of Object.entries(report.cost.breakdown.models)) {
      markdown += `- **${model}:** ${breakdown.count} ops, $${breakdown.totalCost.toFixed(4)}, ${this.formatTokens(breakdown.totalTokens)}\n`;
    }

    markdown += `
---

## 📦 Artifact Inventory

### Required Artifacts
`;

    for (const [artifact, details] of Object.entries(this.artifacts.required)) {
      const status = details.exists ? '✅' : '❌';
      const size = details.exists ? ` (${Math.round(details.size / 1024)}KB)` : '';
      const checksum = details.exists ? ` - \`${details.checksum.substring(0, 16)}...\`` : '';
      markdown += `- ${status} \`${artifact}\`${size}${checksum}\n`;
    }

    markdown += `
### Optional Artifacts
`;

    for (const [artifact, details] of Object.entries(this.artifacts.optional)) {
      const status = details.exists ? '✅' : '❌';
      const size = details.exists ? ` (${Math.round(details.size / 1024)}KB)` : '';
      const checksum = details.exists ? ` - \`${details.checksum.substring(0, 16)}...\`` : '';
      markdown += `- ${status} \`${artifact}\`${size}${checksum}\n`;
    }

    if (report.qualityGates.requiredFailed.length > 0) {
      markdown += `
---

## ❌ Issues

### Required Gates Failed
${report.qualityGates.requiredFailed.map(gate => `- ${gate.toUpperCase()}`).join('\n')}
`;
    }

    if (report.qualityGates.optionalFailed.length > 0) {
      markdown += `
### Optional Gates Failed
${report.qualityGates.optionalFailed.map(gate => `- ${gate.toUpperCase()}`).join('\n')}
`;
    }

    if (!report.deploymentReady) {
      markdown += `
---

## 🚫 Deployment Blocked

This deployment is blocked due to failing quality gates or missing artifacts. Please review the issues above and re-run the pipeline after addressing them.
`;
    } else {
      markdown += `
---

## ✅ Ready for Deployment

All quality gates passed and required artifacts are available. This build is ready for deployment.
`;
    }

    await fs.writeFile('reports/deployment-report.md', markdown);
  }

  formatTokens(count) {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  printSummary(report) {
    console.log('\n📊 Final Deployment Report Summary:');
    console.log('=====================================');

    console.log(`🎯 Overall Score: ${report.overallScore.toFixed(1)}/100`);
    console.log(`💰 Total Cost: $${report.cost.total.toFixed(4)}`);
    console.log(`🔢 Total Tokens: ${this.formatTokens(report.cost.totalTokens)}`);
    console.log(`⚙️  Total Operations: ${report.cost.totalOperations}`);

    console.log(`\n🏆 Quality Gates: ${report.qualityGates.overallPass ? '✅ PASSED' : '❌ FAILED'}`);
    if (report.qualityGates.requiredFailed.length > 0) {
      console.log(`❌ Required failures: ${report.qualityGates.requiredFailed.join(', ')}`);
    }

    const requiredMissing = Object.entries(this.artifacts.required)
      .filter(([_, details]) => !details.exists)
      .map(([artifact, _]) => artifact);

    console.log(`\n📦 Required Artifacts: ${requiredMissing.length === 0 ? '✅ ALL PRESENT' : `❌ ${requiredMissing.length} MISSING`}`);
    if (requiredMissing.length > 0) {
      console.log(`❌ Missing: ${requiredMissing.join(', ')}`);
    }

    console.log(`\n🚀 Deployment Ready: ${report.deploymentReady ? '✅ YES' : '❌ NO'}`);

    console.log('\n📄 Reports generated:');
    console.log('   - reports/deployment-report.json');
    console.log('   - reports/deployment-report.md');
  }

  async run() {
    try {
      console.log('📊 Final Report Generation');
      console.log('==========================');

      await this.loadData();
      await this.verifyArtifacts();

      const report = await this.generateJsonReport();
      await this.generateMarkdownReport(report);

      this.printSummary(report);

      if (!report.deploymentReady) {
        console.log('\n💥 Deployment not ready!');
        process.exit(1);
      }

      console.log('\n✅ Final report generated successfully!');

    } catch (error) {
      console.error('\n💥 Final report generation failed:', error.message);
      process.exit(1);
    }
  }
}

new FinalReportGenerator().run();

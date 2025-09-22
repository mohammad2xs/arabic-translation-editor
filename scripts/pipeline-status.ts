#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { aggregateCosts, getCostSummary } from '../lib/cost';

class PipelineStatusDashboard {
  constructor() {
    this.manifest = {};
    this.triview = {};
    this.costSummary = {};
  }

  async loadData() {
    try {
      // Load manifest
      const manifestData = await fs.readFile('data/manifest.json', 'utf8');
      this.manifest = JSON.parse(manifestData);

      // Load triview data if available
      try {
        const triviewData = await fs.readFile('outputs/triview.json', 'utf8');
        this.triview = JSON.parse(triviewData);
      } catch (error) {
        console.warn('⚠️  Triview data not found, generating empty dataset');
        this.triview = { rows: [] };
      }

      // Load or generate cost summary
      try {
        this.costSummary = await getCostSummary();
      } catch (error) {
        console.warn('⚠️  Cost data not found, aggregating costs...');
        await aggregateCosts();
        this.costSummary = await getCostSummary();
      }

      console.log('✅ Data loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load data: ${error.message}`);
    }
  }

  calculateProcessingStats() {
    const totalRows = this.manifest.totalRows || 0;
    const processedRows = this.triview.rows.length || 0;
    const completedRows = this.triview.rows.filter(row =>
      row.englishText && row.englishText.trim().length > 0
    ).length;

    const successRate = processedRows > 0 ? (completedRows / processedRows) * 100 : 0;
    const overallProgress = totalRows > 0 ? (processedRows / totalRows) * 100 : 0;

    return {
      totalRows,
      processedRows,
      completedRows,
      successRate,
      overallProgress,
      remainingRows: totalRows - processedRows
    };
  }

  calculateLPRStats() {
    const lprValues = this.triview.rows
      .filter(row => row.englishText && row.arabicText)
      .map(row => {
        const englishLength = row.englishText.length;
        const arabicLength = row.arabicText.length;
        return arabicLength > 0 ? englishLength / arabicLength : 0;
      })
      .filter(lpr => lpr > 0);

    if (lprValues.length === 0) {
      return { average: 0, minimum: 0, maximum: 0, count: 0 };
    }

    const average = lprValues.reduce((sum, lpr) => sum + lpr, 0) / lprValues.length;
    const minimum = Math.min(...lprValues);
    const maximum = Math.max(...lprValues);

    return { average, minimum, maximum, count: lprValues.length };
  }

  calculateErrorStats() {
    const errors = this.triview.rows.filter(row => row.error || row.issues?.length > 0);
    const warnings = this.triview.rows.filter(row => row.warnings?.length > 0);

    const errorTypes = {};
    errors.forEach(row => {
      if (row.error) {
        const errorType = row.error.type || 'unknown';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      }
      if (row.issues) {
        row.issues.forEach(issue => {
          const issueType = issue.type || 'unknown';
          errorTypes[issueType] = (errorTypes[issueType] || 0) + 1;
        });
      }
    });

    return {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      errorTypes
    };
  }

  estimateETA() {
    const stats = this.calculateProcessingStats();
    if (stats.remainingRows <= 0 || !this.costSummary.operationBreakdown) return null;

    // Estimate based on translation operation latency
    const translationOp = this.costSummary.operationBreakdown.translation ||
                         this.costSummary.operationBreakdown.translate;

    if (!translationOp || translationOp.averageLatency <= 0) return null;

    const avgLatencySeconds = translationOp.averageLatency / 1000;
    const remainingTimeSeconds = stats.remainingRows * avgLatencySeconds;

    return {
      seconds: remainingTimeSeconds,
      formatted: this.formatDuration(remainingTimeSeconds)
    };
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  formatCurrency(amount) {
    return `$${amount.toFixed(4)}`;
  }

  formatTokens(count) {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  generateProgressBar(percentage, width = 30) {
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'-'.repeat(empty)}] ${percentage.toFixed(1)}%`;
  }

  printDashboard() {
    const stats = this.calculateProcessingStats();
    const lprStats = this.calculateLPRStats();
    const errorStats = this.calculateErrorStats();
    const eta = this.estimateETA();

    console.log('\n📈 Pipeline Status Dashboard');
    console.log('═'.repeat(50));

    // Processing Progress
    console.log('\n🚀 Processing Progress:');
    console.log(`   ${this.generateProgressBar(stats.overallProgress)}`);
    console.log(`   Total Rows: ${stats.totalRows.toLocaleString()}`);
    console.log(`   Processed: ${stats.processedRows.toLocaleString()} (${stats.overallProgress.toFixed(1)}%)`);
    console.log(`   Completed: ${stats.completedRows.toLocaleString()} (${stats.successRate.toFixed(1)}% success)`);
    console.log(`   Remaining: ${stats.remainingRows.toLocaleString()}`);

    // Quality Metrics
    console.log('\n📊 Quality Metrics:');
    if (lprStats.count > 0) {
      console.log(`   LPR Average: ${lprStats.average.toFixed(3)}`);
      console.log(`   LPR Range: ${lprStats.minimum.toFixed(3)} - ${lprStats.maximum.toFixed(3)}`);
      console.log(`   LPR Sample: ${lprStats.count.toLocaleString()} rows`);
    } else {
      console.log(`   LPR: No data available`);
    }

    // Error Analysis
    console.log('\n❌ Error Analysis:');
    console.log(`   Errors: ${errorStats.totalErrors.toLocaleString()}`);
    console.log(`   Warnings: ${errorStats.totalWarnings.toLocaleString()}`);

    if (Object.keys(errorStats.errorTypes).length > 0) {
      console.log('   Error Types:');
      for (const [type, count] of Object.entries(errorStats.errorTypes)) {
        console.log(`     ${type}: ${count}`);
      }
    }

    // Cost Information
    console.log('\n💰 Cost Analysis:');
    console.log(`   Total Cost: ${this.formatCurrency(this.costSummary.totalCost || 0)}`);
    console.log(`   Total Tokens: ${this.formatTokens(this.costSummary.totalTokens || 0)}`);
    console.log(`   Operations: ${(this.costSummary.totalSpans || 0).toLocaleString()}`);

    if (this.costSummary.operationBreakdown) {
      const topOperations = Object.entries(this.costSummary.operationBreakdown)
        .sort(([,a], [,b]) => b.totalCost - a.totalCost)
        .slice(0, 3);

      if (topOperations.length > 0) {
        console.log('   Top Operations:');
        for (const [operation, data] of topOperations) {
          console.log(`     ${operation}: ${this.formatCurrency(data.totalCost)} (${data.count} ops)`);
        }
      }
    }

    // ETA Estimation
    console.log('\n⏱️  Time Estimation:');
    if (eta) {
      console.log(`   Estimated Completion: ${eta.formatted}`);
    } else {
      console.log(`   ETA: Unable to estimate`);
    }

    // Sections Summary
    if (this.manifest.sections) {
      const sectionCount = Object.keys(this.manifest.sections).length;
      console.log('\n📚 Sections:');
      console.log(`   Total Sections: ${sectionCount}`);

      // Show section processing status
      const sectionStats = {};
      this.triview.rows.forEach(row => {
        const sectionId = row.sectionId;
        if (sectionId) {
          if (!sectionStats[sectionId]) {
            sectionStats[sectionId] = { total: 0, completed: 0 };
          }
          sectionStats[sectionId].total++;
          if (row.englishText && row.englishText.trim().length > 0) {
            sectionStats[sectionId].completed++;
          }
        }
      });

      const completedSections = Object.values(sectionStats).filter(
        stats => stats.completed === stats.total && stats.total > 0
      ).length;

      console.log(`   Completed Sections: ${completedSections}/${sectionCount}`);
    }

    console.log('\n═'.repeat(50));
    console.log(`Last Updated: ${new Date().toLocaleString()}`);
  }

  async run() {
    try {
      console.clear(); // Clear screen for dashboard effect

      await this.loadData();
      this.printDashboard();

    } catch (error) {
      console.error('\n💥 Pipeline status error:', error.message);
      process.exit(1);
    }
  }
}

// Support watch mode if --watch flag is provided
const isWatchMode = process.argv.includes('--watch');

async function runDashboard() {
  const dashboard = new PipelineStatusDashboard();
  await dashboard.run();
}

if (isWatchMode) {
  console.log('📈 Starting pipeline status dashboard in watch mode...');
  console.log('Press Ctrl+C to exit\n');

  // Initial run
  await runDashboard();

  // Update every 30 seconds
  setInterval(async () => {
    try {
      await runDashboard();
    } catch (error) {
      console.error('Dashboard update failed:', error.message);
    }
  }, 30000);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Dashboard stopped');
    process.exit(0);
  });
} else {
  // Single run
  await runDashboard();
}

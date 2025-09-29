#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs/promises';
import crypto from 'crypto';
import { createRequire } from 'module';
import { REPORT_FILES } from './utils/project-paths.mjs';

const require = createRequire(import.meta.url);

class ScaleToFull {
  constructor() {
    this.startTime = Date.now();
    this.steps = [
      { name: 'Ingestion', command: 'tsx', args: ['scripts/ingest.ts'] },
      { name: 'Pipeline Processing', command: 'tsx', args: ['orchestrate/pipeline.ts'], env: { SECTION_SCOPE: 'all' } },
      { name: 'Quality Validation', command: 'tsx', args: ['scripts/quality-validation.mjs'] },
      { name: 'Build DOCX', command: 'node', args: ['build/docx.mjs'] },
      { name: 'Build EPUB', command: 'node', args: ['build/epub.mjs'] },
      { name: 'Audio Prep', command: 'node', args: ['build/audio_prep.mjs'] }
    ];
  }

  async runCommand(step) {
    return new Promise((resolve, reject) => {
      console.log(`\n🚀 Starting: ${step.name}`);
      console.log(`   Command: ${step.command} ${step.args.join(' ')}`);

      const env = { ...process.env, ...step.env };
      const child = spawn(step.command, step.args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        env
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ ${step.name} completed successfully`);
          resolve({ stdout, stderr, code });
        } else {
          console.error(`❌ ${step.name} failed with exit code ${code}`);
          reject(new Error(`${step.name} failed with exit code ${code}`));
        }
      });

      child.on('error', (error) => {
        console.error(`❌ ${step.name} failed to start:`, error.message);
        reject(error);
      });
    });
  }

  async calculateChecksums() {
    const artifacts = [
      'outputs/book-final.docx',
      'outputs/triview.json',
      'outputs/book.epub',
      REPORT_FILES.qualityJson,
      REPORT_FILES.deploymentJson
    ];

    const checksums = {};

    for (const artifact of artifacts) {
      try {
        const data = await fs.readFile(artifact);
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        checksums[artifact] = hash;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️  Could not checksum ${artifact}: ${error.message}`);
        }
      }
    }

    return checksums;
  }

  async generateBuildMetadata() {
    try {
      console.log('\n🏗️  Generating build metadata...');

      // Import git utilities
      const { getBuildMetadata } = await import('../lib/build/git-utils.ts');
      const buildInfo = getBuildMetadata();

      // Read quality gates data
      let qualityData = null;
      try {
        const gatesContent = await fs.readFile(REPORT_FILES.qualityJson, 'utf8');
        qualityData = JSON.parse(gatesContent);
      } catch (error) {
        console.warn('⚠️  Could not read quality gates data:', error.message);
      }

      // Calculate checksums and get inventory
      const checksums = await this.calculateChecksums();
      const inventory = Object.keys(checksums);

      // Calculate build duration
      const buildDuration = Math.round((Date.now() - this.startTime) / 1000);

      // Generate comprehensive metadata
      const metadata = {
        sha: buildInfo.sha,
        shortSha: buildInfo.shortSha,
        time: new Date().toISOString(),
        version: buildInfo.version,
        branch: buildInfo.branch,
        buildDuration,
        quality: qualityData ? {
          overallPass: qualityData.overallPass || false,
          deploymentReady: qualityData.deploymentReady || false,
          lpr: {
            average: qualityData.metrics?.lpr?.average || 0,
            minimum: qualityData.metrics?.lpr?.minimum || 0
          },
          coverage: {
            percentage: qualityData.metrics?.coverage?.percentage || 0
          },
          gates: (() => {
            try {
              if (!qualityData.gates || typeof qualityData.gates !== 'object') {
                return { passed: [], failed: [] };
              }
              const passed = Object.entries(qualityData.gates)
                .filter(([_, gate]) => gate && typeof gate === 'object' && gate.pass === true)
                .map(([name]) => name);
              const failed = Object.entries(qualityData.gates)
                .filter(([_, gate]) => gate && typeof gate === 'object' && gate.pass !== true)
                .map(([name]) => name);
              return { passed, failed };
            } catch (error) {
              console.warn('⚠️  Error processing quality gates:', error.message);
              return { passed: [], failed: [] };
            }
          })()
        } : null,
        artifacts: {
          checksums,
          inventory
        },
        pipeline: {
          steps: this.steps.map(step => step.name),
          completedAt: new Date().toISOString(),
          environment: buildInfo.environment
        }
      };

      // Ensure public directory exists
      await fs.mkdir('public', { recursive: true });

      // Write metadata to public/_meta.json
      await fs.writeFile('public/_meta.json', JSON.stringify(metadata, null, 2));

      console.log(`✅ Build metadata generated: ${buildInfo.shortSha} (${buildInfo.branch})`);
      return metadata;

    } catch (error) {
      console.warn('⚠️  Failed to generate build metadata:', error.message);
      // Continue pipeline execution even if metadata generation fails
      return null;
    }
  }

  async printArtifactInventory() {
    console.log('\n📦 Artifact Inventory:');

    const checksums = await this.calculateChecksums();

    for (const [artifact, checksum] of Object.entries(checksums)) {
      try {
        const stats = await fs.stat(artifact);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`   ${artifact} (${sizeKB}KB) - ${checksum.substring(0, 16)}...`);
      } catch (error) {
        console.log(`   ${artifact} - Missing`);
      }
    }

    return checksums;
  }

  async checkQualityGates() {
    try {
      const gatesData = await fs.readFile(REPORT_FILES.qualityJson, 'utf8');
      const gates = JSON.parse(gatesData);

      // Print SUMMARY line as required by spec
      this.printSummary(gates);

      if (gates.overallPass === false) {
        console.error('\n❌ Quality gates failed! Deployment blocked.');
        return false;
      }

      console.log('\n✅ All quality gates passed!');
      return true;
    } catch (error) {
      console.error('\n⚠️  Could not verify quality gates:', error.message);
      return false;
    }
  }

  printSummary(gates) {
    try {
      const coverage = gates.metrics?.coverage?.percentage || 0;
      const lprAvg = gates.metrics?.lpr?.average || 0;
      const lprMin = gates.metrics?.lpr?.minimum || 0;
      const grade = gates.metrics?.readability?.grade || 0;
      const longPct = gates.metrics?.readability?.longPct || 0;
      const scriptureOk = gates.gates?.scripture?.pass ? 'OK' : 'X';
      const result = gates.overallPass ? 'PASS' : 'FAIL';

      console.log(`\n📊 SUMMARY: coverage:${coverage.toFixed(0)}% | lpr(avg/min):${lprAvg.toFixed(2)}/${lprMin.toFixed(2)} | grade:${grade.toFixed(1)} | long%:${longPct.toFixed(0)} | scripture:${scriptureOk} | result:${result}`);
    } catch (error) {
      console.warn('Failed to generate summary:', error.message);
    }
  }

  async run() {
    try {
      console.log('🎯 Scale to Full Document Processing Pipeline');
      console.log('=====================================');

      // Run each step in sequence
      for (const step of this.steps) {
        await this.runCommand(step);
      }

      // Check quality gates
      const gatesPassed = await this.checkQualityGates();

      // Generate build metadata after quality gates check
      await this.generateBuildMetadata();

      // Generate final report after metadata is available
      await this.runCommand({ name: 'Final Report', command: 'tsx', args: ['scripts/generate-final-report.ts'] });

      // Print final inventory
      await this.printArtifactInventory();

      const duration = Math.round((Date.now() - this.startTime) / 1000);
      console.log(`\n🎉 Pipeline completed in ${duration}s`);

      if (!gatesPassed) {
        process.exit(1);
      }

      console.log('✅ Ready for deployment!');

    } catch (error) {
      console.error('\n💥 Pipeline failed:', error.message);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Pipeline interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Pipeline terminated');
  process.exit(1);
});

new ScaleToFull().run();

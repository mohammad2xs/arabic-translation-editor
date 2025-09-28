#!/usr/bin/env node

// Simple wrapper to run the pipeline
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Phase 5 pipeline with specified parameters...');
console.log('CONCURRENCY_ROWS=6, MAX_RETRIES=2, EXEC_ENGINE=claude, TEMP_SEED=stable');
console.log('SECTION_SCOPE=all, enforcing quality gates...\n');

const child = spawn('npx', ['tsx', 'orchestrate/pipeline.mjs'], {
  stdio: 'inherit',
  cwd: __dirname
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('\n=== PHASE 5 COMPLETED ===');
    console.log('Pipeline executed successfully');
  } else {
    console.log(`\nPipeline failed with exit code ${code}`);
  }
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Failed to start pipeline:', error);
  process.exit(1);
});

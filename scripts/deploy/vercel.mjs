#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { REPORT_PATHS } from '../utils/project-paths.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}🔄${colors.reset} ${msg}`),
  deploy: (msg) => console.log(`${colors.magenta}🚀${colors.reset} ${msg}`)
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    mode: 'preview',
    skipBuild: false,
    skipEnv: false,
    dryRun: false,
    withScale: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--preview':
        config.mode = 'preview';
        break;
      case '--prod':
        config.mode = 'production';
        break;
      case '--skip-build':
        config.skipBuild = true;
        break;
      case '--skip-env':
        config.skipEnv = true;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--with-scale':
        config.withScale = true;
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
      default:
        log.warn(`Unknown argument: ${args[i]}`);
    }
  }

  return config;
}

function showHelp() {
  console.log(`
${colors.bold}Vercel Deployment Orchestration${colors.reset}

Usage: node scripts/deploy/vercel.mjs [options]

Options:
  --preview      Deploy to preview environment (default)
  --prod         Deploy to production environment
  --skip-build   Skip build validation and execution
  --skip-env     Skip environment validation
  --with-scale   Run scale-to-full processing before build (production only)
  --dry-run      Simulate deployment without executing
  --help, -h     Show this help message

Examples:
  node scripts/deploy/vercel.mjs --preview
  node scripts/deploy/vercel.mjs --prod --skip-build
  node scripts/deploy/vercel.mjs --prod --with-scale
  node scripts/deploy/vercel.mjs --dry-run

Environment Variables:
  DEPLOY_AUTO_PREWARM=true    Enable automatic endpoint prewarming
  VERCEL_TOKEN               Vercel authentication token (for CI)
`);
}

function execCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

async function validateEnvironment(mode) {
  log.step('Validating environment variables...');

  try {
    // Import the environment validation from lib/env.ts
    const result = execCommand(`npx tsx -e "
      import { env } from './lib/env.ts';
      console.log(JSON.stringify({ success: true, env: Object.keys(env) }));
    "`, { silent: true });

    if (!result.success) {
      log.error('Environment validation failed');
      log.error(result.error);
      return false;
    }

    // Run the environment check script
    const envCheck = execCommand(`npm run env:check:${mode === 'production' ? 'prod' : 'vercel'}`, { silent: true });

    if (!envCheck.success) {
      log.error('Environment validation failed');
      log.error(envCheck.stderr || envCheck.error);
      return false;
    }

    log.success('Environment validation passed');
    return true;
  } catch (error) {
    log.error(`Environment validation error: ${error.message}`);
    return false;
  }
}

function checkVercelCLI() {
  log.step('Checking Vercel CLI...');

  const result = execCommand('vercel --version', { silent: true });
  if (!result.success) {
    log.error('Vercel CLI not found. Install with: npm i -g vercel');
    return false;
  }

  log.success(`Vercel CLI found: ${result.output.trim()}`);
  return true;
}

function linkProject() {
  log.step('Linking Vercel project...');

  const tokenFlag = process.env.VERCEL_TOKEN ? `--token ${process.env.VERCEL_TOKEN}` : '';
  const scopeFlag = process.env.VERCEL_ORG_ID ? `--scope ${process.env.VERCEL_ORG_ID}` : '';
  const projectFlag = process.env.VERCEL_PROJECT_ID ? `--project ${process.env.VERCEL_PROJECT_ID}` : '';

  const result = execCommand(`vercel link --yes ${tokenFlag} ${scopeFlag} ${projectFlag}`.trim(), { silent: true });
  if (!result.success) {
    log.error('Failed to link Vercel project');
    log.error(result.stderr);
    return false;
  }

  log.success('Project linked successfully');
  return true;
}

function getVercelEnvVars() {
  log.step('Checking Vercel environment variables...');

  const tokenFlag = process.env.VERCEL_TOKEN ? `--token ${process.env.VERCEL_TOKEN}` : '';
  const scopeFlag = process.env.VERCEL_ORG_ID ? `--scope ${process.env.VERCEL_ORG_ID}` : '';
  const projectFlag = process.env.VERCEL_PROJECT_ID ? `--project ${process.env.VERCEL_PROJECT_ID}` : '';

  const result = execCommand(`vercel env ls ${tokenFlag} ${scopeFlag} ${projectFlag}`.trim(), { silent: true });
  if (!result.success) {
    log.warn('Could not fetch Vercel environment variables');
    return [];
  }

  // Parse environment variables from output
  const envVars = [];
  const lines = result.output.split('\n');
  for (const line of lines) {
    if (line.includes('│') && !line.includes('Name')) {
      const parts = line.split('│').map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        envVars.push(parts[0]);
      }
    }
  }

  return envVars;
}

async function setupMissingEnvVars() {
  log.step('Setting up missing environment variables...');

  try {
    // Get required environment variables from lib/env.ts
    const envValidation = execCommand(`npx tsx -e "
      import { validateEnvironment } from './lib/env.ts';
      const result = validateEnvironment('production');
      console.log(JSON.stringify({ missing: result.missing }));
    "`, { silent: true });

    if (!envValidation.success) {
      log.warn('Could not get environment validation results');
      return false;
    }

    const { missing } = JSON.parse(envValidation.output);
    if (missing.length === 0) {
      log.success('All required environment variables are present');
      return true;
    }

    // Get current Vercel environment variables
    const vercelEnvVars = getVercelEnvVars();

    const tokenFlag = process.env.VERCEL_TOKEN ? `--token ${process.env.VERCEL_TOKEN}` : '';
    const scopeFlag = process.env.VERCEL_ORG_ID ? `--scope ${process.env.VERCEL_ORG_ID}` : '';
    const projectFlag = process.env.VERCEL_PROJECT_ID ? `--project ${process.env.VERCEL_PROJECT_ID}` : '';

    let addedCount = 0;

    for (const varName of missing) {
      if (vercelEnvVars.includes(varName)) {
        log.info(`${varName} already exists in Vercel`);
        continue;
      }

      const localValue = process.env[varName];
      if (!localValue) {
        log.warn(`${varName} missing locally and cannot be added to Vercel`);
        continue;
      }

      // Add environment variable to Vercel
      log.info(`Adding ${varName} to Vercel...`);

      const addResult = execCommand(`echo "${localValue}" | vercel env add ${varName} production ${tokenFlag} ${scopeFlag} ${projectFlag}`.trim(), { silent: true });

      if (addResult.success) {
        addedCount++;
        log.success(`Added ${varName} to Vercel`);
      } else {
        log.warn(`Failed to add ${varName} to Vercel: ${addResult.stderr}`);
      }
    }

    if (addedCount > 0) {
      log.success(`Added ${addedCount} environment variables to Vercel`);
    }

    return true;
  } catch (error) {
    log.warn(`Environment setup error: ${error.message}`);
    return false;
  }
}

function validateBuild() {
  log.step('Running build validation...');

  const buildValidateResult = execCommand('npm run build:validate');
  if (!buildValidateResult.success) {
    log.error('Build validation failed');
    return false;
  }

  const vercelEnvResult = execCommand('npm run env:check:vercel');
  if (!vercelEnvResult.success) {
    log.error('Vercel environment check failed');
    return false;
  }

  log.success('Build validation passed');
  return true;
}

function runBuild() {
  log.step('Building application...');

  const result = execCommand('npm run build');
  if (!result.success) {
    log.error('Build failed');
    return false;
  }

  log.success('Build completed successfully');
  return true;
}

function runScaleToFull() {
  log.step('Running scale-to-full processing...');

  const scaleScript = join(__dirname, '../scale-to-full.mjs');
  if (!existsSync(scaleScript)) {
    log.error('Scale-to-full script not found');
    return false;
  }

  const result = execCommand(`node "${scaleScript}"`);
  if (!result.success) {
    log.error('Scale-to-full processing failed');
    log.error(result.stderr || result.error);
    return false;
  }

  log.success('Scale-to-full processing completed');
  return true;
}

function deployToVercel(mode, dryRun = false) {
  log.deploy(`${dryRun ? 'Simulating' : 'Starting'} ${mode} deployment...`);

  if (dryRun) {
    log.info('Dry run mode - deployment simulation completed');
    return {
      success: true,
      url: `https://example-${mode}.vercel.app`,
      isDryRun: true
    };
  }

  const tokenFlag = process.env.VERCEL_TOKEN ? `--token ${process.env.VERCEL_TOKEN}` : '';
  const scopeFlag = process.env.VERCEL_ORG_ID ? `--scope ${process.env.VERCEL_ORG_ID}` : '';
  const projectFlag = process.env.VERCEL_PROJECT_ID ? `--project ${process.env.VERCEL_PROJECT_ID}` : '';
  const prodFlag = mode === 'production' ? '--prod' : '';

  const command = `vercel --prebuilt ${prodFlag} --yes --confirm ${tokenFlag} ${scopeFlag} ${projectFlag} --output json`.trim();

  const result = execCommand(command, { silent: true });

  if (!result.success) {
    log.error('Deployment failed');
    log.error(result.stderr || result.error);
    return { success: false };
  }

  // Parse JSON output to extract URL
  try {
    const lines = result.output.trim().split('\n');
    const jsonLine = lines.find(line => line.startsWith('{'));

    if (jsonLine) {
      const deployData = JSON.parse(jsonLine);
      const url = deployData.url || deployData.alias;

      if (!url) {
        throw new Error('No URL found in deployment response');
      }

      log.success(`Deployment successful: ${url}`);
      return { success: true, url };
    } else {
      // Fallback to regex extraction if JSON parsing fails
      const urlMatch = result.output.match(/https:\/\/[^\s\)]+/);
      const url = urlMatch ? urlMatch[0] : null;

      if (!url) {
        throw new Error('Could not extract deployment URL from output');
      }

      log.success(`Deployment successful: ${url}`);
      return { success: true, url };
    }
  } catch (error) {
    log.error(`Failed to parse deployment output: ${error.message}`);
    return { success: false };
  }
}

async function checkDeploymentHealth(url) {
  log.step('Checking deployment health...');

  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const healthUrl = `${url}/api/health?detailed=true`;

      if (attempt > 1) {
        log.info(`Health check attempt ${attempt}/${maxRetries}...`);
      }

      // Use curl for health check with timeout
      const result = execCommand(`curl -s -m 30 "${healthUrl}"`, { silent: true });

      if (!result.success) {
        throw new Error('Health endpoint unreachable');
      }

      let healthData;
      try {
        healthData = JSON.parse(result.output);
      } catch (error) {
        throw new Error('Invalid health response format');
      }

      if (healthData.status === 'healthy') {
        log.success(`Deployment health check passed${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
        return { healthy: true, data: healthData, attempts: attempt };
      } else {
        throw new Error(`Health check failed: ${healthData.status}`);
      }

    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        log.warn(`Health check failed: ${error.message}, retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  log.warn(`Health check failed after ${maxRetries} attempts - deployment may still be initializing`);
  return {
    healthy: false,
    reason: lastError?.message || 'Unknown error',
    attempts: maxRetries
  };
}

async function runPrewarm(url) {
  const shouldPrewarm = process.env.DEPLOY_AUTO_PREWARM === 'true';

  if (!shouldPrewarm) {
    log.info('Prewarm disabled (set DEPLOY_AUTO_PREWARM=true to enable)');
    return { prewarm: false };
  }

  log.step('Running post-deployment prewarm...');

  const prewarmScript = join(__dirname, '../postdeploy/prewarm.mjs');
  if (!existsSync(prewarmScript)) {
    log.warn('Prewarm script not found, skipping');
    return { prewarm: false };
  }

  const result = execCommand(`node "${prewarmScript}" "${url}"`, { silent: true });

  if (!result.success) {
    log.warn('Prewarm failed (non-critical)');
    return { prewarm: false, error: result.error };
  }

  log.success('Prewarm completed');
  return { prewarm: true, output: result.output };
}

async function generateDeployReport(config, deployResult, healthResult, prewarmResult) {
  const report = {
    timestamp: new Date().toISOString(),
    mode: config.mode,
    deployment: {
      success: deployResult.success,
      url: deployResult.url,
      isDryRun: deployResult.isDryRun || false
    },
    health: {
      checked: true,
      healthy: healthResult.healthy,
      reason: healthResult.reason,
      data: healthResult.data
    },
    prewarm: prewarmResult,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV
    }
  };

  try {
    await mkdir(join(projectRoot, REPORT_PATHS.root), { recursive: true });
    const reportPath = join(projectRoot, REPORT_PATHS.root, 'deploy-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log.info(`Deploy report written to: ${REPORT_PATHS.root}/deploy-report.json`);
  } catch (error) {
    log.warn(`Could not write deploy report: ${error.message}`);
  }

  return report;
}

function generateDeploymentSummary(config, deployResult, healthResult, prewarmResult) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}🚀 DEPLOYMENT SUMMARY${colors.reset}`);
  console.log('='.repeat(60));

  const status = deployResult.success ? '✅ SUCCESS' : '❌ FAILED';
  const mode = config.mode.toUpperCase();
  const dryRun = deployResult.isDryRun ? ' (DRY RUN)' : '';

  console.log(`Status: ${status}`);
  console.log(`Mode: ${mode}${dryRun}`);

  if (deployResult.url) {
    console.log(`URL: ${colors.cyan}${deployResult.url}${colors.reset}`);
    console.log(`Health: ${colors.cyan}${deployResult.url}/api/health${colors.reset}`);
  }

  if (healthResult.healthy) {
    console.log(`Health Check: ${colors.green}✅ HEALTHY${colors.reset}`);
  } else {
    console.log(`Health Check: ${colors.yellow}⚠️ ${healthResult.reason || 'UNKNOWN'}${colors.reset}`);
  }

  if (prewarmResult.prewarm) {
    console.log(`Prewarm: ${colors.green}✅ COMPLETED${colors.reset}`);
  } else if (process.env.DEPLOY_AUTO_PREWARM === 'true') {
    console.log(`Prewarm: ${colors.yellow}⚠️ SKIPPED${colors.reset}`);
  }

  console.log('='.repeat(60));

  if (deployResult.success && !deployResult.isDryRun) {
    console.log(`\n${colors.green}🎉 Deployment completed successfully!${colors.reset}`);
    console.log(`Visit: ${colors.cyan}${deployResult.url}${colors.reset}`);
  }
}

async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    process.exit(0);
  }

  log.deploy(`Starting Vercel deployment orchestration (${config.mode} mode)`);

  try {
    // 1. Environment validation
    if (!config.skipEnv) {
      const envValid = await validateEnvironment(config.mode);
      if (!envValid) {
        process.exit(1);
      }
    }

    // 2. Vercel CLI check
    if (!checkVercelCLI()) {
      process.exit(1);
    }

    // 3. Project linking
    if (!config.dryRun && !linkProject()) {
      process.exit(1);
    }

    // 4. Environment variables check and setup
    if (!config.dryRun) {
      getVercelEnvVars();
      await setupMissingEnvVars();
    }

    // 5. Scale-to-full processing (production with --with-scale flag only)
    if (config.withScale && config.mode === 'production' && !config.dryRun) {
      if (!runScaleToFull()) {
        process.exit(2);
      }
    }

    // 6. Build validation
    if (!config.skipBuild && !config.dryRun) {
      if (!validateBuild()) {
        process.exit(2);
      }

      if (!runBuild()) {
        process.exit(2);
      }
    }

    // 7. Deployment
    const deployResult = deployToVercel(config.mode, config.dryRun);
    if (!deployResult.success) {
      process.exit(2);
    }

    // 8. Health check
    let healthResult = { healthy: false, reason: 'skipped' };
    if (deployResult.url && !config.dryRun) {
      healthResult = await checkDeploymentHealth(deployResult.url);
    }

    // 9. Prewarm
    let prewarmResult = { prewarm: false };
    if (deployResult.url && !config.dryRun) {
      prewarmResult = await runPrewarm(deployResult.url);
    }

    // 10. Generate report
    await generateDeployReport(config, deployResult, healthResult, prewarmResult);

    // 11. Summary
    generateDeploymentSummary(config, deployResult, healthResult, prewarmResult);

    process.exit(0);

  } catch (error) {
    log.error(`Deployment failed: ${error.message}`);
    console.error(error.stack);
    process.exit(2);
  }
}

main();

#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  check: (msg) => console.log(`${colors.cyan}🔍${colors.reset} ${msg}`)
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    mode: process.env.NODE_ENV || 'development',
    format: 'table',
    strict: false,
    vercel: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        config.mode = args[++i] || config.mode;
        break;
      case '--format':
        config.format = args[++i] || config.format;
        break;
      case '--strict':
        config.strict = true;
        break;
      case '--vercel':
        config.vercel = true;
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
${colors.bold}Environment Variable Validation${colors.reset}

Usage: node scripts/env/validate.mjs [options]

Options:
  --mode <env>          Environment mode (dev|test|prod) - overrides NODE_ENV
  --format <type>       Output format (table|json|summary) - default: table
  --strict              Fail on warnings in development
  --vercel              Include Vercel-specific validation
  --help, -h            Show this help message

Examples:
  node scripts/env/validate.mjs
  node scripts/env/validate.mjs --mode prod --format json
  node scripts/env/validate.mjs --strict --vercel

Exit Codes:
  0    All required variables present and valid
  1    Missing required variables in production mode
  2    Invalid variable format or values
  3    Storage configuration invalid
`);
}

function maskSecret(value, showLength = 8) {
  if (!value || typeof value !== 'string') return 'undefined';
  if (value.length <= showLength) return '•'.repeat(value.length);
  return value.substring(0, showLength) + '•'.repeat(Math.min(value.length - showLength, 20));
}

async function loadEnvironmentValidation(mode) {
  try {
    // Execute the environment validation from lib/env.ts
    const result = execSync(`npx tsx -e "
      import { validateEnvironment, getValidatedEnv } from './lib/env.ts';

      const validation = validateEnvironment('${mode}');

      console.log(JSON.stringify({
        success: validation.success,
        data: validation.data,
        errors: validation.errors,
        warnings: validation.warnings,
        missing: validation.missing,
        env: process.env
      }));
    "`, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    return JSON.parse(result);
  } catch (error) {
    log.error(`Failed to load environment validation: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function categorizeVariables(validationResult, processEnv) {
  const categories = {
    required: [],
    optional: [],
    conditional: [],
    deployment: [],
    unknown: []
  };

  // Core required variables (from validation result)
  const coreRequired = [
    'SHARE_KEY',
    'LLM_PROVIDER',
    'NODE_ENV'
  ];

  // LLM provider keys (conditional based on LLM_PROVIDER)
  const llmProviders = {
    'openai': ['OPENAI_API_KEY']
  };

  // Storage configuration variables
  const storageVars = [
    'STORAGE_DRIVER',
    'VERCEL_BLOB_READ_WRITE_TOKEN',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET'
  ];

  // Optional enhancement variables
  const optionalVars = [
    'ELEVENLABS_API_KEY',
    'NEXT_PUBLIC_APP_URL'
  ];

  // Deployment variables
  const deploymentVars = [
    'VERCEL_TOKEN',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'DEPLOY_AUTO_PREWARM'
  ];

  // Process missing variables from validation result
  if (validationResult.missing) {
    for (const varName of validationResult.missing) {
      const varInfo = {
        name: varName,
        value: undefined,
        present: false,
        masked: 'undefined'
      };

      if (coreRequired.includes(varName)) {
        categories.required.push({ ...varInfo, category: 'core' });
      } else if (Object.values(llmProviders).flat().includes(varName)) {
        categories.required.push({ ...varInfo, category: 'llm' });
      } else if (storageVars.includes(varName)) {
        categories.conditional.push({ ...varInfo, category: 'storage' });
      } else {
        categories.required.push({ ...varInfo, category: 'other' });
      }
    }
  }

  // Categorize all environment variables that are present
  for (const [varName, value] of Object.entries(processEnv)) {
    if (!varName.match(/^[A-Z_]+$/)) continue; // Skip non-env vars
    if (validationResult.missing?.includes(varName)) continue; // Skip missing (already processed)

    const varInfo = {
      name: varName,
      value: value,
      present: Boolean(value),
      masked: maskSecret(value)
    };

    if (coreRequired.includes(varName)) {
      categories.required.push({ ...varInfo, category: 'core' });
    } else if (Object.values(llmProviders).flat().includes(varName)) {
      categories.required.push({ ...varInfo, category: 'llm' });
    } else if (optionalVars.includes(varName)) {
      categories.optional.push({ ...varInfo, category: 'enhancement' });
    } else if (storageVars.includes(varName)) {
      categories.conditional.push({ ...varInfo, category: 'storage' });
    } else if (deploymentVars.includes(varName)) {
      categories.deployment.push({ ...varInfo, category: 'deployment' });
    } else if (varName.includes('API_KEY') || varName.includes('TOKEN') || varName.includes('SECRET')) {
      categories.unknown.push({ ...varInfo, category: 'unknown' });
    }
  }

  return categories;
}

function validateStorageConfiguration(categories, mode) {
  const storageVars = categories.conditional.filter(v => v.category === 'storage');
  const blobToken = storageVars.find(v => v.name === 'VERCEL_BLOB_READ_WRITE_TOKEN');
  const awsVars = storageVars.filter(v => v.name.startsWith('AWS_'));
  const storageDriver = storageVars.find(v => v.name === 'STORAGE_DRIVER');

  let storageValid = false;
  let storageType = storageDriver?.value || 'unknown';
  let storageErrors = [];

  // Check based on storage driver setting
  switch (storageType) {
    case 'vercel-blob':
      if (blobToken?.present) {
        storageValid = true;
      } else {
        storageErrors.push('VERCEL_BLOB_READ_WRITE_TOKEN required for vercel-blob storage');
      }
      break;
    case 's3':
      const requiredAwsVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
      const missingAwsVars = requiredAwsVars.filter(varName =>
        !storageVars.find(v => v.name === varName && v.present)
      );
      if (missingAwsVars.length === 0) {
        storageValid = true;
      } else {
        storageErrors.push(`Missing AWS variables: ${missingAwsVars.join(', ')}`);
      }
      break;
    case 'fs':
      storageValid = true; // Filesystem storage requires no additional config
      break;
    default:
      // Auto-detect if no driver specified
      if (blobToken?.present) {
        storageValid = true;
        storageType = 'vercel-blob';
      } else if (awsVars.length >= 3 && awsVars.every(v => v.present)) {
        storageValid = true;
        storageType = 's3';
      } else {
        storageType = 'fs'; // Default to filesystem
        storageValid = true;
      }
  }

  if (!storageValid && mode === 'production') {
    storageErrors.push('Storage configuration invalid for production');
  }

  return { storageValid, storageType, storageErrors };
}

function generateTableOutput(categories, validationResult, config) {
  console.log(`\n${colors.bold}🔍 ENVIRONMENT VALIDATION${colors.reset}`);
  console.log(`Mode: ${config.mode.toUpperCase()}`);

  const storageResult = validateStorageConfiguration(categories, config.mode);
  console.log(`Storage: ${storageResult.storageType}`);
  console.log('='.repeat(70));

  function printCategory(vars, title, icon) {
    if (vars.length === 0) return;

    console.log(`\n${icon} ${colors.bold}${title}${colors.reset}`);
    console.log('─'.repeat(70));

    for (const variable of vars) {
      const status = variable.present ? colors.green + '✅' : colors.red + '❌';
      const name = variable.name.padEnd(25);
      const value = variable.present ? variable.masked : colors.dim + 'undefined';
      const hint = getVariableHint(variable.name);

      console.log(`${status}${colors.reset} ${name} ${value}`);
      if (hint && (!variable.present || config.format === 'verbose')) {
        console.log(`   ${colors.dim}${hint}${colors.reset}`);
      }
    }
  }

  printCategory(categories.required, 'Required Variables', '🔴');
  printCategory(categories.conditional, 'Storage Configuration', '🟡');
  printCategory(categories.optional, 'Optional Variables', '🟢');

  if (config.vercel) {
    printCategory(categories.deployment, 'Deployment Variables', '🚀');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  const requiredMissing = categories.required.filter(v => !v.present).length;
  const conditionalMissing = categories.conditional.filter(v => !v.present).length;

  if (requiredMissing === 0 && storageResult.storageValid) {
    log.success('All required variables present and storage configured');
  } else {
    if (requiredMissing > 0) {
      log.error(`${requiredMissing} required variable(s) missing`);
    }
    if (!storageResult.storageValid) {
      log.error('Storage configuration invalid');
    }
  }

  // Storage errors
  for (const error of storageResult.storageErrors) {
    log.warn(error);
  }
}

function generateJSONOutput(categories, validationResult, config) {
  const storageResult = validateStorageConfiguration(categories, config.mode);

  const output = {
    mode: config.mode,
    timestamp: new Date().toISOString(),
    validation: {
      success: validationResult.success,
      storage: storageResult
    },
    categories,
    summary: {
      required: {
        total: categories.required.length,
        present: categories.required.filter(v => v.present).length,
        missing: categories.required.filter(v => !v.present).length
      },
      optional: {
        total: categories.optional.length,
        present: categories.optional.filter(v => v.present).length
      },
      conditional: {
        total: categories.conditional.length,
        present: categories.conditional.filter(v => v.present).length
      }
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

function generateSummaryOutput(categories, validationResult, config) {
  const storageResult = validateStorageConfiguration(categories, config.mode);
  const requiredMissing = categories.required.filter(v => !v.present).length;
  const requiredPresent = categories.required.filter(v => v.present).length;
  const optionalPresent = categories.optional.filter(v => v.present).length;

  console.log(`Environment: ${config.mode}`);
  console.log(`Required: ${requiredPresent}/${categories.required.length}`);
  console.log(`Optional: ${optionalPresent}/${categories.optional.length}`);
  console.log(`Storage: ${storageResult.storageType}`);

  if (requiredMissing > 0) {
    console.log(`Missing: ${categories.required.filter(v => !v.present).map(v => v.name).join(', ')}`);
  }

  if (!storageResult.storageValid && config.mode === 'production') {
    console.log('Warning: No valid storage configuration');
  }
}

function getVariableHint(varName) {
  const hints = {
    'SHARE_KEY': 'Secret key for sharing functionality',
    'LLM_PROVIDER': 'LLM provider (openai)',
    'OPENAI_API_KEY': 'Get from https://platform.openai.com/',
    'GOOGLE_AI_API_KEY': 'Get from https://makersuite.google.com/',
    'GROQ_API_KEY': 'Get from https://console.groq.com/',
    'ELEVENLABS_API_KEY': 'Optional - enables TTS features',
    'BLOB_READ_WRITE_TOKEN': 'Vercel Blob storage token',
    'AWS_ACCESS_KEY_ID': 'AWS credentials for S3 storage',
    'AWS_SECRET_ACCESS_KEY': 'AWS credentials for S3 storage',
    'AWS_REGION': 'AWS region for S3 storage',
    'VERCEL_TOKEN': 'Vercel CLI authentication token',
    'DEPLOY_AUTO_PREWARM': 'Enable automatic endpoint prewarming'
  };

  return hints[varName] || null;
}

function getExitCode(categories, storageResult, config) {
  const requiredMissing = categories.required.filter(v => !v.present).length;

  if (requiredMissing > 0 && config.mode === 'production') {
    return 1; // Missing required variables in production
  }

  if (!storageResult.storageValid && config.mode === 'production') {
    return 3; // Storage configuration invalid
  }

  const optionalMissing = categories.optional.filter(v => !v.present).length;
  if (config.strict && optionalMissing > 0) {
    return 1; // Strict mode with missing optional variables
  }

  return 0; // All good
}

async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    process.exit(0);
  }

  log.check('Validating environment variables...');

  const validationResult = await loadEnvironmentValidation(config.mode);
  if (!validationResult.success && validationResult.error) {
    log.error('Environment validation setup failed');
    process.exit(2);
  }

  const categories = categorizeVariables(validationResult, validationResult.env);
  const storageResult = validateStorageConfiguration(categories, config.mode);

  switch (config.format) {
    case 'json':
      generateJSONOutput(categories, validationResult, config);
      break;
    case 'summary':
      generateSummaryOutput(categories, validationResult, config);
      break;
    case 'table':
    default:
      generateTableOutput(categories, validationResult, config);
      break;
  }

  const exitCode = getExitCode(categories, storageResult, config);
  process.exit(exitCode);
}

main().catch(error => {
  log.error(`Validation failed: ${error.message}`);
  console.error(error.stack);
  process.exit(2);
});
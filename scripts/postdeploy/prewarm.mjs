#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
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
  prewarm: (msg) => console.log(`${colors.magenta}🔥${colors.reset} ${msg}`)
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    url: null,
    help: false,
    verbose: false,
    timeout: 30,
    retries: 2,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        config.help = true;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i]) || 30;
        break;
      case '--retries':
        config.retries = parseInt(args[++i]) || 2;
        break;
      case '--force':
        config.force = true;
        break;
      default:
        if (!config.url && args[i].startsWith('http')) {
          config.url = args[i];
        } else if (!args[i].startsWith('-')) {
          config.url = args[i];
        } else {
          log.warn(`Unknown argument: ${args[i]}`);
        }
    }
  }

  return config;
}

function showHelp() {
  console.log(`
${colors.bold}Post-Deploy Endpoint Prewarming${colors.reset}

Usage: node scripts/postdeploy/prewarm.mjs [url] [options]

Arguments:
  url                    Deployment URL to prewarm (required)

Options:
  --timeout <seconds>    Request timeout per endpoint (default: 30)
  --retries <count>      Retry count for failed requests (default: 2)
  --force                Force prewarming even if disabled via environment
  --verbose, -v          Show detailed timing information
  --help, -h             Show this help message

Examples:
  node scripts/postdeploy/prewarm.mjs https://myapp.vercel.app
  node scripts/postdeploy/prewarm.mjs https://myapp.vercel.app --verbose
  node scripts/postdeploy/prewarm.mjs https://myapp.vercel.app --timeout 60

Environment Variables:
  DEPLOY_AUTO_PREWARM=true     Enable automatic prewarming
  PREWARM_ENDPOINTS           Custom endpoint list (comma-separated, e.g., "/api/data,/dashboard")
  ELEVENLABS_API_KEY          Enable TTS endpoint prewarming

Note: Only /api/health?detailed=true is prewarmed by default.
      Use PREWARM_ENDPOINTS to specify additional app-specific routes.
`);
}

function getDefaultEndpoints() {
  return [
    {
      path: '/api/health?detailed=true',
      name: 'Health Check (detailed)',
      timeout: 30,
      critical: true
    }
  ];
}

function getCustomEndpoints() {
  const customEndpoints = process.env.PREWARM_ENDPOINTS;
  if (!customEndpoints) return [];

  return customEndpoints.split(',').map(path => ({
    path: path.trim(),
    name: `Custom: ${path.trim()}`,
    timeout: 15,
    critical: false
  }));
}

function getTTSEndpoint() {
  // Only include TTS endpoint if ELEVENLABS_API_KEY is present
  if (process.env.ELEVENLABS_API_KEY) {
    return {
      path: '/api/tts',
      name: 'TTS Service Test',
      timeout: 30,
      critical: false,
      method: 'POST',
      body: JSON.stringify({
        text: 'Test',
        voice: 'default',
        model: 'eleven_monolingual_v1'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
  return null;
}

function getAllEndpoints() {
  const endpoints = [
    ...getDefaultEndpoints(),
    ...getCustomEndpoints()
  ];

  const ttsEndpoint = getTTSEndpoint();
  if (ttsEndpoint) {
    endpoints.push(ttsEndpoint);
  }

  return endpoints;
}

async function warmEndpoint(baseUrl, endpoint, config) {
  const url = `${baseUrl}${endpoint.path}`;
  const timeout = endpoint.timeout || config.timeout;
  const method = endpoint.method || 'GET';

  let attempts = 0;
  const maxAttempts = config.retries + 1;

  while (attempts < maxAttempts) {
    const startTime = Date.now();
    attempts++;

    try {
      let curlCommand = `curl -s -m ${timeout} -o /dev/null -w "%{http_code}|%{time_total}"`;

      if (method === 'POST' && endpoint.body) {
        curlCommand += ` -X POST -H "Content-Type: application/json" -d '${endpoint.body}'`;
      }

      if (endpoint.headers) {
        for (const [key, value] of Object.entries(endpoint.headers)) {
          // Avoid duplicate Content-Type headers
          if (key.toLowerCase() !== 'content-type' || method !== 'POST') {
            curlCommand += ` -H "${key}: ${value}"`;
          }
        }
      }

      curlCommand += ` "${url}"`;

      const result = execSync(curlCommand, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: (timeout + 5) * 1000 // Add buffer to curl timeout
      });

      // Parse curl output (response|status_code|time_total)
      const lines = result.split('\n');
      const lastLine = lines[lines.length - 1] || lines[lines.length - 2];
      const [statusCode, timeTotal] = lastLine.split('|');

      const responseTime = parseFloat(timeTotal) * 1000; // Convert to ms
      const status = parseInt(statusCode);
      const duration = Date.now() - startTime;

      if (status >= 200 && status < 400) {
        const timeStr = config.verbose
          ? `${responseTime.toFixed(0)}ms (total: ${duration}ms)`
          : `${responseTime.toFixed(0)}ms`;

        log.success(`${endpoint.name} - ${timeStr} (${status})`);

        return {
          success: true,
          endpoint: endpoint.path,
          status,
          responseTime,
          totalTime: duration,
          attempts
        };
      } else {
        throw new Error(`HTTP ${status}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      if (attempts < maxAttempts) {
        if (config.verbose) {
          log.warn(`${endpoint.name} - attempt ${attempts} failed (${error.message}), retrying...`);
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts - 1), 5000)));
        continue;
      } else {
        const errorMsg = error.message.includes('timeout') ? 'timeout' : error.message;
        log.warn(`${endpoint.name} - ${errorMsg} after ${duration}ms (${attempts} attempts)`);

        return {
          success: false,
          endpoint: endpoint.path,
          error: errorMsg,
          totalTime: duration,
          attempts
        };
      }
    }
  }
}

function validateUrl(url) {
  if (!url) {
    log.error('Deployment URL is required');
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch (error) {
    log.error(`Invalid URL: ${url}`);
    return false;
  }
}

function loadDeployReport(config) {
  const reportPath = join(projectRoot, 'reports/deploy-report.json');

  if (existsSync(reportPath)) {
    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      return report.deployment?.url || null;
    } catch (error) {
      if (config.verbose) {
        log.warn(`Could not read deploy report: ${error.message}`);
      }
    }
  }

  return null;
}

function detectDeploymentUrl(config) {
  // Try environment variables first
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Try deploy report
  const reportUrl = loadDeployReport(config);
  if (reportUrl) {
    return reportUrl;
  }

  return null;
}

async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    process.exit(0);
  }

  // Auto-detect URL if not provided
  if (!config.url) {
    config.url = detectDeploymentUrl(config);
  }

  if (!validateUrl(config.url)) {
    log.error('Please provide a valid deployment URL');
    log.info('Usage: node scripts/postdeploy/prewarm.mjs <url>');
    process.exit(1);
  }

  // Check if prewarming is enabled
  const isEnabled = process.env.DEPLOY_AUTO_PREWARM === 'true' || config.force;
  if (!isEnabled) {
    log.info('Prewarming disabled (set DEPLOY_AUTO_PREWARM=true to enable, or use --force flag)');
    process.exit(0);
  }

  log.prewarm(`Prewarming deployment endpoints...`);
  log.info(`Target: ${colors.cyan}${config.url}${colors.reset}`);

  if (config.verbose) {
    log.info(`Timeout: ${config.timeout}s, Retries: ${config.retries}`);
  }

  const endpoints = getAllEndpoints();
  const results = [];
  const startTime = Date.now();

  console.log(''); // Add spacing

  for (const endpoint of endpoints) {
    const result = await warmEndpoint(config.url, endpoint, config);
    results.push(result);
  }

  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  console.log(''); // Add spacing
  console.log('='.repeat(50));

  const summary = `Prewarm completed: ${successCount}/${results.length} endpoints warmed in ${(totalTime / 1000).toFixed(1)}s`;

  if (failureCount === 0) {
    log.success(summary);
  } else {
    log.warn(summary);
  }

  if (config.verbose || failureCount > 0) {
    console.log('\nDetailed Results:');
    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      const time = result.responseTime ? `${result.responseTime.toFixed(0)}ms` : `${result.totalTime}ms`;
      const attempts = result.attempts > 1 ? ` (${result.attempts} attempts)` : '';
      const error = result.error ? ` - ${result.error}` : '';

      console.log(`  ${status} ${result.endpoint} - ${time}${attempts}${error}`);
    }
  }

  console.log('='.repeat(50));

  // Always exit with 0 to not fail deployment pipeline
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log.info('\nPrewarm interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('\nPrewarm terminated');
  process.exit(0);
});

main().catch(error => {
  log.error(`Prewarm failed: ${error.message}`);
  console.error(error.stack);
  // Always exit with 0 to not fail deployment pipeline
  process.exit(0);
});
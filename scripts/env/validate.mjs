#!/usr/bin/env node

import { readFile } from 'fs/promises'
import { join } from 'path'
import process from 'process'

// Import validation logic (will be transpiled from TypeScript)
async function importValidation() {
  try {
    await import('tsx/register');
    return await import('../../lib/env.ts');
  } catch {
    try {
      // Fallback to compiled JavaScript
      return await import('../../lib/env.js')
    } catch {
      // Final fallback: implement minimal validation directly
      return null
    }
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    mode: 'development',
    format: 'table',
    strict: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--mode':
        options.mode = args[++i] || 'development'
        break
      case '--format':
        options.format = args[++i] || 'table'
        break
      case '--strict':
        options.strict = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
    }
  }

  return options
}

// Color formatting for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function colorize(text, color) {
  return process.stdout.isTTY ? `${colors[color]}${text}${colors.reset}` : text
}

// Mask secrets for display
function maskSecret(value, show = 8) {
  if (!value || typeof value !== 'string') return 'not set'
  if (value.length <= show) return value
  return `${value.substring(0, show)}...`
}

// Manual environment validation (fallback)
function manualValidation(mode) {
  const env = process.env
  const errors = []
  const warnings = []
  const missing = []

  const required = ['SHARE_KEY']
  const llmProviders = ['claude', 'gemini', 'openai']

  // Check required core variables
  if (!env.SHARE_KEY) {
    errors.push('SHARE_KEY is required')
    missing.push('SHARE_KEY')
  }

  // Check LLM provider configuration
  const llmProvider = env.LLM_PROVIDER || 'claude'
  if (!llmProviders.includes(llmProvider)) {
    errors.push(`LLM_PROVIDER must be one of: ${llmProviders.join(', ')}`)
  }

  // Check provider-specific API keys
  switch (llmProvider) {
    case 'claude':
      if (!env.ANTHROPIC_API_KEY) {
        errors.push('ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude')
        missing.push('ANTHROPIC_API_KEY')
      }
      break
    case 'gemini':
      if (!env.GOOGLE_VERTEX_KEY && !env.GOOGLE_API_KEY) {
        errors.push('GOOGLE_VERTEX_KEY or GOOGLE_API_KEY is required when LLM_PROVIDER=gemini')
        missing.push('GOOGLE_VERTEX_KEY')
      }
      break
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        errors.push('OPENAI_API_KEY is required when LLM_PROVIDER=openai')
        missing.push('OPENAI_API_KEY')
      }
      break
  }

  // Production-specific checks
  if (mode === 'production' || env.NODE_ENV === 'production') {
    if (!env.NEXT_PUBLIC_APP_URL) {
      errors.push('NEXT_PUBLIC_APP_URL is required in production')
      missing.push('NEXT_PUBLIC_APP_URL')
    }
  }

  // Storage configuration
  const storageDriver = env.STORAGE_DRIVER || 'vercel-blob'
  if (storageDriver === 's3') {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET) {
      errors.push('AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are required when STORAGE_DRIVER=s3')
      if (!env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID')
      if (!env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY')
      if (!env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET')
    }
  }

  // Optional services warnings
  if (!env.ELEVENLABS_API_KEY) {
    warnings.push('ELEVENLABS_API_KEY is not set - TTS features will be unavailable')
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    missing,
    data: {
      NODE_ENV: env.NODE_ENV || 'development',
      LLM_PROVIDER: llmProvider,
      STORAGE_DRIVER: storageDriver,
    }
  }
}

// Format validation results as table
function formatTable(validation, env) {
  const variables = [
    { name: 'SHARE_KEY', value: env.SHARE_KEY, required: true, secret: true },
    { name: 'NODE_ENV', value: env.NODE_ENV || 'development', required: false, secret: false },
    { name: 'NEXT_PUBLIC_APP_URL', value: env.NEXT_PUBLIC_APP_URL, required: env.NODE_ENV === 'production', secret: false },
    { name: 'LLM_PROVIDER', value: env.LLM_PROVIDER || 'claude', required: false, secret: false },
    { name: 'ANTHROPIC_API_KEY', value: env.ANTHROPIC_API_KEY, required: (env.LLM_PROVIDER || 'claude') === 'claude', secret: true },
    { name: 'GOOGLE_VERTEX_KEY', value: env.GOOGLE_VERTEX_KEY, required: env.LLM_PROVIDER === 'gemini' && !env.GOOGLE_API_KEY, secret: true },
    { name: 'GOOGLE_API_KEY', value: env.GOOGLE_API_KEY, required: env.LLM_PROVIDER === 'gemini' && !env.GOOGLE_VERTEX_KEY, secret: true },
    { name: 'OPENAI_API_KEY', value: env.OPENAI_API_KEY, required: env.LLM_PROVIDER === 'openai', secret: true },
    { name: 'STORAGE_DRIVER', value: env.STORAGE_DRIVER || 'vercel-blob', required: false, secret: false },
    { name: 'AWS_ACCESS_KEY_ID', value: env.AWS_ACCESS_KEY_ID, required: env.STORAGE_DRIVER === 's3', secret: true },
    { name: 'AWS_SECRET_ACCESS_KEY', value: env.AWS_SECRET_ACCESS_KEY, required: env.STORAGE_DRIVER === 's3', secret: true },
    { name: 'AWS_S3_BUCKET', value: env.AWS_S3_BUCKET, required: env.STORAGE_DRIVER === 's3', secret: false },
    { name: 'ELEVENLABS_API_KEY', value: env.ELEVENLABS_API_KEY, required: false, secret: true },
  ]

  console.log(colorize('\n📋 Environment Variable Status\n', 'bright'))
  console.log('┌─────────────────────────┬──────────┬─────────────────────────┬──────────────────┐')
  console.log('│ Variable                │ Required │ Status                  │ Value            │')
  console.log('├─────────────────────────┼──────────┼─────────────────────────┼──────────────────┤')

  variables.forEach(({ name, value, required, secret }) => {
    const hasValue = !!value
    const isValid = !required || hasValue

    let status, statusColor
    if (!required && !hasValue) {
      status = 'Optional'
      statusColor = 'gray'
    } else if (isValid) {
      status = 'Valid'
      statusColor = 'green'
    } else {
      status = 'Missing'
      statusColor = 'red'
    }

    const displayValue = secret ? maskSecret(value) : (value || 'not set')
    const requiredText = required ? 'Yes' : 'No'

    console.log(
      `│ ${name.padEnd(23)} │ ${requiredText.padEnd(8)} │ ${colorize(status, statusColor).padEnd(31)} │ ${displayValue.padEnd(16)} │`
    )
  })

  console.log('└─────────────────────────┴──────────┴─────────────────────────┴──────────────────┘\n')

  // Summary
  const validCount = variables.filter(v => !v.required || !!v.value).length
  const totalRequired = variables.filter(v => v.required).length
  const totalOptional = variables.filter(v => !v.required).length

  console.log(colorize('📊 Summary:', 'bright'))
  console.log(`   ✅ Valid: ${validCount}/${variables.length}`)
  console.log(`   🔴 Required: ${totalRequired} (${validation.missing.length} missing)`)
  console.log(`   ⚪ Optional: ${totalOptional}`)

  if (validation.errors.length > 0) {
    console.log(colorize('\n❌ Errors:', 'red'))
    validation.errors.forEach(error => {
      console.log(`   • ${error}`)
    })
  }

  if (validation.warnings.length > 0) {
    console.log(colorize('\n⚠️  Warnings:', 'yellow'))
    validation.warnings.forEach(warning => {
      console.log(`   • ${warning}`)
    })
  }
}

// Format validation results as JSON
function formatJson(validation, env) {
  const result = {
    success: validation.success,
    environment: {
      NODE_ENV: env.NODE_ENV || 'development',
      LLM_PROVIDER: env.LLM_PROVIDER || 'claude',
      STORAGE_DRIVER: env.STORAGE_DRIVER || 'vercel-blob',
    },
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
      missing: validation.missing,
    },
    variables: {
      required: validation.missing.length === 0,
      missing: validation.missing,
      warnings: validation.warnings.length,
    }
  }

  console.log(JSON.stringify(result, null, 2))
}

// Format validation results as summary
function formatSummary(validation) {
  const status = validation.success ? 'READY' : 'INCOMPLETE'
  const statusColor = validation.success ? 'green' : 'red'

  console.log(colorize(`Status: ${status}`, statusColor))
  console.log(`Errors: ${validation.errors.length}`)
  console.log(`Warnings: ${validation.warnings.length}`)
  console.log(`Missing: ${validation.missing.length}`)

  if (validation.errors.length > 0) {
    console.log('\nCritical Issues:')
    validation.errors.slice(0, 3).forEach(error => {
      console.log(`  - ${error}`)
    })
    if (validation.errors.length > 3) {
      console.log(`  ... and ${validation.errors.length - 3} more`)
    }
  }
}

// Show help
function showHelp() {
  console.log(`
${colorize('Environment Validation Tool', 'bright')}

Validates environment variables for deployment readiness.

${colorize('Usage:', 'cyan')}
  npm run env:check [options]

${colorize('Options:', 'cyan')}
  --mode <mode>     Set environment mode (dev|test|prod)
  --format <format> Output format (table|json|summary)
  --strict          Fail on warnings in development mode
  --help, -h        Show this help

${colorize('Examples:', 'cyan')}
  npm run env:check                    # Check with table output
  npm run env:check --mode prod        # Check production requirements
  npm run env:check --format json     # Machine-readable output
  npm run env:check --strict          # Strict mode for CI/CD

${colorize('Exit Codes:', 'cyan')}
  0  All required variables present
  1  Missing required variables
  2  Invalid configuration
`)
}

// Main execution
async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  try {
    // Try to use the TypeScript validation, fall back to manual
    let validationModule
    try {
      validationModule = await importValidation()
    } catch (error) {
      console.warn(colorize('⚠️  Using fallback validation (TypeScript module not available)', 'yellow'))
    }

    const validation = validationModule
      ? validationModule.validateEnvironment(options.mode)
      : manualValidation(options.mode)

    // Format output
    switch (options.format) {
      case 'json':
        formatJson(validation, process.env)
        break
      case 'summary':
        formatSummary(validation)
        break
      case 'table':
      default:
        formatTable(validation, process.env)
        break
    }

    // Determine exit code
    let exitCode = 0

    if (!validation.success) {
      exitCode = 1
    } else if (options.strict && validation.warnings.length > 0) {
      exitCode = 1
      if (options.format === 'table') {
        console.log(colorize('\n❌ Strict mode: failing due to warnings', 'red'))
      }
    }

    process.exit(exitCode)

  } catch (error) {
    console.error(colorize('❌ Validation failed:', 'red'), error.message)
    process.exit(2)
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error(colorize('❌ Unhandled error:', 'red'), error)
  process.exit(2)
})

main()
import { z } from 'zod'

// Environment type enums
const NodeEnvSchema = z.enum(['development', 'test', 'production'])
const LLMProviderSchema = z.enum(['claude', 'gemini', 'openai'])
const StorageDriverSchema = z.enum(['vercel-blob', 's3', 'fs'])

// Core application schema
const CoreSchema = z.object({
  SHARE_KEY: z.string().min(1, 'SHARE_KEY is required'),
  NODE_ENV: NodeEnvSchema.default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
})

// LLM provider configuration
const LLMSchema = z.object({
  LLM_PROVIDER: LLMProviderSchema.default('claude'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_VERTEX_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
})

// Storage configuration
const StorageSchema = z.object({
  STORAGE_DRIVER: StorageDriverSchema,
  VERCEL_BLOB_READ_WRITE_TOKEN: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
})

// Optional services
const ServicesSchema = z.object({
  ELEVENLABS_API_KEY: z.string().optional(),
  DEPLOY_AUTO_PREWARM: z.string().transform(val => val === 'true').default('false'),
})

// Combined base schema
const BaseEnvSchema = CoreSchema
  .merge(LLMSchema)
  .merge(StorageSchema)
  .merge(ServicesSchema)

// Production-specific refinements
const ProductionEnvSchema = BaseEnvSchema.refine(
  (data) => {
    if (data.NODE_ENV === 'production') {
      return data.NEXT_PUBLIC_APP_URL !== undefined
    }
    return true
  },
  {
    message: 'NEXT_PUBLIC_APP_URL is required in production',
    path: ['NEXT_PUBLIC_APP_URL'],
  }
).refine(
  (data) => {
    if (data.LLM_PROVIDER === 'claude') {
      return data.ANTHROPIC_API_KEY !== undefined
    }
    return true
  },
  {
    message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude',
    path: ['ANTHROPIC_API_KEY'],
  }
).refine(
  (data) => {
    if (data.LLM_PROVIDER === 'gemini') {
      return !!(data.GOOGLE_VERTEX_KEY || data.GOOGLE_API_KEY)
    }
    return true
  },
  {
    message: 'GOOGLE_VERTEX_KEY or GOOGLE_API_KEY is required when LLM_PROVIDER=gemini',
    path: ['GOOGLE_VERTEX_KEY'],
  }
).refine(
  (data) => {
    if (data.LLM_PROVIDER === 'openai') {
      return data.OPENAI_API_KEY !== undefined
    }
    return true
  },
  {
    message: 'OPENAI_API_KEY is required when LLM_PROVIDER=openai',
    path: ['OPENAI_API_KEY'],
  }
).refine(
  (data) => {
    if (data.STORAGE_DRIVER === 's3') {
      return data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY && data.AWS_S3_BUCKET
    }
    return true
  },
  {
    message: 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are required when STORAGE_DRIVER=s3',
    path: ['AWS_ACCESS_KEY_ID'],
  }
).refine(
  (data) => {
    // Check if we're in Vercel environment or explicitly using vercel-blob
    const isVercel = !!(process.env.VERCEL || process.env.NEXT_RUNTIME)
    const usingVercelBlob = data.STORAGE_DRIVER === 'vercel-blob' || (isVercel && data.STORAGE_DRIVER !== 'fs')

    if (usingVercelBlob) {
      return data.VERCEL_BLOB_READ_WRITE_TOKEN !== undefined
    }
    return true
  },
  {
    message: 'VERCEL_BLOB_READ_WRITE_TOKEN is required when using Vercel Blob storage',
    path: ['VERCEL_BLOB_READ_WRITE_TOKEN'],
  }
)

// Detect deployment environment
export function detectDeployment(): {
  isVercel: boolean
  isProduction: boolean
  platform: string
} {
  const isVercel = !!(process.env.VERCEL || process.env.NEXT_RUNTIME)
  const isProduction = process.env.NODE_ENV === 'production'

  let platform = 'local'
  if (process.env.VERCEL) platform = 'vercel'
  else if (process.env.RAILWAY_ENVIRONMENT) platform = 'railway'
  else if (process.env.NETLIFY) platform = 'netlify'

  return { isVercel, isProduction, platform }
}

// Storage configuration helpers
export function isVercelEnvironment(): boolean {
  return !!(process.env.VERCEL || process.env.NEXT_RUNTIME)
}

export function getDefaultStorageDriver(): StorageDriver {
  const deployment = detectDeployment()

  // In Vercel environment, default to vercel-blob unless explicitly set to fs
  if (deployment.isVercel && process.env.STORAGE_DRIVER !== 'fs') {
    return 'vercel-blob'
  }

  // In production on other platforms, try vercel-blob if token is available
  if (deployment.isProduction && process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
    return 'vercel-blob'
  }

  // Default to filesystem for development
  return 'fs'
}

export function validateStorageConfig(): {
  valid: boolean
  driver: StorageDriver
  errors: string[]
} {
  const driver = (process.env.STORAGE_DRIVER as StorageDriver) || getDefaultStorageDriver()
  const errors: string[] = []

  switch (driver) {
    case 'vercel-blob':
      if (!process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
        errors.push('VERCEL_BLOB_READ_WRITE_TOKEN is required for Vercel Blob storage')
      }
      break
    case 's3':
      if (!process.env.AWS_ACCESS_KEY_ID) errors.push('AWS_ACCESS_KEY_ID is required for S3 storage')
      if (!process.env.AWS_SECRET_ACCESS_KEY) errors.push('AWS_SECRET_ACCESS_KEY is required for S3 storage')
      if (!process.env.AWS_S3_BUCKET) errors.push('AWS_S3_BUCKET is required for S3 storage')
      break
    case 'fs':
      // No additional requirements for filesystem storage
      break
  }

  return {
    valid: errors.length === 0,
    driver,
    errors
  }
}

// Validation result type
export interface ValidationResult {
  success: boolean
  data?: z.infer<typeof BaseEnvSchema>
  errors: string[]
  warnings: string[]
  missing: string[]
}

// Environment validation function
export function validateEnvironment(mode?: 'development' | 'test' | 'production'): ValidationResult {
  const env = process.env
  const deployment = detectDeployment()
  const effectiveMode = mode || env.NODE_ENV || 'development'

  // Use stricter validation in production
  const schema = effectiveMode === 'production' ? ProductionEnvSchema : BaseEnvSchema

  const result = schema.safeParse(env)
  const errors: string[] = []
  const warnings: string[] = []
  const missing: string[] = []

  if (!result.success) {
    result.error.errors.forEach((e) => {
      const path = e.path.join('.')
      errors.push(`${path}: ${e.message}`)

      // Track missing variables
      if ((e.code === 'invalid_type' && e.received === 'undefined') || (e.code === 'custom' && e.message.toLowerCase().includes('required'))) {
        missing.push(path)
      }
    })
  }

  // Add deployment-specific warnings
  if (deployment.isProduction && !env.NEXT_PUBLIC_APP_URL) {
    warnings.push('NEXT_PUBLIC_APP_URL should be set in production for proper client-side functionality')
  }

  if (!env.ELEVENLABS_API_KEY) {
    warnings.push('ELEVENLABS_API_KEY is not set - TTS features will be unavailable')
  }

  // Add storage-specific warnings
  const storageConfig = validateStorageConfig()
  if (!storageConfig.valid) {
    storageConfig.errors.forEach(error => warnings.push(`Storage: ${error}`))
  }

  return {
    success: result.success,
    data: result.success ? result.data : undefined,
    errors,
    warnings,
    missing,
  }
}

// Print missing variables helper
export function printMissing(validation: ValidationResult): void {
  if (validation.missing.length > 0) {
    console.error('Missing required environment variables:')
    validation.missing.forEach((variable) => {
      console.error(`  - ${variable}`)
    })
  }

  if (validation.warnings.length > 0) {
    console.warn('Environment warnings:')
    validation.warnings.forEach((warning) => {
      console.warn(`  - ${warning}`)
    })
  }

  // Add storage configuration info
  const storageConfig = validateStorageConfig()
  console.log(`Storage driver: ${storageConfig.driver} (${storageConfig.valid ? 'configured' : 'needs configuration'})`)
}

// Export validated environment (throws on validation failure)
export function getValidatedEnv(): z.infer<typeof BaseEnvSchema> {
  const validation = validateEnvironment()

  if (!validation.success) {
    console.error('Environment validation failed:')
    validation.errors.forEach((error) => {
      console.error(`  - ${error}`)
    })
    throw new Error('Invalid environment configuration')
  }

  return validation.data!
}

// Export types
export type EnvConfig = z.infer<typeof BaseEnvSchema>
export type NodeEnv = z.infer<typeof NodeEnvSchema>
export type LLMProvider = z.infer<typeof LLMProviderSchema>
export type StorageDriver = z.infer<typeof StorageDriverSchema>
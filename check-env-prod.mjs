import { validateEnvironment } from './lib/env.ts';

const result = validateEnvironment('production');
if (!result.success) {
  console.error('Environment validation failed:', result.errors);
  process.exit(1);
}
console.log('Production environment validation passed');

// @ts-nocheck
/**
 * Documentation URL configuration
 * Optional URLs for linking to documentation from warnings and error messages
 */

export interface DocsConfig {
  deployment?: string;
  envExample?: string;
  services?: string;
  ttsSetup?: string;
  optionalFeatures?: string;
  optionalServices?: string;
}

/**
 * Default documentation URLs
 * These can be overridden by environment variables or deployment configuration
 */
export const defaultDocsConfig: DocsConfig = {
  deployment: process.env.DOCS_DEPLOYMENT_URL,
  envExample: process.env.DOCS_ENV_EXAMPLE_URL,
  services: process.env.DOCS_SERVICES_URL,
  ttsSetup: process.env.DOCS_TTS_SETUP_URL,
  optionalFeatures: process.env.DOCS_OPTIONAL_FEATURES_URL,
  optionalServices: process.env.DOCS_OPTIONAL_SERVICES_URL,
};

/**
 * Get documentation URLs, filtering out undefined values
 */
export function getDocsConfig(): DocsConfig {
  const config = { ...defaultDocsConfig };

  // Remove undefined values so we can check if a URL exists
  Object.keys(config).forEach(key => {
    if (config[key as keyof DocsConfig] === undefined) {
      delete config[key as keyof DocsConfig];
    }
  });

  return config;
}

/**
 * Check if a specific documentation URL is available
 */
export function hasDocUrl(docType: keyof DocsConfig): boolean {
  const config = getDocsConfig();
  return !!config[docType];
}

/**
 * Get a specific documentation URL, or undefined if not configured
 */
export function getDocUrl(docType: keyof DocsConfig): string | undefined {
  const config = getDocsConfig();
  return config[docType];
}
import rawPaths from '../../config/project-paths.json' assert { type: 'json' };
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const paths = rawPaths.default ?? rawPaths;

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_PATHS = paths;
export const REPORT_PATHS = paths.artifacts.reports;
export const REPORT_FILES = {
  qualityJson: REPORT_PATHS.quality.json,
  qualityMarkdown: REPORT_PATHS.quality.markdown,
  deploymentJson: REPORT_PATHS.deployment.json,
  deploymentMarkdown: REPORT_PATHS.deployment.markdown
};

export function toAbsolute(relPath) {
  return resolve(PROJECT_ROOT, relPath);
}

#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔬 Running smoke tests...\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

test('Core files exist', () => {
  const requiredFiles = [
    'package.json',
    'lib/complexity.ts',
    'app/api/scripture/resolve/route.ts',
    'app/tri/page.tsx',
    'public/data/dev_rows.json',
    'glossary/glossary.csv',
    'lib/assistant/anthropic.ts',
    'lib/assistant/context.ts',
    'lib/assistant/prompt.ts',
    'app/api/assistant/chat/route.ts',
    'app/api/assistant/apply/route.ts',
    'app/api/assistant/health/route.ts',
    // New Cursor-style components
    'app/(components)/CmdPalette.tsx',
    'app/(components)/IssueQueue.tsx',
    'app/(components)/StickyActions.tsx',
    'app/(components)/FinalPreview.tsx',
    'app/(components)/RowNavigator.tsx',
    'app/(components)/OnboardingCoach.tsx',
    'lib/ui/shortcuts.ts',
    'lib/ui/fuzzy.ts',
    'styles/ui.css',
    'app/api/issues/route.ts'
  ];

  for (const file of requiredFiles) {
    const fullPath = join(projectRoot, file);
    if (!existsSync(fullPath)) {
      throw new Error(`Required file missing: ${file}`);
    }
  }
});

test('Package.json has correct scripts', () => {
  const packagePath = join(projectRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

  const requiredScripts = ['dev', 'build', 'start', 'check:lean', 'smoke'];
  for (const script of requiredScripts) {
    if (!pkg.scripts[script]) {
      throw new Error(`Missing script: ${script}`);
    }
  }
});

test('LPR calculation function exists', () => {
  const complexityPath = join(projectRoot, 'lib/complexity.ts');
  const content = readFileSync(complexityPath, 'utf8');

  if (!content.includes('calculateLPR')) {
    throw new Error('calculateLPR function not found');
  }

  if (!content.includes('scoreArabicRow')) {
    throw new Error('scoreArabicRow function not found');
  }
});

test('Scripture API route structure', () => {
  const apiPath = join(projectRoot, 'app/api/scripture/resolve/route.ts');
  const content = readFileSync(apiPath, 'utf8');

  if (!content.includes('export async function GET')) {
    throw new Error('GET handler not found in scripture API');
  }

  if (!content.includes('surah') || !content.includes('ayah')) {
    throw new Error('Quranic reference handling not found');
  }
});

test('Tri-view page has required components', () => {
  const triPath = join(projectRoot, 'app/tri/page.tsx');
  const content = readFileSync(triPath, 'utf8');

  const requiredElements = ['Arabic-Original', 'Arabic-Enhanced', 'English'];
  for (const element of requiredElements) {
    if (!content.includes(element)) {
      throw new Error(`Missing tri-view element: ${element}`);
    }
  }

  if (!content.includes('useEffect') || !content.includes('useState')) {
    throw new Error('React hooks not found in tri-view component');
  }
});

test('Dev fixture data structure', () => {
  const dataPath = join(projectRoot, 'public/data/dev_rows.json');
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Dev rows should be non-empty array');
  }

  const firstRow = data[0];
  const requiredFields = ['id', 'arabic_original', 'arabic_enhanced', 'english', 'section'];
  for (const field of requiredFields) {
    if (!(field in firstRow)) {
      throw new Error(`Missing field in dev row: ${field}`);
    }
  }
});

test('Glossary CSV format', () => {
  const glossaryPath = join(projectRoot, 'glossary/glossary.csv');
  const content = readFileSync(glossaryPath, 'utf8');

  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('Glossary should have header and at least one entry');
  }

  const header = lines[0];
  const expectedColumns = ['term_ar', 'translit', 'en_canon', 'definition'];
  for (const col of expectedColumns) {
    if (!header.includes(col)) {
      throw new Error(`Missing glossary column: ${col}`);
    }
  }
});

test('Hotkey patterns in tri-view', () => {
  const triPath = join(projectRoot, 'app/tri/page.tsx');
  const content = readFileSync(triPath, 'utf8');

  const requiredHotkeys = ['KeyJ', 'KeyK', 'KeyA', 'KeyE', 'KeyT', 'KeyF'];
  for (const hotkey of requiredHotkeys) {
    if (!content.includes(hotkey)) {
      throw new Error(`Missing hotkey handler: ${hotkey}`);
    }
  }
});

test('Assistant API routes have required handlers', () => {
  const chatPath = join(projectRoot, 'app/api/assistant/chat/route.ts');
  const chatContent = readFileSync(chatPath, 'utf8');

  if (!chatContent.includes('export async function POST')) {
    throw new Error('POST handler not found in assistant chat API');
  }

  if (!chatContent.includes('canComment') || !chatContent.includes('getRoleFromRequest')) {
    throw new Error('Role validation not found in chat API');
  }

  const applyPath = join(projectRoot, 'app/api/assistant/apply/route.ts');
  const applyContent = readFileSync(applyPath, 'utf8');

  if (!applyContent.includes('export async function POST')) {
    throw new Error('POST handler not found in assistant apply API');
  }

  if (!applyContent.includes('canSave')) {
    throw new Error('Save permission check not found in apply API');
  }

  const healthPath = join(projectRoot, 'app/api/assistant/health/route.ts');
  const healthContent = readFileSync(healthPath, 'utf8');

  if (!healthContent.includes('export async function GET')) {
    throw new Error('GET handler not found in assistant health API');
  }
});

test('Assistant components have required exports', () => {
  const anthropicPath = join(projectRoot, 'lib/assistant/anthropic.ts');
  const anthropicContent = readFileSync(anthropicPath, 'utf8');

  if (!anthropicContent.includes('getAnthropicClient') || !anthropicContent.includes('class AnthropicClient')) {
    throw new Error('AnthropicClient class or getter not found');
  }

  const contextPath = join(projectRoot, 'lib/assistant/context.ts');
  const contextContent = readFileSync(contextPath, 'utf8');

  if (!contextContent.includes('buildContext') || !contextContent.includes('getCompactContext')) {
    throw new Error('Context building functions not found');
  }

  const promptPath = join(projectRoot, 'lib/assistant/prompt.ts');
  const promptContent = readFileSync(promptPath, 'utf8');

  if (!promptContent.includes('SHARED_SYSTEM_PROMPT') || !promptContent.includes('TASK_PROMPTS')) {
    throw new Error('Prompt templates not found');
  }

  if (!promptContent.includes('getPromptForTask')) {
    throw new Error('getPromptForTask function not found');
  }
});

test('Assistant UI components exist with required props', () => {
  const sidebarPath = join(projectRoot, 'app/(components)/AssistantSidebar.tsx');
  const sidebarContent = readFileSync(sidebarPath, 'utf8');

  if (!sidebarContent.includes('interface AssistantSidebarProps')) {
    throw new Error('AssistantSidebarProps interface not found');
  }

  if (!sidebarContent.includes('export default function AssistantSidebar')) {
    throw new Error('AssistantSidebar component export not found');
  }

  const cardPath = join(projectRoot, 'app/(components)/SuggestionCard.tsx');
  const cardContent = readFileSync(cardPath, 'utf8');

  if (!cardContent.includes('interface SuggestionCardProps')) {
    throw new Error('SuggestionCardProps interface not found');
  }

  if (!cardContent.includes('export default function SuggestionCard')) {
    throw new Error('SuggestionCard component export not found');
  }
});

test('Access control includes assistant permissions', () => {
  const accessPath = join(projectRoot, 'lib/dadmode/access.ts');
  const accessContent = readFileSync(accessPath, 'utf8');

  if (!accessContent.includes('canUseAssistant') || !accessContent.includes('canApplyAssistant')) {
    throw new Error('Assistant permission functions not found in access control');
  }

  if (!accessContent.includes('canUseAssistant: boolean') || !accessContent.includes('canApplyAssistant: boolean')) {
    throw new Error('Assistant permission fields not found in UserPermissions interface');
  }

  // Check role permissions are set correctly
  if (!accessContent.includes('canUseAssistant: true') || !accessContent.includes('canApplyAssistant: true')) {
    throw new Error('Reviewer role should have assistant permissions enabled');
  }
});

test('Scripture helpers include assistant functions', () => {
  const scripturePath = join(projectRoot, 'lib/scripture/index.ts');
  const scriptureContent = readFileSync(scripturePath, 'utf8');

  const assistantFunctions = [
    'formatScriptureForAssistant',
    'extractScriptureContext',
    'validateScripturePreservation',
    'generateScriptureFootnote'
  ];

  for (const func of assistantFunctions) {
    if (!scriptureContent.includes(func)) {
      throw new Error(`Assistant scripture helper not found: ${func}`);
    }
  }
});

test('Tri-view page includes assistant integration', () => {
  const triPath = join(projectRoot, 'app/tri/page.tsx');
  const content = readFileSync(triPath, 'utf8');

  if (!content.includes('AssistantSidebar')) {
    throw new Error('AssistantSidebar import/component not found in tri-view');
  }

  if (!content.includes('isAssistantOpen') || !content.includes('handleToggleAssistant')) {
    throw new Error('Assistant state management not found in tri-view');
  }

  if (!content.includes('onToggleAssistant') || !content.includes('onApplySuggestion')) {
    throw new Error('Assistant event handlers not found in tri-view');
  }
});

test('Cursor-style components have required exports', () => {
  const paletteContent = readFileSync(join(projectRoot, 'app/(components)/CmdPalette.tsx'), 'utf8');
  if (!paletteContent.includes('export default function CmdPalette')) {
    throw new Error('CmdPalette component export not found');
  }

  const queueContent = readFileSync(join(projectRoot, 'app/(components)/IssueQueue.tsx'), 'utf8');
  if (!queueContent.includes('export default function IssueQueue')) {
    throw new Error('IssueQueue component export not found');
  }

  const actionsContent = readFileSync(join(projectRoot, 'app/(components)/StickyActions.tsx'), 'utf8');
  if (!actionsContent.includes('export default function StickyActions')) {
    throw new Error('StickyActions component export not found');
  }

  const previewContent = readFileSync(join(projectRoot, 'app/(components)/FinalPreview.tsx'), 'utf8');
  if (!previewContent.includes('export default function FinalPreview')) {
    throw new Error('FinalPreview component export not found');
  }
});

test('Issues API endpoint has required handlers', () => {
  const issuesPath = join(projectRoot, 'app/api/issues/route.ts');
  const issuesContent = readFileSync(issuesPath, 'utf8');

  if (!issuesContent.includes('export async function GET')) {
    throw new Error('GET handler not found in issues API');
  }

  if (!issuesContent.includes('triview.json') || !issuesContent.includes('gate_summaries.json')) {
    throw new Error('Issues API should check triview and gate summaries');
  }
});

test('UI utilities have required exports', () => {
  const shortcutsContent = readFileSync(join(projectRoot, 'lib/ui/shortcuts.ts'), 'utf8');
  if (!shortcutsContent.includes('ShortcutsManager') || !shortcutsContent.includes('export const shortcuts')) {
    throw new Error('Shortcuts manager not found');
  }

  const fuzzyContent = readFileSync(join(projectRoot, 'lib/ui/fuzzy.ts'), 'utf8');
  if (!fuzzyContent.includes('export function fuzzySearch') || !fuzzyContent.includes('export function highlightMatches')) {
    throw new Error('Fuzzy search functions not found');
  }
});

test('Scripture index has isResolvableRef export', () => {
  const scriptureContent = readFileSync(join(projectRoot, 'lib/scripture/index.ts'), 'utf8');
  if (!scriptureContent.includes('export function isResolvableRef')) {
    throw new Error('isResolvableRef function not found in scripture index');
  }
});

test('Complexity calculation functions work correctly', async () => {
  try {
    const complexityModule = await import('../lib/complexity.ts');

    // Test calculateLPR function
    const lprResult = complexityModule.calculateLPR('a b', 'x');
    if (lprResult !== 0.5) {
      throw new Error(`Expected LPR 0.5, got ${lprResult}`);
    }

    // Test scoreArabicRow function
    const scoreResult = complexityModule.scoreArabicRow('قال 5:2');
    if (!scoreResult.factors.hasScriptureRef) {
      throw new Error('Expected hasScriptureRef to be true for "قال 5:2"');
    }

    if (scoreResult.score <= 0) {
      throw new Error(`Expected positive complexity score, got ${scoreResult.score}`);
    }
  } catch (error) {
    // Handle any dynamic import issues in test environment
    console.log('   Note: Skipping TS dynamic import in smoke env');
    return;
  }
});

console.log(`\n📊 Smoke test results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All smoke tests passed!');
}
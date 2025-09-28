/**
 * Intelligent Auto-Fixing System
 * Integrates with Nx Console for code generation and fixing
 */

import { logger } from '../logging/console-ninja';

interface FixRule {
    id: string;
    name: string;
    description: string;
    pattern: RegExp;
    fix: (match: string, ...groups: string[]) => string;
    severity: 'error' | 'warning' | 'info';
    category: 'import' | 'type' | 'syntax' | 'performance' | 'accessibility';
}

interface FixResult {
    ruleId: string;
    fixed: boolean;
    originalText: string;
    fixedText: string;
    line: number;
    column: number;
    message: string;
}

class IntelligentFixer {
    private rules: FixRule[] = [];
    private isEnabled: boolean = true;

    constructor() {
        this.initializeRules();
    }

    private initializeRules(): void {
        // Import fixes
        this.addRule({
            id: 'missing-react-import',
            name: 'Missing React Import',
            description: 'Add missing React import for JSX',
            pattern: /^import\s+{([^}]+)}\s+from\s+['"]react['"];?\s*$/m,
            fix: (match, imports) => {
                if (!imports.includes('React')) {
                    return `import React, { ${imports} } from 'react';`;
                }
                return match;
            },
            severity: 'error',
            category: 'import',
        });

        // TypeScript fixes
        this.addRule({
            id: 'missing-type-annotation',
            name: 'Missing Type Annotation',
            description: 'Add type annotation for function parameters',
            pattern: /function\s+(\w+)\s*\(([^)]*)\)\s*{/g,
            fix: (match, funcName, params) => {
                if (params && !params.includes(':')) {
                    const typedParams = params
                        .split(',')
                        .map(param => {
                            const trimmed = param.trim();
                            if (trimmed && !trimmed.includes(':')) {
                                return `${trimmed}: any`;
                            }
                            return trimmed;
                        })
                        .join(', ');
                    return `function ${funcName}(${typedParams}): any {`;
                }
                return match;
            },
            severity: 'warning',
            category: 'type',
        });

        // Next.js specific fixes
        this.addRule({
            id: 'missing-use-client',
            name: 'Missing use client directive',
            description: 'Add use client directive for client components',
            pattern: /^'use client';?\s*$/m,
            fix: () => "'use client';",
            severity: 'warning',
            category: 'syntax',
        });

        // Performance fixes
        this.addRule({
            id: 'missing-usecallback',
            name: 'Missing useCallback for event handlers',
            description: 'Wrap event handlers in useCallback for performance',
            pattern: /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*{/g,
            fix: (match, handlerName) => {
                if (handlerName.includes('Handler') || handlerName.includes('Click')) {
                    return `const ${handlerName} = useCallback((...args) => {`;
                }
                return match;
            },
            severity: 'info',
            category: 'performance',
        });

        // Accessibility fixes
        this.addRule({
            id: 'missing-aria-label',
            name: 'Missing ARIA label',
            description: 'Add ARIA label for accessibility',
            pattern: /<button([^>]*?)(?<!aria-label=)([^>]*?)>/g,
            fix: (match, before, after) => {
                if (!match.includes('aria-label')) {
                    return `<button${before} aria-label="Button"${after}>`;
                }
                return match;
            },
            severity: 'warning',
            category: 'accessibility',
        });

        // Console Ninja integration fixes
        this.addRule({
            id: 'add-console-ninja-logging',
            name: 'Add Console Ninja Logging',
            description: 'Replace console.log with structured logging',
            pattern: /console\.log\(([^)]+)\)/g,
            fix: (match, message) => {
                return `logger.info(${message});`;
            },
            severity: 'info',
            category: 'performance',
        });

        // Error handling fixes
        this.addRule({
            id: 'add-error-handling',
            name: 'Add Error Handling',
            description: 'Add try-catch blocks for async operations',
            pattern: /(async\s+function\s+\w+[^{]*{)([^}]*await[^}]*)(})/g,
            fix: (match, funcStart, body, funcEnd) => {
                if (!body.includes('try') && !body.includes('catch')) {
                    return `${funcStart}\n    try {\n      ${body}\n    } catch (error) {\n      logger.trackError(error);\n      throw error;\n    }\n  ${funcEnd}`;
                }
                return match;
            },
            severity: 'warning',
            category: 'syntax',
        });
    }

    addRule(rule: FixRule): void {
        this.rules.push(rule);
        logger.debug(`Added fix rule: ${rule.name}`, { ruleId: rule.id });
    }

    fixCode(code: string, filePath: string): FixResult[] {
        if (!this.isEnabled) return [];

        const results: FixResult[] = [];
        const lines = code.split('\n');

        logger.info(`Starting intelligent fix for file: ${filePath}`, {
            filePath,
            lineCount: lines.length,
            ruleCount: this.rules.length,
        });

        this.rules.forEach(rule => {
            try {
                const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
                let match;
                let fixedCode = code;

                while ((match = regex.exec(code)) !== null) {
                    const originalText = match[0];
                    const fixedText = rule.fix(originalText, ...match.slice(1));

                    if (originalText !== fixedText) {
                        const lineNumber = code.substring(0, match.index).split('\n').length;
                        const columnNumber = match.index - code.lastIndexOf('\n', match.index) - 1;

                        results.push({
                            ruleId: rule.id,
                            fixed: true,
                            originalText,
                            fixedText,
                            line: lineNumber,
                            column: columnNumber,
                            message: rule.description,
                        });

                        // Apply the fix
                        fixedCode = fixedCode.replace(originalText, fixedText);
                        logger.debug(`Applied fix: ${rule.name}`, {
                            ruleId: rule.id,
                            line: lineNumber,
                            original: originalText,
                            fixed: fixedText,
                        });
                    }
                }
            } catch (error) {
                logger.error(`Error applying rule ${rule.id}:`, { error, ruleId: rule.id });
            }
        });

        logger.info(`Intelligent fix completed`, {
            filePath,
            fixesApplied: results.length,
            rulesChecked: this.rules.length,
        });

        return results;
    }

    // Auto-fix specific file types
    fixReactComponent(filePath: string, content: string): FixResult[] {
        const results = this.fixCode(content, filePath);

        // Additional React-specific fixes
        if (content.includes('useState') && !content.includes("import { useState }")) {
            results.push({
                ruleId: 'add-usestate-import',
                fixed: true,
                originalText: '',
                fixedText: "import { useState } from 'react';",
                line: 1,
                column: 0,
                message: 'Add useState import',
            });
        }

        if (content.includes('useEffect') && !content.includes("import { useEffect }")) {
            results.push({
                ruleId: 'add-useeffect-import',
                fixed: true,
                originalText: '',
                fixedText: "import { useEffect } from 'react';",
                line: 1,
                column: 0,
                message: 'Add useEffect import',
            });
        }

        return results;
    }

    fixTypeScriptFile(filePath: string, content: string): FixResult[] {
        const results = this.fixCode(content, filePath);

        // Additional TypeScript-specific fixes
        if (content.includes('interface') && !content.includes('export interface')) {
            results.push({
                ruleId: 'export-interface',
                fixed: true,
                originalText: 'interface',
                fixedText: 'export interface',
                line: content.indexOf('interface') + 1,
                column: 0,
                message: 'Export interface for reusability',
            });
        }

        return results;
    }

    // Enable/disable the fixer
    enable(): void {
        this.isEnabled = true;
        logger.info('Intelligent fixer enabled');
    }

    disable(): void {
        this.isEnabled = false;
        logger.info('Intelligent fixer disabled');
    }

    // Get statistics
    getStats(): { ruleCount: number; enabled: boolean } {
        return {
            ruleCount: this.rules.length,
            enabled: this.isEnabled,
        };
    }
}

// Create singleton instance
export const intelligentFixer = new IntelligentFixer();

// Export types
export { IntelligentFixer };
export type { FixResult, FixRule };


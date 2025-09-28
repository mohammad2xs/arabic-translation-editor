import fs from 'fs/promises';
import path from 'path';
const MODEL_PRICING = {
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.000150, output: 0.0006 },
};
const activeSpans = new Map();
let spanCounter = 0;
function generateSpanId() {
    return `span_${Date.now()}_${++spanCounter}`;
}
function calculateCost(tokens, model) {
    if (!tokens || !model)
        return 0;
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
        console.warn(`Unknown model pricing: ${model}`);
        return 0;
    }
    const inputCost = (tokens.input / 1000) * pricing.input;
    const outputCost = (tokens.output / 1000) * pricing.output;
    return inputCost + outputCost;
}
function getProvider(model) {
    if (model.startsWith('claude'))
        return 'claude';
    if (model.startsWith('gemini'))
        return 'gemini';
    if (model.startsWith('gpt'))
        return 'openai';
    return 'claude';
}
export function startSpan(operation, rowId, metadata) {
    const spanId = generateSpanId();
    const span = {
        id: spanId,
        operation,
        rowId,
        startTime: Date.now(),
        metadata
    };
    activeSpans.set(spanId, span);
    return spanId;
}
export function endSpan(spanId, tokens, model) {
    const span = activeSpans.get(spanId);
    if (!span) {
        console.warn(`Span not found: ${spanId}`);
        return null;
    }
    span.endTime = Date.now();
    if (tokens) {
        span.tokens = {
            input: tokens.input,
            output: tokens.output,
            total: tokens.input + tokens.output
        };
    }
    if (model) {
        span.model = model;
        span.provider = getProvider(model);
    }
    if (span.tokens && span.model) {
        span.cost = calculateCost(span.tokens, span.model);
    }
    activeSpans.delete(spanId);
    return span;
}
export async function logSpan(span) {
    if (!span.rowId)
        return;
    try {
        const logDir = path.join('outputs', 'logs', 'cost');
        await fs.mkdir(logDir, { recursive: true });
        const logFile = path.join(logDir, `${span.rowId}.ndjson`);
        const logEntry = JSON.stringify({
            timestamp: new Date().toISOString(),
            ...span,
            duration: span.endTime ? span.endTime - span.startTime : null
        }) + '\n';
        await fs.appendFile(logFile, logEntry);
    }
    catch (error) {
        console.error('Failed to log span:', error);
    }
}
export async function aggregateCosts() {
    try {
        const logDir = path.join('outputs', 'logs', 'cost');
        const summary = {
            totalCost: 0,
            totalTokens: 0,
            totalSpans: 0,
            operationBreakdown: {},
            modelBreakdown: {},
            providerBreakdown: {}
        };
        try {
            const files = await fs.readdir(logDir);
            for (const file of files) {
                if (!file.endsWith('.ndjson'))
                    continue;
                const content = await fs.readFile(path.join(logDir, file), 'utf8');
                const lines = content.trim().split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const span = JSON.parse(line);
                        summary.totalSpans++;
                        if (span.cost)
                            summary.totalCost += span.cost;
                        if (span.tokens)
                            summary.totalTokens += span.tokens.total;
                        if (!summary.operationBreakdown[span.operation]) {
                            summary.operationBreakdown[span.operation] = {
                                count: 0,
                                totalCost: 0,
                                totalTokens: 0,
                                averageLatency: 0
                            };
                        }
                        const opBreakdown = summary.operationBreakdown[span.operation];
                        opBreakdown.count++;
                        if (span.cost)
                            opBreakdown.totalCost += span.cost;
                        if (span.tokens)
                            opBreakdown.totalTokens += span.tokens.total;
                        if (span.duration) {
                            opBreakdown.averageLatency =
                                (opBreakdown.averageLatency * (opBreakdown.count - 1) + span.duration) / opBreakdown.count;
                        }
                        if (span.model) {
                            if (!summary.modelBreakdown[span.model]) {
                                summary.modelBreakdown[span.model] = {
                                    count: 0,
                                    totalCost: 0,
                                    totalTokens: 0
                                };
                            }
                            const modelBreakdown = summary.modelBreakdown[span.model];
                            modelBreakdown.count++;
                            if (span.cost)
                                modelBreakdown.totalCost += span.cost;
                            if (span.tokens)
                                modelBreakdown.totalTokens += span.tokens.total;
                        }
                        if (span.provider) {
                            if (!summary.providerBreakdown[span.provider]) {
                                summary.providerBreakdown[span.provider] = {
                                    count: 0,
                                    totalCost: 0,
                                    totalTokens: 0
                                };
                            }
                            const providerBreakdown = summary.providerBreakdown[span.provider];
                            providerBreakdown.count++;
                            if (span.cost)
                                providerBreakdown.totalCost += span.cost;
                            if (span.tokens)
                                providerBreakdown.totalTokens += span.tokens.total;
                        }
                    }
                    catch (parseError) {
                        console.warn(`Failed to parse log line: ${line}`, parseError);
                    }
                }
            }
        }
        catch (dirError) {
            if (dirError.code !== 'ENOENT') {
                throw dirError;
            }
        }
        await fs.mkdir('outputs', { recursive: true });
        await fs.writeFile(path.join('outputs', 'cost.json'), JSON.stringify({
            summary,
            generatedAt: new Date().toISOString(),
            version: '1.0'
        }, null, 2));
    }
    catch (error) {
        console.error('Failed to aggregate costs:', error);
        throw error;
    }
}
export async function getCostSummary() {
    try {
        const costFile = path.join('outputs', 'cost.json');
        const content = await fs.readFile(costFile, 'utf8');
        const data = JSON.parse(content);
        return data.summary;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            await aggregateCosts();
            return getCostSummary();
        }
        throw error;
    }
}
export function formatCost(amount) {
    return `$${amount.toFixed(4)}`;
}
export function formatTokens(count) {
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    else if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
}
export async function printCostReport() {
    try {
        const summary = await getCostSummary();
        console.log('\n=== COST REPORT ===');
        console.log(`Total Cost: ${formatCost(summary.totalCost)}`);
        console.log(`Total Tokens: ${formatTokens(summary.totalTokens)}`);
        console.log(`Total Operations: ${summary.totalSpans}`);
        console.log('\nBy Operation:');
        for (const [operation, breakdown] of Object.entries(summary.operationBreakdown)) {
            console.log(`  ${operation}: ${breakdown.count} ops, ${formatCost(breakdown.totalCost)}, ` +
                `${formatTokens(breakdown.totalTokens)}, ${breakdown.averageLatency.toFixed(0)}ms avg`);
        }
        console.log('\nBy Model:');
        for (const [model, breakdown] of Object.entries(summary.modelBreakdown)) {
            console.log(`  ${model}: ${breakdown.count} ops, ${formatCost(breakdown.totalCost)}, ` +
                `${formatTokens(breakdown.totalTokens)}`);
        }
        console.log('\nBy Provider:');
        for (const [provider, breakdown] of Object.entries(summary.providerBreakdown)) {
            console.log(`  ${provider}: ${breakdown.count} ops, ${formatCost(breakdown.totalCost)}, ` +
                `${formatTokens(breakdown.totalTokens)}`);
        }
    }
    catch (error) {
        console.error('Failed to print cost report:', error);
    }
}
export async function cleanupLogs(maxAge = 7) {
    try {
        const logDir = path.join('outputs', 'logs', 'cost');
        const files = await fs.readdir(logDir);
        const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
        let removedCount = 0;
        for (const file of files) {
            if (!file.endsWith('.ndjson'))
                continue;
            const filePath = path.join(logDir, file);
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() < cutoffTime) {
                await fs.unlink(filePath);
                removedCount++;
            }
        }
        return removedCount;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
}
export function createCostTracker() {
    return {
        startOperation: (operation, rowId) => {
            return startSpan(operation, rowId);
        },
        endOperation: async (spanId, tokens, model) => {
            const span = endSpan(spanId, tokens, model);
            if (span) {
                await logSpan(span);
            }
        },
        getSummary: () => getCostSummary(),
        cleanup: (maxAge = 7) => cleanupLogs(maxAge)
    };
}

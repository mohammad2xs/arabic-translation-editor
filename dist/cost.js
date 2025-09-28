import fs from 'fs/promises';
import path from 'path';
const MODEL_PRICING = {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.000150, output: 0.0006 },
    'gpt-4.1': { input: 0.003, output: 0.012 },
    'gpt-4.1-mini': { input: 0.00015, output: 0.0006 }
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
    if (model.startsWith('gpt'))
        return 'openai';
    return 'openai';
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
                    catch (error) {
                        console.warn('Failed to parse cost log entry:', error);
                    }
                }
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        const summaryDir = path.join('outputs', 'logs', 'cost');
        await fs.mkdir(summaryDir, { recursive: true });
        await fs.writeFile(path.join(summaryDir, 'summary.json'), JSON.stringify(summary, null, 2));
    }
    catch (error) {
        console.error('Failed to aggregate costs:', error);
    }
}

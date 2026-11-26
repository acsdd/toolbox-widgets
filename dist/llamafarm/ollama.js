/**
 * Ollama helpers for the Model Farm.
 *
 * Ollama can serve any GGUF straight from the Hugging Face Hub:
 *   ollama run hf.co/{owner}/{repo}:{quant}
 * These helpers turn a catalog entry into that reference, probe the local
 * runtime and pull the weights in.
 */
import { spawn } from 'node:child_process';
/** Ollama accepts both hosts; the short one is what its own docs use. */
export const OLLAMA_HF_HOST = 'hf.co';
const OLLAMA_HF_HOST_ALIASES = ['hf.co', 'huggingface.co'];
/**
 * The quantization schemes Ollama accepts as an `hf.co` tag. Ollama matches a
 * tag against the file names a repository publishes, so a label that is not
 * one of these is rejected outright.
 */
const OLLAMA_QUANT_TAGS = new Set([
    'F32',
    'F16',
    'BF16',
    'Q4_0',
    'Q4_1',
    'Q5_0',
    'Q5_1',
    'Q8_0',
    'Q2_K',
    'Q3_K_S',
    'Q3_K_M',
    'Q3_K_L',
    'Q4_K_S',
    'Q4_K_M',
    'Q5_K_S',
    'Q5_K_M',
    'Q6_K',
    'IQ1_S',
    'IQ1_M',
    'IQ2_XXS',
    'IQ2_XS',
    'IQ2_S',
    'IQ2_M',
    'IQ3_XXS',
    'IQ3_XS',
    'IQ3_S',
    'IQ3_M',
    'IQ4_XS',
    'IQ4_NL',
    'TQ1_0',
    'TQ2_0'
]);
/** Labels that name an Ollama scheme under a different spelling. */
const OLLAMA_QUANT_ALIASES = { FP16: 'F16', FP32: 'F32' };
/** The tag Ollama serves when a repository publishes no matching quantization. */
export const OLLAMA_DEFAULT_TAG = 'latest';
/**
 * Map a quantization label onto a tag Ollama understands, or null when it
 * cannot use the label at all. A file called `model.q8.gguf` yields the label
 * "Q8", which Ollama rejects — its scheme is `Q8_0` — so the caller falls
 * back to the repository default.
 */
export function normalizeOllamaQuantTag(quantLabel) {
    if (!quantLabel)
        return null;
    const key = quantLabel.trim().toUpperCase();
    if (!key)
        return null;
    const alias = OLLAMA_QUANT_ALIASES[key];
    if (alias)
        return alias;
    return OLLAMA_QUANT_TAGS.has(key) ? key : null;
}
/** Replace the tag of an Ollama reference with the repository default. */
export function latestReference(reference) {
    const index = reference.lastIndexOf(':');
    return index === -1 ? `${reference}:${OLLAMA_DEFAULT_TAG}` : `${reference.slice(0, index)}:${OLLAMA_DEFAULT_TAG}`;
}
/** True when Ollama refused a reference because of its quantization tag. */
export function isQuantTagRejection(text) {
    return /not a valid quantization scheme|not available in the repository/i.test(text);
}
/** Strip a HuggingFace URL down to 'owner/repo'. */
export function normalizeRepoId(repoId) {
    return repoId
        .trim()
        .replace(/^https?:\/\/[^/]+\//i, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}
/**
 * Build the Ollama reference for a HuggingFace repo. The tag is the
 * quantization Ollama can serve; a label it cannot use falls back to the
 * repository default, which Ollama always resolves.
 */
export function ollamaReference(repoId, quantLabel) {
    const id = normalizeRepoId(repoId);
    const tag = normalizeOllamaQuantTag(quantLabel) ?? OLLAMA_DEFAULT_TAG;
    return `${OLLAMA_HF_HOST}/${id}:${tag}`;
}
/** A safe local Ollama model name derived from the catalog label. */
export function ollamaModelName(label) {
    const cleaned = label
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || 'model';
}
/**
 * Plan the Ollama import for a catalog entry. GGUF only — safetensors
 * checkpoints need a conversion step Ollama cannot do.
 */
export function planOllamaInstall(model, quantLabel) {
    if (!model.formats.includes('gguf')) {
        throw new Error(`"${model.label}" is not published as GGUF, so Ollama cannot import it directly.`);
    }
    const requested = quantLabel ?? model.quantLabel;
    const tag = normalizeOllamaQuantTag(requested);
    const quantFallback = Boolean(requested) && tag === null;
    const quantTag = tag ?? OLLAMA_DEFAULT_TAG;
    const reference = ollamaReference(model.id, quantTag);
    const modelName = ollamaModelName(model.label);
    return {
        reference,
        modelName,
        pullArgs: ['pull', reference],
        runArgs: ['run', reference],
        steps: [
            `ollama pull ${reference}`,
            `ollama run ${reference}`
        ],
        quantTag,
        quantFallback
    };
}
/**
 * Find the name a runtime already serves for a catalog model, or null. Handles
 * the three shapes a local model takes: an Ollama hf.co reference, the short
 * local name Ollama derives from the label, and a bare GGUF filename stem in a
 * folder runtime. Matching is case-insensitive and ignores the quant tag.
 */
export function matchInstalledModel(model, names) {
    const repo = normalizeRepoId(model.id).toLowerCase();
    const repoName = repo.split('/')[1] ?? repo;
    const localName = ollamaModelName(model.label);
    const labelLower = model.label.toLowerCase();
    for (const raw of names) {
        const base = raw.toLowerCase().split(':')[0];
        if (base.includes(repo))
            return raw;
        if (base === localName || base === labelLower)
            return raw;
        if (base.startsWith(`${labelLower}-`) || base.startsWith(`${labelLower}.`))
            return raw;
        if (base === repoName || base.startsWith(`${repoName}-`))
            return raw;
    }
    return null;
}
/** Build a Modelfile that pins the reference and the GPU offload split. */
export function buildModelfile(reference, options = {}) {
    const lines = [`FROM ${reference}`];
    if (options.systemPrompt)
        lines.push(`SYSTEM """${options.systemPrompt}"""`);
    if (typeof options.numGpu === 'number' && Number.isFinite(options.numGpu)) {
        lines.push(`PARAMETER num_gpu ${Math.max(0, Math.floor(options.numGpu))}`);
    }
    return `${lines.join('\n')}\n`;
}
/** Probe the `ollama` binary; never throws. */
export async function probeOllamaCli(execFileImpl) {
    const stdout = await new Promise((resolve) => {
        try {
            execFileImpl('ollama', ['--version'], { timeout: 5000, windowsHide: true }, (error, out) => resolve(error ? null : out));
        }
        catch {
            resolve(null);
        }
    });
    if (stdout === null)
        return { installed: false, version: null, error: 'ollama command not found' };
    const match = /(\d+\.\d+\.\d+)/.exec(stdout);
    return { installed: true, version: match ? match[1] : stdout.trim() || null, error: null };
}
const defaultSpawn = (file, args) => spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const ANSI_PATTERN = /\u001b\[[0-9;?]*[A-Za-z]/g;
/**
 * Turn what Ollama printed into a message the user can act on. The runtime
 * explains itself in its last line — "the specified tag is not a valid
 * quantization scheme" — and that text is worth more than an exit code.
 */
export function summarizeOllamaFailure(output, code) {
    const lines = output
        .replace(ANSI_PATTERN, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const errorLine = [...lines].reverse().find((line) => /^error\b/i.test(line));
    if (errorLine)
        return errorLine;
    const meaningful = [...lines]
        .reverse()
        .find((line) => !/^(pulling|writing|verifying|removing|success|creating|loading|model)\b/i.test(line) &&
        !/^\d+%$/.test(line) &&
        !/^sha256:/i.test(line));
    if (meaningful)
        return meaningful;
    return `ollama exited with code ${code}`;
}
/** Run an `ollama` subcommand, streaming its output. */
export function runOllamaCommand(args, options = {}) {
    const spawnImpl = options.spawnImpl ?? defaultSpawn;
    return new Promise((resolve) => {
        let output = '';
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };
        let child;
        try {
            child = spawnImpl('ollama', args);
        }
        catch (cause) {
            finish({ ok: false, code: null, output: '', error: cause instanceof Error ? cause.message : String(cause) });
            return;
        }
        const collect = (chunk) => {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            output = (output + text).slice(-262_144);
            options.onOutput?.(text);
        };
        child.stdout?.on('data', collect);
        child.stderr?.on('data', collect);
        child.on('error', (error) => finish({ ok: false, code: null, output, error: error.message }));
        child.on('close', (code) => finish({ ok: code === 0, code, output, error: code === 0 ? null : summarizeOllamaFailure(output, code) }));
    });
}
/**
 * Pull a reference into the local Ollama runtime, streaming progress.
 *
 * Ollama matches a quantization tag against the file names a repository
 * publishes, so a tag can be valid yet unavailable. When Ollama rejects the
 * tag, the pull is retried once with the repository default, which Ollama
 * always resolves.
 */
export async function pullIntoOllama(reference, options = {}) {
    const first = await runOllamaCommand(['pull', reference], options);
    if (first.ok || !isQuantTagRejection(first.output))
        return { ...first, reference };
    const fallback = latestReference(reference);
    if (fallback === reference)
        return { ...first, reference };
    const second = await runOllamaCommand(['pull', fallback], options);
    if (second.ok)
        return { ...second, reference: fallback };
    return { ...second, reference };
}
//# sourceMappingURL=ollama.js.map
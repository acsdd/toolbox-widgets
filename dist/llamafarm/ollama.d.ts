import type { ExecFileLike } from './detect.js';
import type { CatalogModel } from './types.js';
/** Ollama accepts both hosts; the short one is what its own docs use. */
export declare const OLLAMA_HF_HOST = "hf.co";
/** The tag Ollama serves when a repository publishes no matching quantization. */
export declare const OLLAMA_DEFAULT_TAG = "latest";
/**
 * Map a quantization label onto a tag Ollama understands, or null when it
 * cannot use the label at all. A file called `model.q8.gguf` yields the label
 * "Q8", which Ollama rejects — its scheme is `Q8_0` — so the caller falls
 * back to the repository default.
 */
export declare function normalizeOllamaQuantTag(quantLabel?: string | null): string | null;
/** Replace the tag of an Ollama reference with the repository default. */
export declare function latestReference(reference: string): string;
/** True when Ollama refused a reference because of its quantization tag. */
export declare function isQuantTagRejection(text: string): boolean;
export interface OllamaInstallPlan {
    /** What `ollama pull` and `ollama run` accept, e.g. 'hf.co/owner/repo:Q4_K_M'. */
    reference: string;
    /** Short local name for the pulled model, e.g. 'qwen2-5-coder-7b-instruct'. */
    modelName: string;
    /** Arguments for `ollama pull`. */
    pullArgs: string[];
    /** Arguments for `ollama run`. */
    runArgs: string[];
    /** Ordered instructions for the user. */
    steps: string[];
    /** The tag Ollama will use: the requested quantization, or the repository default. */
    quantTag: string;
    /** True when the requested quantization could not be passed to Ollama as a tag. */
    quantFallback: boolean;
}
/** Strip a HuggingFace URL down to 'owner/repo'. */
export declare function normalizeRepoId(repoId: string): string;
/**
 * Build the Ollama reference for a HuggingFace repo. The tag is the
 * quantization Ollama can serve; a label it cannot use falls back to the
 * repository default, which Ollama always resolves.
 */
export declare function ollamaReference(repoId: string, quantLabel?: string | null): string;
/** A safe local Ollama model name derived from the catalog label. */
export declare function ollamaModelName(label: string): string;
/**
 * Plan the Ollama import for a catalog entry. GGUF only — safetensors
 * checkpoints need a conversion step Ollama cannot do.
 */
export declare function planOllamaInstall(model: CatalogModel, quantLabel?: string | null): OllamaInstallPlan;
/**
 * Find the name a runtime already serves for a catalog model, or null. Handles
 * the three shapes a local model takes: an Ollama hf.co reference, the short
 * local name Ollama derives from the label, and a bare GGUF filename stem in a
 * folder runtime. Matching is case-insensitive and ignores the quant tag.
 */
export declare function matchInstalledModel(model: CatalogModel, names: string[]): string | null;
/** Build a Modelfile that pins the reference and the GPU offload split. */
export declare function buildModelfile(reference: string, options?: {
    numGpu?: number;
    systemPrompt?: string;
}): string;
export interface OllamaCliInfo {
    installed: boolean;
    version: string | null;
    error: string | null;
}
/** Probe the `ollama` binary; never throws. */
export declare function probeOllamaCli(execFileImpl: ExecFileLike): Promise<OllamaCliInfo>;
export interface SpawnedProcess {
    stdout: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): void;
    } | null;
    stderr: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): void;
    } | null;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'close', listener: (code: number | null) => void): void;
}
export type SpawnLike = (file: string, args: string[]) => SpawnedProcess;
export interface PullResult {
    ok: boolean;
    code: number | null;
    /** Everything the runtime printed (progress bars live on stderr). */
    output: string;
    error: string | null;
    /** The reference that was attempted, when the caller pulled one. */
    reference?: string;
}
/**
 * Turn what Ollama printed into a message the user can act on. The runtime
 * explains itself in its last line — "the specified tag is not a valid
 * quantization scheme" — and that text is worth more than an exit code.
 */
export declare function summarizeOllamaFailure(output: string, code: number | null): string;
/** Run an `ollama` subcommand, streaming its output. */
export declare function runOllamaCommand(args: string[], options?: {
    spawnImpl?: SpawnLike;
    onOutput?: (chunk: string) => void;
}): Promise<PullResult>;
/**
 * Pull a reference into the local Ollama runtime, streaming progress.
 *
 * Ollama matches a quantization tag against the file names a repository
 * publishes, so a tag can be valid yet unavailable. When Ollama rejects the
 * tag, the pull is retried once with the repository default, which Ollama
 * always resolves.
 */
export declare function pullIntoOllama(reference: string, options?: {
    spawnImpl?: SpawnLike;
    onOutput?: (chunk: string) => void;
}): Promise<PullResult>;

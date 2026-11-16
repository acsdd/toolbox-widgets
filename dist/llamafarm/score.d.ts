/**
 * Fit scoring for the Model Farm feature. A model is green when it fits the
 * scenario budget, yellow when it needs resources freed, red otherwise. Reds
 * keep offload hints (e.g. --n-gpu-layers) when a GPU offers a path to them.
 */
import type { CatalogModel, FitScenario, MachineProfile, ScoredModel } from './types.js';
/** The runtime a verdict is being computed for; offload wording follows it. */
export interface ScoreRuntime {
    id: string;
    api: 'ollama' | 'openai' | 'kobold';
}
export interface ScoreOptions {
    models: CatalogModel[];
    machine: MachineProfile;
    scenario: FitScenario;
    /** Fraction of available RAM a model may claim to count as 'now'. Default 0.93. */
    nowThreshold?: number;
    /** Active runtime, so the offload hint names the right control. */
    runtime?: ScoreRuntime;
}
/**
 * The GPU-offload hint for a red model, worded for the runtime that would run
 * it. The layer estimate is the same; only the control the user must touch
 * changes (llama.cpp flag, Ollama num_gpu, LM Studio slider, …).
 */
export declare function offloadHint(layers: number, runtime?: ScoreRuntime): string;
export declare function scoreModels(options: ScoreOptions): ScoredModel[];
/** Verdict order (green, yellow, red), then lightest model first. */
export declare function sortForDisplay(scored: ScoredModel[]): ScoredModel[];

/**
 * Fit scoring for the Model Farm feature. A model is green when it fits the
 * scenario budget, yellow when it needs resources freed, red otherwise. Reds
 * keep offload hints (e.g. --n-gpu-layers) when a GPU offers a path to them.
 */
import type { CatalogModel, FitScenario, FitVerdict, MachineProfile, ScoredModel } from './types.js'
import { gradeSetup } from './grade.js'

/** The runtime a verdict is being computed for; offload wording follows it. */
export interface ScoreRuntime {
  id: string
  api: 'ollama' | 'openai' | 'kobold'
}

export interface ScoreOptions {
  models: CatalogModel[]
  machine: MachineProfile
  scenario: FitScenario
  /** Fraction of available RAM a model may claim to count as 'now'. Default 0.93. */
  nowThreshold?: number
  /** Active runtime, so the offload hint names the right control. */
  runtime?: ScoreRuntime
}

const DEFAULT_NOW_THRESHOLD = 0.93
const GiB = 2 ** 30
const VERDICT_RANK: Record<FitVerdict, number> = { green: 0, yellow: 1, red: 2 }
/** Rough layer count used to translate spare VRAM into an offload hint. */
const ASSUMED_LAYERS = 32

/**
 * The GPU-offload hint for a red model, worded for the runtime that would run
 * it. The layer estimate is the same; only the control the user must touch
 * changes (llama.cpp flag, Ollama num_gpu, LM Studio slider, …).
 */
export function offloadHint(layers: number, runtime?: ScoreRuntime): string {
  const id = runtime?.id ?? 'llamacpp'
  switch (id) {
    case 'ollama':
      return `Ollama: set num_gpu ${layers} (Modelfile PARAMETER num_gpu) to keep ${layers} layers on the GPU`
    case 'lmstudio':
      return `LM Studio: raise GPU offload to ${layers} layers in the model's settings`
    case 'jan':
      return `Jan: increase GPU layers (ngl) to ${layers} in the model settings`
    case 'gpt4all':
      return `GPT4All: raise the GPU layers setting to ${layers}`
    case 'koboldcpp':
      return `KoboldCpp: set --gpulayers ${layers} to split across GPU + RAM`
    case 'llamafile':
      return `llamafile: pass -ngl ${layers} to offload ${layers} layers to the GPU`
    default:
      return `try --n-gpu-layers ${layers} (llama.cpp) to split across GPU + RAM`
  }
}

export function scoreModels(options: ScoreOptions): ScoredModel[] {
  const threshold = options.nowThreshold ?? DEFAULT_NOW_THRESHOLD
  const { machine, scenario } = options
  const available = machine.availableRamBytes * threshold
  const maxVram = machine.gpus.reduce((max, gpu) => Math.max(max, gpu.vramBytes), 0)

  return options.models.map((model) => {
    const fitsNow = model.runtimeRamBytes <= available
    const fitsTotal = model.runtimeRamBytes <= machine.totalRamBytes
    const verdict: FitVerdict =
      scenario === 'now' ? (fitsNow ? 'green' : fitsTotal ? 'yellow' : 'red') : fitsTotal ? 'green' : 'red'

    const gapGb = Math.ceil(Math.abs(model.runtimeRamBytes - available) / GiB)
    const reason =
      verdict === 'green'
        ? scenario === 'now'
          ? 'runs now'
          : 'fits this machine'
        : fitsTotal
          ? `needs ${gapGb} GB freed to run now`
          : 'exceeds total RAM'

    const hints: string[] = []
    if (verdict === 'yellow') hints.push(`free ~${gapGb} GB (close apps) to run it now`)
    if (verdict === 'red' && maxVram > 0) {
      const perLayerBytes = (model.fileBytes ?? model.runtimeRamBytes) / ASSUMED_LAYERS
      const layers = Math.floor((maxVram * 0.9) / perLayerBytes)
      if (layers >= 1) {
        hints.push(offloadHint(layers, options.runtime))
      }
    }
    if (model.formats.includes('gguf') && machine.ollama.installed) {
      hints.push('GGUF: import into Ollama, then run with ollama run')
    }
    return {
      ...model,
      verdict,
      fitsNow,
      fitsTotal,
      reason,
      hints,
      grade: gradeSetup(machine, model, scenario, { nowThreshold: threshold })
    }
  })
}

/** Verdict order (green, yellow, red), then lightest model first. */
export function sortForDisplay(scored: ScoredModel[]): ScoredModel[] {
  return [...scored].sort(
    (a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || a.runtimeRamBytes - b.runtimeRamBytes
  )
}

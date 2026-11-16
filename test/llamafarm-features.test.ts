import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  diskShortfall,
  listGgufQuants,
  matchInstalledModel,
  scoreModels,
  searchCatalog,
  type CatalogModel,
  type FetchLike,
  type MachineProfile
} from '../dist/index.js'

const GiB = 2 ** 30

function model(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    task: 'text-generation',
    label: 'Llama-3.2-3B-Instruct',
    author: 'bartowski',
    formats: ['gguf'],
    paramsBillions: 3,
    quantLabel: 'Q4_K_M',
    fileBytes: 2 * GiB,
    runtimeRamBytes: Math.round(2 * GiB * 1.25),
    downloads: 5000,
    likes: 20,
    license: 'apache-2.0',
    tags: ['gguf'],
    hfUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
    ...overrides
  }
}

function machine(overrides: Partial<MachineProfile> = {}): MachineProfile {
  return {
    totalRamBytes: 32 * GiB,
    availableRamBytes: 16 * GiB,
    cores: 8,
    gpus: [{ name: 'Test GPU', vramBytes: 8 * GiB }],
    freeDiskBytes: 100 * GiB,
    gpuProbe: 'ok',
    ollama: { installed: true, url: 'http://127.0.0.1:11434', models: [], error: null },
    detectedAt: Date.now(),
    ...overrides
  }
}

/** A HuggingFace API fake that answers list and detail requests. */
function hfFetch(detailSiblings: Array<{ rfilename: string; size?: number; lfs?: { size?: number } }>): FetchLike {
  const listItem = {
    id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    pipeline_tag: 'text-generation',
    tags: ['gguf'],
    downloads: 5000,
    likes: 20
  }
  return async (input) => {
    const url = String(input)
    let body: unknown
    if (url.includes('/api/models?')) {
      body = [listItem]
    } else if (url.includes('/api/models/')) {
      body = {
        id: listItem.id,
        pipeline_tag: 'text-generation',
        tags: ['gguf'],
        downloads: 5000,
        likes: 20,
        siblings: detailSiblings,
        cardData: { license: 'apache-2.0' }
      }
    } else {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as never
    }
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as never
  }
}

describe('diskShortfall', () => {
  it('returns zero when the disk has room', () => {
    assert.equal(diskShortfall(100 * GiB, 2 * GiB), 0)
  })

  it('returns the exact shortfall when the disk is too small', () => {
    assert.equal(diskShortfall(1 * GiB, 3 * GiB), 2 * GiB)
  })

  it('returns null when free space is unknown so the guard stays silent', () => {
    assert.equal(diskShortfall(null, 3 * GiB), null)
  })

  it('returns null when the needed size is unknown', () => {
    assert.equal(diskShortfall(100 * GiB, null), null)
  })
})

describe('matchInstalledModel', () => {
  it('matches an Ollama hf.co reference for the repo', () => {
    const names = ['hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M', 'llama3:latest']
    assert.equal(
      matchInstalledModel(model(), names),
      'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M'
    )
  })

  it('matches a plain local name derived from the label', () => {
    const names = ['llama-3.2-3b-instruct', 'other']
    assert.equal(matchInstalledModel(model(), names), 'llama-3.2-3b-instruct')
  })

  it('matches a GGUF filename stem for folder runtimes', () => {
    const names = ['Llama-3.2-3B-Instruct-Q4_K_M', 'unrelated']
    assert.equal(matchInstalledModel(model(), names), 'Llama-3.2-3B-Instruct-Q4_K_M')
  })

  it('returns null when nothing matches', () => {
    assert.equal(matchInstalledModel(model(), ['mistral:latest']), null)
  })

  it('is case-insensitive on the repo id', () => {
    const names = ['HF.CO/BARTOWSKI/LLAMA-3.2-3B-INSTRUCT-GGUF:Q4_K_M']
    assert.ok(matchInstalledModel(model(), names))
  })
})

describe('searchCatalog', () => {
  it('searches HuggingFace live and returns GGUF models with real sizes', async () => {
    const fetchImpl = hfFetch([
      { rfilename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', lfs: { size: 2 * GiB } }
    ])
    const results = await searchCatalog('llama 3.2', { fetchImpl })
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'bartowski/Llama-3.2-3B-Instruct-GGUF')
    assert.equal(results[0].fileBytes, 2 * GiB)
    assert.ok(results[0].formats.includes('gguf'))
  })

  it('passes the query to the HuggingFace search endpoint', async () => {
    let seen = ''
    const fetchImpl: FetchLike = async (input) => {
      seen = String(input)
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as never
    }
    await searchCatalog('qwen coder', { fetchImpl })
    assert.ok(seen.includes('search=qwen%20coder') || seen.includes('search=qwen+coder'))
  })

  it('returns an empty list when nothing matches', async () => {
    const fetchImpl: FetchLike = async () =>
      ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as never
    const results = await searchCatalog('nothing-here', { fetchImpl })
    assert.deepEqual(results, [])
  })

  it('throws when the search request fails', async () => {
    const fetchImpl: FetchLike = async () =>
      ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }) as never
    await assert.rejects(() => searchCatalog('llama', { fetchImpl }), /503/)
  })
})

describe('listGgufQuants', () => {
  it('lists every GGUF quant with its real size', async () => {
    const fetchImpl = hfFetch([
      { rfilename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', lfs: { size: 2 * GiB } },
      { rfilename: 'Llama-3.2-3B-Instruct-Q8_0.gguf', lfs: { size: 4 * GiB } },
      { rfilename: 'README.md', size: 1024 }
    ])
    const quants = await listGgufQuants('bartowski/Llama-3.2-3B-Instruct-GGUF', { fetchImpl })
    assert.equal(quants.length, 2)
    const q4 = quants.find((q) => q.quant === 'Q4_K_M')
    const q8 = quants.find((q) => q.quant === 'Q8_0')
    assert.ok(q4 && q8)
    assert.equal(q4.sizeBytes, 2 * GiB)
    assert.equal(q8.sizeBytes, 4 * GiB)
    assert.ok(q4.filename.endsWith('.gguf'))
  })

  it('returns an empty list when the repo has no GGUF files', async () => {
    const fetchImpl = hfFetch([{ rfilename: 'model.safetensors', lfs: { size: 6 * GiB } }])
    const quants = await listGgufQuants('test/safe', { fetchImpl })
    assert.deepEqual(quants, [])
  })
})

describe('runtime-aware fit hints', () => {
  it('words the offload hint for llama.cpp by default', () => {
    const scored = scoreModels({
      models: [model({ runtimeRamBytes: 40 * GiB, fileBytes: 32 * GiB })],
      machine: machine({ totalRamBytes: 16 * GiB, availableRamBytes: 8 * GiB }),
      scenario: 'now'
    })
    assert.equal(scored[0].verdict, 'red')
    assert.ok(scored[0].hints.some((h) => h.includes('--n-gpu-layers')))
  })

  it('words the offload hint for Ollama using num_gpu', () => {
    const scored = scoreModels({
      models: [model({ runtimeRamBytes: 40 * GiB, fileBytes: 32 * GiB })],
      machine: machine({ totalRamBytes: 16 * GiB, availableRamBytes: 8 * GiB }),
      scenario: 'now',
      runtime: { id: 'ollama', api: 'ollama' }
    })
    assert.ok(scored[0].hints.some((h) => h.includes('num_gpu') || h.includes('Ollama')))
    assert.ok(!scored[0].hints.some((h) => h.includes('--n-gpu-layers')))
  })

  it('words the offload hint for LM Studio using its GPU offload setting', () => {
    const scored = scoreModels({
      models: [model({ runtimeRamBytes: 40 * GiB, fileBytes: 32 * GiB })],
      machine: machine({ totalRamBytes: 16 * GiB, availableRamBytes: 8 * GiB }),
      scenario: 'now',
      runtime: { id: 'lmstudio', api: 'openai' }
    })
    assert.ok(scored[0].hints.some((h) => h.includes('LM Studio') || h.includes('GPU offload')))
  })
})
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildModelfile,
  catalogCachePath,
  fetchModelById,
  isCatalogFresh,
  normalizeRepoId,
  ollamaModelName,
  ollamaReference,
  planOllamaInstall,
  probeOllamaCli,
  pullIntoOllama,
  readCatalogCache,
  resolveModelTask,
  writeCatalogCache,
  type CatalogModel,
  type ExecFileLike,
  type FetchLike,
  type SpawnLike
} from '../dist/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const GiB = 2 ** 30

/** A fake `ollama` process that replays the given replies in order. */
function fakeOllamaSpawn(
  replies: Array<{ output: string; code: number }>,
  seen: string[] = []
): SpawnLike {
  let index = 0
  return (_file, args) => {
    seen.push(args.join(' '))
    const reply = replies[Math.min(index++, replies.length - 1)]
    const stdout: Array<(chunk: Buffer | string) => void> = []
    const stderr: Array<(chunk: Buffer | string) => void> = []
    const close: Array<(code: number | null) => void> = []
    setTimeout(() => {
      stdout.forEach((listener) => listener(reply.output))
      close.forEach((listener) => listener(reply.code))
    }, 0)
    return {
      stdout: { on: (_event, listener) => stdout.push(listener) },
      stderr: { on: (_event, listener) => stderr.push(listener) },
      on: (event, listener) => {
        if (event === 'close') close.push(listener as (code: number | null) => void)
      }
    }
  }
}

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
    runtimeRamBytes: Math.round(2.5 * GiB),
    downloads: 1000,
    likes: 10,
    license: 'apache-2.0',
    tags: ['gguf'],
    hfUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
    ...overrides
  }
}

describe('ollama references', () => {
  it('builds an hf.co reference with the quant tag', () => {
    assert.equal(ollamaReference('bartowski/Llama-3.2-3B-Instruct-GGUF', 'Q4_K_M'), 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M')
  })

  it('keeps a quantization Ollama understands', () => {
    assert.equal(ollamaReference('bartowski/Llama-3.2-3B-Instruct-GGUF', 'Q4_K_M'), 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M')
    assert.equal(ollamaReference('owner/repo', 'Q8_0'), 'hf.co/owner/repo:Q8_0')
    assert.equal(ollamaReference('owner/repo', 'q4_k_s'), 'hf.co/owner/repo:Q4_K_S')
    assert.equal(ollamaReference('owner/repo', 'FP16'), 'hf.co/owner/repo:F16')
    assert.equal(ollamaReference('owner/repo', 'FP32'), 'hf.co/owner/repo:F32')
    assert.equal(ollamaReference('owner/repo', 'BF16'), 'hf.co/owner/repo:BF16')
  })

  it('falls back to the repository default when Ollama cannot use the label', () => {
    // "Q8" is what a filename like model.q8.gguf yields, but Ollama only
    // knows Q8_0 and matches tags against the published file names.
    assert.equal(ollamaReference('owner/repo', 'Q8'), 'hf.co/owner/repo:latest')
    assert.equal(ollamaReference('owner/repo', 'Q4'), 'hf.co/owner/repo:latest')
    assert.equal(ollamaReference('owner/repo', 'not a tag!'), 'hf.co/owner/repo:latest')
    assert.equal(ollamaReference('owner/repo', null), 'hf.co/owner/repo:latest')
  })

  it('normalizes hub URLs down to owner/repo', () => {
    assert.equal(normalizeRepoId('https://huggingface.co/owner/repo'), 'owner/repo')
    assert.equal(normalizeRepoId('  owner/repo/  '), 'owner/repo')
    assert.equal(ollamaReference('https://hf.co/owner/repo'), 'hf.co/owner/repo:latest')
  })

  it('derives a safe local model name', () => {
    assert.equal(ollamaModelName('Qwen2.5-Coder-7B-Instruct'), 'qwen2.5-coder-7b-instruct')
    assert.equal(ollamaModelName('///'), 'model')
  })
})

describe('ollama install plan', () => {
  it('plans a pull and a run', () => {
    const plan = planOllamaInstall(model())
    assert.equal(plan.reference, 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M')
    assert.deepEqual(plan.pullArgs, ['pull', plan.reference])
    assert.deepEqual(plan.runArgs, ['run', plan.reference])
    assert.equal(plan.steps.length, 2)
  })

  it('refuses models that are not published as GGUF', () => {
    assert.throws(() => planOllamaInstall(model({ formats: ['safetensors'] })), /not published as GGUF/)
  })

  it('honours an explicit quant override', () => {
    const plan = planOllamaInstall(model(), 'Q8_0')
    assert.equal(plan.reference, 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q8_0')
  })

  it('reports the tag Ollama will actually use', () => {
    const plan = planOllamaInstall(model())
    assert.equal(plan.quantTag, 'Q4_K_M')
    assert.equal(plan.quantFallback, false)
  })

  it('flags a quant Ollama cannot tag and installs the repository default', () => {
    const plan = planOllamaInstall(model({ quantLabel: 'Q8' }))
    assert.equal(plan.quantTag, 'latest')
    assert.equal(plan.quantFallback, true)
    assert.equal(plan.reference, 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:latest')
    assert.ok(plan.steps.every((step) => step.includes(':latest')))
  })
})

describe('modelfile', () => {
  it('pins the reference and the gpu offload split', () => {
    const text = buildModelfile('hf.co/owner/repo:Q4_K_M', { numGpu: 12 })
    assert.match(text, /FROM hf\.co\/owner\/repo:Q4_K_M/)
    assert.match(text, /PARAMETER num_gpu 12/)
  })

  it('omits the parameter when no split is given', () => {
    assert.equal(buildModelfile('hf.co/owner/repo'), 'FROM hf.co/owner/repo\n')
  })
})

describe('ollama cli probe', () => {
  it('reads the version when the binary exists', async () => {
    const execFile: ExecFileLike = (_file, _args, _opts, cb) => cb(null, 'ollama version is 0.12.3\n')
    const info = await probeOllamaCli(execFile)
    assert.equal(info.installed, true)
    assert.equal(info.version, '0.12.3')
    assert.equal(info.error, null)
  })

  it('reports a missing binary without throwing', async () => {
    const execFile: ExecFileLike = (_file, _args, _opts, cb) => cb(new Error('ENOENT'), '')
    const info = await probeOllamaCli(execFile)
    assert.equal(info.installed, false)
    assert.match(info.error ?? '', /not found/)
  })
})

describe('pullIntoOllama', () => {
  it('resolves ok when the runtime exits with code 0', async () => {
    const spawnImpl: SpawnLike = () => {
      const stdout: Array<(chunk: Buffer | string) => void> = []
      const stderr: Array<(chunk: Buffer | string) => void> = []
      const close: Array<(code: number | null) => void> = []
      setTimeout(() => {
        stdout.forEach((listener) => listener('pulling manifest\n'))
        stderr.forEach((listener) => listener('success\n'))
        close.forEach((listener) => listener(0))
      }, 0)
      return {
        stdout: { on: (_event, listener) => stdout.push(listener) },
        stderr: { on: (_event, listener) => stderr.push(listener) },
        on: (event, listener) => {
          if (event === 'close') close.push(listener as (code: number | null) => void)
        }
      }
    }
    const chunks: string[] = []
    const result = await pullIntoOllama('hf.co/owner/repo', { spawnImpl, onOutput: (chunk) => chunks.push(chunk) })
    assert.equal(result.ok, true)
    assert.equal(result.code, 0)
    assert.match(result.output, /pulling manifest/)
    assert.equal(chunks.length, 2)
  })

  it('reports a failing exit code', async () => {
    const spawnImpl: SpawnLike = () => {
      const close: Array<(code: number | null) => void> = []
      setTimeout(() => close.forEach((listener) => listener(1)), 0)
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event, listener) => {
          if (event === 'close') close.push(listener as (code: number | null) => void)
        }
      }
    }
    const result = await pullIntoOllama('hf.co/owner/repo', { spawnImpl })
    assert.equal(result.ok, false)
    assert.match(result.error ?? '', /exited with code 1/)
  })

  it('reports what Ollama said instead of only the exit code', async () => {
    const spawnImpl = fakeOllamaSpawn([
      {
        output:
          'pulling manifest\nError: pull model manifest: 400: {"error":"The specified tag is not a valid quantization scheme. Please use another tag or \\"latest\\""}\n',
        code: 1
      }
    ])
    const result = await pullIntoOllama('hf.co/owner/repo:Q8', { spawnImpl })
    assert.equal(result.ok, false)
    assert.match(result.error ?? '', /not a valid quantization scheme/)
    assert.doesNotMatch(result.error ?? '', /^ollama exited with code/)
  })

  it('retries with the repository default when Ollama rejects the tag', async () => {
    const seen: string[] = []
    const spawnImpl = fakeOllamaSpawn(
      [
        {
          output:
            'pulling manifest\nError: pull model manifest: 400: {"error":"The specified tag is not available in the repository. Please use another tag or \\"latest\\""}\n',
          code: 1
        },
        { output: 'pulling manifest\nsuccess\n', code: 0 }
      ],
      seen
    )
    const result = await pullIntoOllama('hf.co/owner/repo:Q8_0', { spawnImpl })
    assert.equal(result.ok, true)
    assert.equal(result.reference, 'hf.co/owner/repo:latest')
    assert.deepEqual(seen, ['pull hf.co/owner/repo:Q8_0', 'pull hf.co/owner/repo:latest'])
  })

  it('keeps the original reference when the retry also fails', async () => {
    const seen: string[] = []
    const spawnImpl = fakeOllamaSpawn(
      [
        {
          output: 'Error: pull model manifest: 400: {"error":"The specified tag is not available in the repository."}\n',
          code: 1
        },
        {
          output: 'Error: pull model manifest: 404: {"error":"model not found"}\n',
          code: 1
        }
      ],
      seen
    )
    const result = await pullIntoOllama('hf.co/owner/repo:Q8_0', { spawnImpl })
    assert.equal(result.ok, false)
    assert.equal(result.reference, 'hf.co/owner/repo:Q8_0')
    assert.match(result.error ?? '', /model not found/)
    assert.deepEqual(seen, ['pull hf.co/owner/repo:Q8_0', 'pull hf.co/owner/repo:latest'])
  })
})

describe('single model fetch', () => {
  it('maps a repo detail payload into a catalog entry', async () => {
    const fetchImpl: FetchLike = (async () =>
      new Response(
        JSON.stringify({
          id: 'owner/repo',
          pipeline_tag: 'text-generation',
          downloads: 42,
          likes: 3,
          tags: ['gguf'],
          cardData: { license: 'mit' },
          siblings: [{ rfilename: 'model-Q4_K_M.gguf', lfs: { size: 2 * GiB } }]
        }),
        { status: 200 }
      )) as FetchLike
    const entry = await fetchModelById('owner/repo', { fetchImpl })
    assert.equal(entry?.id, 'owner/repo')
    assert.equal(entry?.task, 'text-generation')
    assert.equal(entry?.license, 'mit')
    assert.equal(entry?.fileBytes, 2 * GiB)
  })

  it('throws on a missing repo', async () => {
    const fetchImpl: FetchLike = (async () => new Response('nope', { status: 404 })) as FetchLike
    await assert.rejects(() => fetchModelById('owner/missing', { fetchImpl }), /HTTP 404/)
  })
})

describe('task resolution', () => {
  it('maps known pipeline tags and defaults to text generation', () => {
    assert.equal(resolveModelTask('text-to-image'), 'text-to-image')
    assert.equal(resolveModelTask('something-else'), 'text-generation')
    assert.equal(resolveModelTask(undefined), 'text-generation')
  })
})

describe('catalog cache', () => {
  it('round-trips through disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llamafarm-cache-'))
    try {
      const path = join(dir, 'nested', 'catalog-cache.json')
      writeCatalogCache(path, [model()], 1_000)
      const cache = readCatalogCache(path)
      assert.equal(cache?.fetchedAt, 1_000)
      assert.equal(cache?.models.length, 1)
      assert.equal(cache?.models[0]?.id, model().id)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('treats unreadable files as a miss', () => {
    assert.equal(readCatalogCache(join(tmpdir(), 'llamafarm-cache-does-not-exist.json')), null)
  })

  it('knows when a cache is stale', () => {
    assert.equal(isCatalogFresh({ fetchedAt: 1_000, models: [] }, 5_000, 2_000), true)
    assert.equal(isCatalogFresh({ fetchedAt: 1_000, models: [] }, 500, 2_000), false)
    assert.equal(isCatalogFresh(null, 5_000, 2_000), false)
  })

  it('keeps the cache under the app home', () => {
    assert.match(catalogCachePath('/tmp/home'), /home.*catalog-cache\.json$/)
  })
})

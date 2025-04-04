import { beforeAll, describe, expect, test } from 'vitest'
import { env, id, init_whisper, MODELS, type Tokenizer, transcribe_file, type Whisper as WhisperModelType, type WhisperModel } from '../../jsgrad/node.ts'

describe('Whisper Model', () => {
  let whisperInstance: { model: WhisperModelType; enc: Tokenizer } | undefined = undefined
  const testModel: WhisperModel = 'tiny.en'
  const testAudioUrl = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav'
  let testAudioPath: string

  beforeAll(async () => {
    console.log(`Initializing Whisper model: ${testModel}...`)
    try {
      const whisper = await init_whisper(testModel)
      whisperInstance = {
        model: whisper[0],
        enc: whisper[1],
      }
      console.log(`Model ${testModel} initialized.`)
      testAudioPath = await env.fetchSave(
        testAudioUrl,
        `jfk_${id(testAudioUrl)}.wav`,
        env.CACHE_DIR,
      )
      console.log(`Test audio saved to: ${testAudioPath}`)
    } catch (e) {
      console.error(
        'Failed to initialize Whisper model or download audio for tests:',
        e,
      )
    }
  }, 100_000)

  test(
    'init_whisper loads model and tokenizer',
    {
      timeout: 120_000,
    },
    () => {
      expect(whisperInstance).toBeDefined()
      if (!whisperInstance) return

      const { model, enc } = whisperInstance
      expect(model).toBeDefined()
      expect(model.constructor.name).toBe('Whisper')
      expect(model.is_multilingual).toBe(
        MODELS[testModel].dims.n_vocab === 51865,
      )
      expect(model.batch_size).toBe(1)

      expect(enc).toBeDefined()
      expect(enc.constructor.name).toBe('Tokenizer')
      expect(enc.stop_tokens).toBeDefined()
      expect(enc.stop_tokens.length).toBeGreaterThan(0)
    },
  )

  test.skip('transcribe_file processes JFK sample', async () => {
    if (!whisperInstance) {
      throw new Error(
        'Whisper model instance not available for transcription test.',
      )
    }
    if (!testAudioPath) {
      throw new Error('Test audio file path not available.')
    }

    console.log(`Transcribing file: ${testAudioPath}...`)
    const { model, enc } = whisperInstance

    const transcriptionResult = await transcribe_file(
      model,
      enc,
      testAudioPath,
    )

    expect(typeof transcriptionResult).toBe('string')
    expect(transcriptionResult.toLowerCase()).toContain(
      'ask not what your country can do for you',
    )
    expect(transcriptionResult.toLowerCase()).toContain(
      'ask what you can do for your country',
    )
  })
})

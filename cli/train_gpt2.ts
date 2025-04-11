/** [](cell:markdown) */
/**
First import and get the inputs
*/

/** [](cell:code) */
import { GPT } from '@jsgrad/models/gpt2'
import { AdamW, bytes_to_string, Device, env, get_parameters, GlobalCounters, num, range, Tensor, TinyJit } from '@jsgrad/jsgrad/node'
import { parseArgs, z } from './parse'
import { get_encoding } from 'tiktoken'

const args = parseArgs({
  steps: z.number().default(10).describe('number of steps to run'),
  bs: z.number().default(4).describe('batch size'),
  sequence_length: z.number().default(64).describe('sequence length'),
  skip_test: z.boolean().optional().describe('skip test'),
  seed: z.number().optional().describe('Seed'),
})

if (args.seed) Tensor.manual_seed(args.seed)

const [B, T] = [args.bs, args.sequence_length]
if (1 > T || T > 1024) throw new Error()

/** [](cell:markdown) */
/**
Initialize and load the model and tokenizer
*/

/** [](cell:code) */
const model = new GPT({
  block_size: 1024,
  vocab_size: 50257,
  padded_vocab_size: 50304,
  n_layer: 12,
  n_head: 12,
  n_embd: 768,
})
await model.load_pretrained()

// init the tokenizer
const enc = get_encoding('gpt2')

const encode = (s: string) => enc.encode(s, ['<|endoftext|>'])
const decode = (l: Uint32Array) => enc.decode(l)

/** [](cell:markdown) */
/**
Load the data
*/

/** [](cell:code) */
const tokens_bin = await env.fetchSave('https://huggingface.co/datasets/karpathy/llmc-starter-pack/resolve/main/tiny_shakespeare_val.bin', 'weights/tiny_shakespeare_val.bin')
let data = await env.readFile(tokens_bin)
data = data.slice(0x400)
const tokens = new Tensor([...new Uint16Array(data.buffer)])

// lightweight dataloader
function* get_batch() {
  if (B * T + 1 > num(tokens.length)) throw new Error('not enough tokens')
  // for 338,025 tokens. E.g. with B=8 T=1024, this will yield 41 batches before looping
  let i = 0
  while (true) {
    let x = tokens.get({ from: i, to: i + B * T }).view(B, T)
    let y = tokens.get({ from: i + 1, to: i + B * T + 1 }).view(B, T)
    yield [x, y]
    i += B * T
    if (i + B * T + 1 >= num(tokens.length)) {
      i = 0 // in prod we'd want to randomize the start point a bit
    }
  }
}

// forward backward for a few iterations
const data_iter = get_batch()
const [x, y] = data_iter.next().value as [Tensor, Tensor] // we'll overfit this batch below

/** [](cell:markdown) */
/**
Init the optimizer and the step function
*/

/** [](cell:code) */
const optimizer = new AdamW(get_parameters(model), 1e-4, undefined, undefined, undefined, 0)

const step = new TinyJit((x, y) => {
  const [_, loss] = model.call(x, y)
  optimizer.zero_grad()
  loss!.backward()
  return loss!.realize(optimizer.schedule_step())
})

/** [](cell:markdown) */
/**
Training
*/

/** [](cell:code) */
await Tensor.train(async () => {
  for (const i of range(args.steps)) {
    GlobalCounters.reset()
    const t0 = performance.now()
    const loss = await step.call(x.contiguous(), y.contiguous())
    Device.default().synchronize()
    const t1 = performance.now()
    console.log(`iteration ${i}, loss: ${(await loss.item()).toFixed(6)}, time: ${(t1 - t0).toFixed(3)}ms, ${((B * T) / ((t1 - t0) / 1000)).toFixed(0)} tok/s`)
  }
})

/** [](cell:markdown) */
/**
Testing
*/

/** [](cell:code) */
if (!args.skip_test) {
  const start = '<|endoftext|>'
  const start_ids = encode(start)
  const x = new Tensor([...start_ids]).get(undefined, '...')
  const max_new_tokens = 16
  const temperature = 1.0
  const top_k = 40
  const y = model.generate(x, max_new_tokens, temperature, top_k)
  const res = bytes_to_string(decode(new Uint32Array(await y.get(0).tolist())))
  console.log(res)
}

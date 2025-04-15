/** [](type:markdown) */
/**
# Training GPT-2

This will traing a GPT-2 like model, similarly to [Karpathy's llm.c train_gpt2.py](https://github.com/karpathy/llm.c/blob/master/train_gpt2.c).

It will use [tinyshakespeare](https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt) as the training data.

*/
/** [](type:code) */
import { GPT } from '@jsgrad/models/gpt2'
import { AdamW, Device, env, get_parameters, GlobalCounters, num, range, Tensor, TinyJit } from '@jsgrad/jsgrad'
import { parseArgs, z } from '@jsgrad/jsgrad/args'

const args = parseArgs({
  steps: z.number().default(10).describe('number of steps to run'),
  bs: z.number().default(4).describe('batch size'),
  sequence_length: z.number().default(64).describe('sequence length'),
  skip_test: z.boolean().optional().describe('skip test'),
  seed: z.number().optional().describe('Seed'),
})

/** [](type:markdown) */
/**
## Initialize the model
*/
/** [](type:code) */
if (args.seed) Tensor.manual_seed(args.seed)

const [B, T] = [args.bs, args.sequence_length]
if (1 > T || T > 1024) throw new Error()

const model = new GPT({
  block_size: 1024,
  vocab_size: 50257,
  padded_vocab_size: 50304,
  n_layer: 12,
  n_head: 12,
  n_embd: 768,
})
await model.load_pretrained()

/** [](type:markdown) */
/**
## Loading training data
*/
/** [](type:code) */
const tokens_bin = await env.fetchSave('https://huggingface.co/datasets/karpathy/llmc-starter-pack/resolve/main/tiny_shakespeare_val.bin', 'tiny_shakespeare_val.bin')
let data = await env.readFile(tokens_bin)
data = data.slice(0x400)
const tokens = new Tensor([...new Uint16Array(data.buffer)])

// lightweight dataloader
function* get_batch() {
  if (B * T + 1 > num(tokens.length)) throw new Error('not enough tokens')
  // for 338,025 tokens. E.g. with B=8 T=1024, this will yield 41 batches before looping
  let i = 0
  while (true) {
    yield [
      tokens.get({ from: i, to: i + B * T }).view(B, T), 
      tokens.get({ from: i + 1, to: i + B * T + 1 }).view(B, T)
    ]
    i += B * T
    if (i + B * T + 1 >= num(tokens.length)) {
      i = 0 // in prod we'd want to randomize the start point a bit
    }
  }
}

// forward backward for a few iterations
const data_iter = get_batch()
const [x, y] = data_iter.next().value as [Tensor, Tensor] // we'll overfit this batch below

/** [](type:markdown) */
/**
## Optimizer and jit
*/
/** [](type:code) */
const optimizer = new AdamW(get_parameters(model), 1e-4, undefined, undefined, undefined, 0)

const step = new TinyJit((x, y) => {
  const [_, loss] = model.call(x, y)
  optimizer.zero_grad()
  loss!.backward()
  return loss!.realize(optimizer.schedule_step())
})

/** [](type:markdown) */
/**
## Training

Training the model for 10 steps, 

*/
/** [](type:code) */
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

/** [](type:markdown) */
/**
## Testing 

Running the model for 16 tokens

*/
/** [](type:code) */
import { getEncoding } from 'js-tiktoken'

const enc = getEncoding('gpt2')

if (!args.skip_test) {
  const start = '<|endoftext|>'
  const start_ids = enc.encode(start, ['<|endoftext|>'])
  const x = new Tensor([...start_ids]).get(undefined, '...')
  const max_new_tokens = 16
  const temperature = 1.0
  const top_k = 40
  const y = model.generate(x, max_new_tokens, temperature, top_k)
  const res = enc.decode(await y.get(0).tolist())
  console.log(res)
}

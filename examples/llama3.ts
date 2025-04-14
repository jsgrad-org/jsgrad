/** [](type:markdown) */
/**
# Llama 3

Llama 3 1B running in browser with jsgrad.

*/
/** [](type:code) */
import { env, Tensor } from '@jsgrad/jsgrad'
import { Llama3 } from '@jsgrad/models/llama3'
import { parseArgs, z } from '@jsgrad/jsgrad/args'

const args = parseArgs({
  size: z.enum(['1B', '8B', '70B']).default('1B').describe('Model size'),
  quantize: z.enum(['int8', 'nf4', 'float16']).default('float16').describe('Quantization method'),
  seed: z.number().optional().describe('Random seed'),
  temperature: z.number().default(0.85).describe('Temperature'),
  prompt: z.string().optional().describe('Prompt'),
  system: z.string().default('You are an helpful assistant.').describe('System prompt'),
})

/** [](type:markdown) */
/**
## Loading
*/
/** [](type:code) */
if (args.seed !== undefined) Tensor.manual_seed(args.seed)

const model = await Llama3.load({
  size: args.size,
  temperature: args.temperature,
  quantize: args.quantize,
  system: args.system,
})

/** [](type:markdown) */
/**
## Running
*/
/** [](type:code) */
if (args.prompt) {
  const res = await model.chat({
    messages: [{ role: 'user', content: args.prompt }],
  })
  console.log(
    `${res.message.content} (${res.usage.tokens_per_second.toFixed(1)} tokens/s)`,
  )
} else {
  while (true) {
    const content = (await env.prompt('Q: '))!
    let out = ""
    await model.chat({
      messages: [{ role: 'user', content }],
      onToken: (res) => {
        out += res.token
        env.writeStdout(out) // TODO: fix web stdout so it appends the text correctly
      },
    })
    env.writeStdout('\n')
  }
}


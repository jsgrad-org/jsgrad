import { env, Tensor } from '@jsgrad/jsgrad/node'
import { Llama3 } from '@jsgrad/models/llama3'
import { parseArgs, z } from './parse'

const args = parseArgs({
  // model: z.string().optional().describe('Model path'),
  size: z.enum(['1B', '8B', '70B']).default('1B').describe('Model size'),
  // shard: z.number().int().default(1).describe('Shard the model across multiple devices'),
  quantize: z.enum(['int8', 'nf4', 'float16']).default('float16').describe('Quantization method'),
  seed: z.number().optional().describe('Random seed'),
  temperature: z.number().default(0.85).describe('Temperature'),
  prompt: z.string().optional().describe('Prompt'),
  system: z.string().default('You are an helpful assistant.').describe('System prompt'),
})

// download_model is the default without a model passed in
if (args.seed !== undefined) Tensor.manual_seed(args.seed)
console.log(`seed = ${Tensor._seed}`)
const model = await Llama3.load({
  size: args.size,
  temperature: args.temperature,
  quantize: args.quantize,
  system: args.system,
})

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
    await model.chat({
      messages: [{ role: 'user', content }],
      onToken: (res) => {
        env.writeStdout(res.token)
      },
    })
    env.writeStdout('\n')
  }
}

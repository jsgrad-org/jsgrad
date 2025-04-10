import { env, load_state_dict, Tensor, TinyJit, Tqdm,Device, dtypes, get_state_dict, GlobalCounters, idiv, range, safe_load, vars } from '@jsgrad/jsgrad'
import { parseArgs, z } from './parse'
import { StableDiffusion } from '@jsgrad/models/stable_diffusion'
import { ClipTokenizer } from '@jsgrad/models/clip'
import sharp from 'sharp'

const args = parseArgs({
  steps: z.number().default(6).describe('Number of steps in diffusion'),
  prompt: z.string().default('a horse sized cat eating a bagel'),
  out: z.string().default(await env.tempFile('png')).describe('Output path'),
  noshow: z.boolean().optional().describe("Don't show the image"),
  fp16: z.boolean().optional().describe('Cast the weight to float16'),
  timing: z.boolean().optional().describe('Print timing per step'),
  seed: z.number().optional().describe('Set the random latent seed'),
  guidance: z.number().default(7.5).describe('Prompt strength'),
})

Tensor.no_grad = true
const model = new StableDiffusion()

// load in weights
const file = await env.fetchSave('https://huggingface.co/CompVis/stable-diffusion-v-1-4-original/resolve/refs%2Fpr%2F228/sd-v1-4.safetensors?download=true', 'weights/sd-v1-4.safetensors')
await load_state_dict(model, await safe_load(file), false)

if (args.fp16) {
  for (const [k, v] of Object.entries(get_state_dict(model))) {
    if (k.startsWith('model')) v.replace(await v.cast(dtypes.float16).realize())
  }
}

// run through CLIP to get context
const tokenizer = await ClipTokenizer.init()
let prompt = new Tensor([tokenizer.encode(args.prompt)])
const context = await model.cond_stage_model.transformer.text_model.call(prompt).realize()
console.log('got CLIP context', context.shape)

prompt = new Tensor([tokenizer.encode('')])
const unconditional_context = await model.cond_stage_model.transformer.text_model.call(prompt).realize()
console.log('got unconditional CLIP context', unconditional_context.shape)

// @ts-ignore done with clip model
delete model.cond_stage_model

const timesteps = range(1, 1000, idiv(1000, args.steps))
console.log(`running for ${timesteps} timesteps`)
const alphas = model.alphas_cumprod.get(new Tensor(timesteps))
const alphas_prev = new Tensor([1.0]).cat([alphas.get({ to: -1 })])

// start with random noise
if (args.seed !== undefined) Tensor.manual_seed(args.seed)
let latent = Tensor.randn([1, 4, 64, 64])

const jit = new TinyJit(model.call)

// this is diffusion
await vars.withAsync({ BEAM: vars.get('LATEBEAM', '')! }, async () => {
  const t = new Tqdm([...timesteps.entries()].toReversed())
  for (const [index, timestep] of t) {
    GlobalCounters.reset()
    t.set_description(`${index} ${timestep}`)
    const tid = new Tensor([index])
    latent = await jit.call(unconditional_context, context, latent, new Tensor([timestep]), alphas.get(tid), alphas_prev.get(tid), new Tensor([args.guidance]))
    if (args.timing) Device.default().synchronize()
  }
})

// upsample latent space to image with autoencoder
let x = await model.decode(latent)
console.log(x.shape)

await sharp((await x.data()).bytes, { raw: { width: 512, height: 512, channels: 3 } }).toFormat('png').toFile(args.out)

console.log(`Saved image to ${args.out}`)

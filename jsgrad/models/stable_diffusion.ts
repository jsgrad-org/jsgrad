// https://arxiv.org/pdf/2112.10752.pdf
// https://github.com/ekagra-ranjan/huggingface-blog/blob/main/stable_diffusion.md

import { Conv2d, GroupNorm, mul, Tensor } from '../base.ts'

class AttnBlock {
  norm: GroupNorm
  q: Conv2d
  k: Conv2d
  v: Conv2d
  proj_out: Conv2d
  constructor(in_channels: number) {
    this.norm = new GroupNorm(32, in_channels)
    this.q = new Conv2d(in_channels, in_channels, 1)
    this.k = new Conv2d(in_channels, in_channels, 1)
    this.v = new Conv2d(in_channels, in_channels, 1)
    this.proj_out = new Conv2d(in_channels, in_channels, 1)
  }
  // copied from AttnBlock in ldm repo
  call = (x: Tensor) => {
    let h_ = this.norm.call(x)
    let q = this.q.call(h_), k = this.k.call(h_), v = this.v.call(h_)

    // compute attention
    let [b, c, h, w] = q.shape
    ;[q, k, v] = [q, k, v].map((x) => x.reshape([b, c, mul(h, w)]).transpose(1, 2))
    h_ = q.scaled_dot_product_attention(k, v).transpose(1, 2).reshape([b, c, h, w])
    return x.add(this.proj_out.call(h_))
  }
}
class ResnetBlock {
  norm1: GroupNorm
  conv1: Conv2d
  norm2: GroupNorm
  conv2: Conv2d
  nin_shortcut?: Conv2d
  constructor(in_channels: number, out_channels: number) {
    this.norm1 = new GroupNorm(32, in_channels)
    this.conv1 = new Conv2d(in_channels, out_channels, 3, undefined, 1)
    this.norm2 = new GroupNorm(32, out_channels)
    this.conv2 = new Conv2d(out_channels, out_channels, 3, undefined, 1)
    if (in_channels !== out_channels) this.nin_shortcut = new Conv2d(in_channels, out_channels, 1)
  }
  call = (x: Tensor) => {
    let h = this.conv1.call(this.norm1.call(x).swish())
    h = this.conv2.call(this.norm2.call(h).swish())
    return (this.nin_shortcut ? this.nin_shortcut.call(x) : x).add(h)
  }
}
class Mid {
  block_1: ResnetBlock
  attn_1: AttnBlock
  block_2: ResnetBlock
  constructor(block_in: number) {
    this.block_1 = new ResnetBlock(block_in, block_in)
    this.attn_1 = new AttnBlock(block_in)
    this.block_2 = new ResnetBlock(block_in, block_in)
  }
  call = (x: Tensor) => {
    return x.sequential([this.block_1, this.attn_1, this.block_2])
  }
}
class Decoder {
  conv_in: Conv2d
  mid: Mid
  up: { block: ResnetBlock[]; upsample?: { conv: Conv2d } }[]
  norm_out: GroupNorm
  conv_out: Conv2d
  constructor() {
    const sz = [[128, 256], [256, 512], [512, 512], [512, 512]]
    this.conv_in = new Conv2d(4, 512, 3, undefined, 1)
    this.mid = new Mid(512)

    this.up = []
    for (const [i, s] of sz.entries()) {
      this.up.push({ 'block': [new ResnetBlock(s[1], s[0]), new ResnetBlock(s[0], s[0]), new ResnetBlock(s[0], s[0])] })
      if (i !== 0) this.up[this.up.length - 1].upsample = { 'conv': new Conv2d(s[0], s[0], 3, undefined, 1) }
    }

    this.norm_out = new GroupNorm(32, 128)
    this.conv_out = new Conv2d(128, 3, 3, undefined, 1)
  }
  call = async (x: Tensor) => {
    x = this.conv_in.call(x)
    x = this.mid.call(x)

    for (const l of this.up.toReversed()) {
      console.log('decode', x.shape)
      for (const b of l.block) x = b.call(x)
      if (l.upsample) {
        // https://pytorch.org/docs/stable/generated/torch.nn.functional.interpolate.html ?
        let [bs, c, py, px] = x.shape
        x = x.reshape([bs, c, py, 1, px, 1]).expand([bs, c, py, 2, px, 2]).reshape([bs, c, mul(py, 2), mul(px, 2)])
        x = l.upsample.conv.call(x)
      }
      await x.realize()
    }

    return this.conv_out.call(this.norm_out.call(x).swish())
  }
}
class Encoder {
  conv_in: Conv2d
  down: { block: ResnetBlock[]; downsample?: { conv: Conv2d } }[]
  mid: Mid
  norm_out: GroupNorm
  conv_out: Conv2d
  constructor() {
    const sz = [[128, 128], [128, 256], [256, 512], [512, 512]]
    this.conv_in = new Conv2d(3, 128, 3, undefined, 1)

    this.down = []
    for (const [i, s] of sz.entries()) {
      this.down.push({ 'block': [new ResnetBlock(s[0], s[1]), new ResnetBlock(s[1], s[1])] })
      if (i !== 3) this.down[this.down.length - 1].downsample = { 'conv': new Conv2d(s[1], s[1], 3, 2, [0, 1, 0, 1]) }
    }

    this.mid = new Mid(512)
    this.norm_out = new GroupNorm(32, 512)
    this.conv_out = new Conv2d(512, 8, 3, undefined, 1)
  }
  call = (x: Tensor) => {
    x = this.conv_in.call(x)

    for (const l of this.down) {
      console.log('encode', x.shape)
      for (const b of l.block) x = b.call(x)
      if (l.downsample) x = l.downsample.conv.call(x)
    }
    x = this.mid.call(x)
    return this.conv_out.call(this.norm_out.call(x).swish())
  }
}
class AutoencoderKL {
  encoder: Encoder
  decoder: Decoder
  quant_conv: Conv2d
  post_quant_conv: Conv2d
  constructor() {
    this.encoder = new Encoder()
    this.decoder = new Decoder()
    this.quant_conv = new Conv2d(8, 8, 1)
    this.post_quant_conv = new Conv2d(4, 4, 1)
  }

  call = async (x: Tensor) => {
    let latent = this.encoder.call(x)
    latent = this.quant_conv.call(latent)
    latent = latent.get({}, { start: 0, stop: 4 }) // only the means
    console.log('latent', latent.shape)
    latent = this.post_quant_conv.call(latent)
    return await this.decoder.call(latent)
  }
}
const get_alphas_cumprod = (beta_start = 0.00085, beta_end = 0.0120, n_training_steps = 1000) => {
  const betas = Tensor.linspace(beta_start ** 0.5, beta_end ** 0.5, n_training_steps).pow(2)
  const alphas = betas.sub(1.0, true)
  return alphas.log().cumsum(0).exp()
}
const unet_params = {
  'adm_in_ch': undefined,
  'in_ch': 4,
  'out_ch': 4,
  'model_ch': 320,
  'attention_resolutions': [4, 2, 1],
  'num_res_blocks': 2,
  'channel_mult': [1, 2, 4, 4],
  'n_heads': 8,
  'transformer_depth': [1, 1, 1, 1],
  'ctx_dim': 768,
  'use_linear': false,
}

class StableDiffusion {
  constructor() {
    // this.alphas_cumprod = get_alphas_cumprod()
    // this.model = namedtuple("DiffusionModel", ["diffusion_model"])(diffusion_model = UNetModel(**unet_params))
    //     this.first_stage_model = AutoencoderKL()
    //     this.cond_stage_model = namedtuple("CondStageModel", ["transformer"])(transformer = namedtuple("Transformer", ["text_model"])(text_model = Closed.ClipTextTransformer()))
  }
  //   def get_x_prev_and_pred_x0(self, x, e_t, a_t, a_prev):
  //     temperature = 1
  //     sigma_t = 0
  //     sqrt_one_minus_at = (1-a_t).sqrt()
  //     #print(a_t, a_prev, sigma_t, sqrt_one_minus_at)

  //     pred_x0 = (x - sqrt_one_minus_at * e_t) / a_t.sqrt()

  //     # direction pointing to x_t
  //     dir_xt = (1. - a_prev - sigma_t**2).sqrt() * e_t

  //     x_prev = a_prev.sqrt() * pred_x0 + dir_xt
  //     return x_prev, pred_x0

  //   def get_model_output(self, unconditional_context, context, latent, timestep, unconditional_guidance_scale):
  //     # put into diffuser
  //     latents = this.model.diffusion_model(latent.expand(2, *latent.shape[1:]), timestep, unconditional_context.cat(context, dim=0))
  //     unconditional_latent, latent = latents[0:1], latents[1:2]

  //     e_t = unconditional_latent + unconditional_guidance_scale * (latent - unconditional_latent)
  //     return e_t

  //   def decode(self, x):
  //     x = this.first_stage_model.post_quant_conv(1/0.18215 * x)
  //     x = this.first_stage_model.decoder(x)

  //     # make image correct size and scale
  //     x = (x + 1.0) / 2.0
  //     x = x.reshape(3,512,512).permute(1,2,0).clip(0,1)*255
  //     return x.cast(dtypes.uint8)

  //   def __call__(self, unconditional_context, context, latent, timestep, alphas, alphas_prev, guidance):
  //     e_t = this.get_model_output(unconditional_context, context, latent, timestep, guidance)
  //     x_prev, _ = this.get_x_prev_and_pred_x0(latent, e_t, alphas, alphas_prev)
  //     #e_t_next = get_model_output(x_prev)
  //     #e_t_prime = (e_t + e_t_next) / 2
  //     #x_prev, pred_x0 = get_x_prev_and_pred_x0(latent, e_t_prime, index)
  //     return x_prev.realize()
}
// # ** ldm.models.autoencoder.AutoencoderKL (done!)
// # 3x512x512 <--> 4x64x64 (16384)
// # decode torch.Size([1, 4, 64, 64]) torch.Size([1, 3, 512, 512])
// # section 4.3 of paper
// # first_stage_model.encoder, first_stage_model.decoder

// # ** ldm.modules.diffusionmodules.openaimodel.UNetModel
// # this is what runs each time to sample. is this the LDM?
// # input:  4x64x64
// # output: 4x64x64
// # model.diffusion_model
// # it has attention?

// # ** ldm.modules.encoders.modules.FrozenCLIPEmbedder
// # cond_stage_model.transformer.text_model

// if __name__ == "__main__":
//   default_prompt = "a horse sized cat eating a bagel"
//   parser = argparse.ArgumentParser(description='Run Stable Diffusion', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
//   parser.add_argument('--steps', type=int, default=6, help="Number of steps in diffusion")
//   parser.add_argument('--prompt', type=str, default=default_prompt, help="Phrase to render")
//   parser.add_argument('--out', type=str, default=Path(tempfile.gettempdir()) / "rendered.png", help="Output filename")
//   parser.add_argument('--noshow', action='store_true', help="Don't show the image")
//   parser.add_argument('--fp16', action='store_true', help="Cast the weights to float16")
//   parser.add_argument('--timing', action='store_true', help="Print timing per step")
//   parser.add_argument('--seed', type=int, help="Set the random latent seed")
//   parser.add_argument('--guidance', type=float, default=7.5, help="Prompt strength")
//   args = parser.parse_args()

//   Tensor.no_grad = True
//   model = StableDiffusion()

//   # load in weights
//   load_state_dict(model, torch_load(fetch('https://huggingface.co/CompVis/stable-diffusion-v-1-4-original/resolve/main/sd-v1-4.ckpt', 'sd-v1-4.ckpt'))['state_dict'], strict=False)

//   if args.fp16:
//     for k,v in get_state_dict(model).items():
//       if k.startswith("model"):
//         v.replace(v.cast(dtypes.float16).realize())

//   # run through CLIP to get context
//   tokenizer = Tokenizer.ClipTokenizer()
//   prompt = Tensor([tokenizer.encode(args.prompt)])
//   context = model.cond_stage_model.transformer.text_model(prompt).realize()
//   print("got CLIP context", context.shape)

//   prompt = Tensor([tokenizer.encode("")])
//   unconditional_context = model.cond_stage_model.transformer.text_model(prompt).realize()
//   print("got unconditional CLIP context", unconditional_context.shape)

//   # done with clip model
//   del model.cond_stage_model

//   timesteps = list(range(1, 1000, 1000//args.steps))
//   print(f"running for {timesteps} timesteps")
//   alphas = model.alphas_cumprod[Tensor(timesteps)]
//   alphas_prev = Tensor([1.0]).cat(alphas[:-1])

//   # start with random noise
//   if args.seed is not None: Tensor.manual_seed(args.seed)
//   latent = Tensor.randn(1,4,64,64)

//   @TinyJit
//   def run(model, *x): return model(*x).realize()

//   # this is diffusion
//   with Context(BEAM=getenv("LATEBEAM")):
//     for index, timestep in (t:=tqdm(list(enumerate(timesteps))[::-1])):
//       GlobalCounters.reset()
//       t.set_description("%3d %3d" % (index, timestep))
//       with Timing("step in ", enabled=args.timing, on_exit=lambda _: f", using {GlobalCounters.mem_used/1e9:.2f} GB"):
//         tid = Tensor([index])
//         latent = run(model, unconditional_context, context, latent, Tensor([timestep]), alphas[tid], alphas_prev[tid], Tensor([args.guidance]))
//         if args.timing: Device[Device.DEFAULT].synchronize()
//     del run

//   # upsample latent space to image with autoencoder
//   x = model.decode(latent)
//   print(x.shape)

//   # save image
//   im = Image.fromarray(x.numpy())
//   print(f"saving {args.out}")
//   im.save(args.out)
//   # Open image.
//   if not args.noshow: im.show()

//   # validation!
//   if args.prompt == default_prompt and args.steps == 6 and args.seed == 0 and args.guidance == 7.5:
//     ref_image = Tensor(Image.open(Path(__file__).parent / "stable_diffusion_seed0.png"))
//     distance = (((x.cast(dtypes.float) - ref_image.cast(dtypes.float)) / ref_image.max())**2).mean().item()
//     assert distance < 3e-3, colored(f"validation failed with {distance=}", "red")  # higher distance with WINO
//     print(colored(f"output validated with {distance=}", "green"))

// https://arxiv.org/pdf/2112.10752.pdf
// https://github.com/ekagra-ranjan/huggingface-blog/blob/main/stable_diffusion.md

import { Conv2d, dtypes, GroupNorm, mul, Tensor } from '../jsgrad/base.ts'
import { ClipTextTransformer } from './clip.ts'
import { UNetModel } from './unet.ts'

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
    ;[q, k, v] = [q, k, v].map((x) => x.reshape(b, c, mul(h, w)).transpose(1, 2))
    h_ = q.scaled_dot_product_attention(k, v).transpose(1, 2).reshape(b, c, h, w)
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
        x = x.reshape(bs, c, py, 1, px, 1).expand(bs, c, py, 2, px, 2).reshape(bs, c, mul(py, 2), mul(px, 2))
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
    latent = latent.get({}, { from: 0, to: 4 }) // only the means
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

export class StableDiffusion {
  alphas_cumprod: Tensor
  model: { diffusion_model: UNetModel }
  first_stage_model: AutoencoderKL
  cond_stage_model: { transformer: { text_model: ClipTextTransformer } }
  constructor() {
    this.alphas_cumprod = get_alphas_cumprod()
    this.model = { diffusion_model: new UNetModel(undefined, 4, 4, 320, [4, 2, 1], 2, [1, 2, 4, 4], [1, 1, 1, 1], 768, false, undefined, 8) }
    this.first_stage_model = new AutoencoderKL()
    this.cond_stage_model = {
      transformer: { text_model: new ClipTextTransformer() },
    }
  }
  get_x_prev_and_pred_x0 = (x: Tensor, e_t: Tensor, a_t: Tensor, a_prev: Tensor) => {
    const sigma_t = 0
    const sqrt_one_minus_at = a_t.sub(1, true).sqrt()

    const pred_x0 = x.sub(sqrt_one_minus_at.mul(e_t)).div(a_t.sqrt())

    // direction pointing to x_t
    const dir_xt = a_prev.sub(1, true).sub(sigma_t ** 2).sqrt().mul(e_t)

    const x_prev = a_prev.sqrt().mul(pred_x0).add(dir_xt)
    return [x_prev, pred_x0]
  }

  get_model_output = (unconditional_context: Tensor, context: Tensor, latent: Tensor, timestep: Tensor, unconditional_guidance_scale: Tensor) => {
    // put into diffuser
    const latents = this.model.diffusion_model.call(latent.expand(2, ...latent.shape.slice(1)), timestep, unconditional_context.cat([context], 0))
    const unconditional_latent = latents.get({ from: 0, to: 1 })
    latent = latents.get({ from: 1, to: 2 })

    const e_t = unconditional_latent.add(unconditional_guidance_scale.mul(latent.sub(unconditional_latent)))
    return e_t
  }
  decode = async (x: Tensor) => {
    x = this.first_stage_model.post_quant_conv.call(x.mul(1 / 0.18215, true))
    x = await this.first_stage_model.decoder.call(x)

    // make image correct size and scale
    x = x.add(1.0).div(2.0)
    x = x.reshape(3, 512, 512).permute(1, 2, 0).clip(0, 1).mul(255)
    return x.cast(dtypes.uint8)
  }
  call = async (unconditional_context: Tensor, context: Tensor, latent: Tensor, timestep: Tensor, alphas: Tensor, alphas_prev: Tensor, guidance: Tensor) => {
    const e_t = this.get_model_output(unconditional_context, context, latent, timestep, guidance)
    const [x_prev] = this.get_x_prev_and_pred_x0(latent, e_t, alphas, alphas_prev)
    return await x_prev.realize()
  }
}

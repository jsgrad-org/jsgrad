import { Conv2d, dtypes, GroupNorm, idiv, is_dtype_supported, type Layer, LayerNorm, Linear, mul, range, Tensor } from '../base.ts'

// https://github.com/Stability-AI/generative-models/blob/fbdc58cab9f4ee2be7a5e1f2e2787ecd9311942f/sgm/modules/diffusionmodules/util.py#L207
const timestep_embedding = (timesteps: Tensor, dim: number, max_period = 10000) => {
  const half = idiv(dim, 2)
  const freqs = Tensor.arange(half, undefined, undefined, { device: timesteps.device }).mul(-Math.log(max_period), true).div(half).exp()
  const args = timesteps.unsqueeze(1).mul(freqs.unsqueeze(0))
  const out = Tensor.cat([args.cos(), args.sin()], -1)
  return is_dtype_supported(dtypes.float16) ? out.cast(dtypes.float16) : out
}

class ResBlock {
  in_layers: Layer[]
  emb_layers: Layer[]
  out_layers: Layer[]
  skip_connection?: Conv2d
  constructor(channels: number, emb_channels: number, out_channels: number) {
    this.in_layers = [new GroupNorm(32, channels), Tensor.silu, new Conv2d(channels, out_channels, 3, undefined, 1)]
    this.emb_layers = [Tensor.silu, new Linear(emb_channels, out_channels)]
    this.out_layers = [
      new GroupNorm(32, out_channels),
      Tensor.silu,
      (x: Tensor) => x, // needed for weights loading code to work
      new Conv2d(out_channels, out_channels, 3, undefined, 1),
    ]
    if (channels !== out_channels) this.skip_connection = new Conv2d(channels, out_channels, 1)
  }
  call = (x: Tensor, emb: Tensor): Tensor => {
    let h = x.sequential(this.in_layers)
    let emb_out = emb.sequential(this.emb_layers)
    h = h.add(emb_out.reshape(...emb_out.shape, 1, 1))
    h = h.sequential(this.out_layers)
    return (this.skip_connection ? this.skip_connection.call(x) : x).add(h)
  }
}
class CrossAttention {
  to_q: Linear
  to_k: Linear
  to_v: Linear
  to_out: [Linear]
  constructor(query_dim: number, ctx_dim: number, public n_heads: number, public d_head: number) {
    this.to_q = new Linear(query_dim, n_heads * d_head, false)
    this.to_k = new Linear(ctx_dim, n_heads * d_head, false)
    this.to_v = new Linear(ctx_dim, n_heads * d_head, false)
    this.to_out = [new Linear(n_heads * d_head, query_dim)]
  }

  call = (x: Tensor, ctx?: Tensor): Tensor => {
    ctx = ctx === undefined ? x : ctx
    let q = this.to_q.call(x), k = this.to_k.call(ctx), v = this.to_v.call(ctx)
    ;[q, k, v] = [q, k, v].map((y) => y.reshape(x.shape[0], -1, this.n_heads, this.d_head).transpose(1, 2))
    let attention = q.scaled_dot_product_attention(k, v).transpose(1, 2)
    const h_ = attention.reshape(x.shape[0], -1, this.n_heads * this.d_head)
    return h_.sequential(this.to_out)
  }
}
class GEGLU {
  proj: Linear
  constructor(dim_in: number, public dim_out: number) {
    this.proj = new Linear(dim_in, dim_out * 2)
  }

  call = (x: Tensor) => {
    let [x2, gate] = this.proj.call(x).chunk(2, -1)
    return x2.mul(gate.gelu())
  }
}
class FeedForward {
  net: Layer[]
  constructor(dim: number, mult: number = 4) {
    this.net = [
      new GEGLU(dim, dim * mult),
      (x: Tensor) => x, // needed for weights loading code to work
      new Linear(dim * mult, dim),
    ]
  }
  call = (x: Tensor) => x.sequential(this.net)
}

class BasicTransformerBlock {
  attn1: CrossAttention
  ff: FeedForward
  attn2: CrossAttention
  norm1: LayerNorm
  norm2: LayerNorm
  norm3: LayerNorm
  constructor(dim: number, ctx_dim: number, n_heads: number, d_head: number) {
    this.attn1 = new CrossAttention(dim, dim, n_heads, d_head)
    this.ff = new FeedForward(dim)
    this.attn2 = new CrossAttention(dim, ctx_dim, n_heads, d_head)
    this.norm1 = new LayerNorm(dim)
    this.norm2 = new LayerNorm(dim)
    this.norm3 = new LayerNorm(dim)
  }
  call = (x: Tensor, ctx?: Tensor) => {
    x = x.add(this.attn1.call(this.norm1.call(x)))
    x = x.add(this.attn2.call(this.norm2.call(x), ctx))
    x = x.add(this.ff.call(this.norm3.call(x)))
    return x
  }
}
// https://github.com/Stability-AI/generative-models/blob/fbdc58cab9f4ee2be7a5e1f2e2787ecd9311942f/sgm/modules/attention.py#L619
class SpatialTransformer {
  norm: GroupNorm
  proj_in: Linear | Conv2d
  transformer_blocks: BasicTransformerBlock[]
  proj_out: Linear | Conv2d
  constructor(channels: number, n_heads: number, d_head: number, ctx_dim: number | number[], public use_linear: boolean, depth: number = 1) {
    if (typeof ctx_dim === 'number') ctx_dim = range(depth).map(() => ctx_dim as number)
    else if (!Array.isArray(ctx_dim) || depth !== ctx_dim.length) throw new Error()
    this.norm = new GroupNorm(32, channels)
    if (channels !== n_heads * d_head) throw new Error()
    this.proj_in = use_linear ? new Linear(channels, channels) : new Conv2d(channels, channels, 1)
    this.transformer_blocks = range(depth).map((d) => new BasicTransformerBlock(channels, ctx_dim[d], n_heads, d_head))
    this.proj_out = use_linear ? new Linear(channels, channels) : new Conv2d(channels, channels, 1)
  }

  call = (x: Tensor, ctx?: Tensor) => {
    let [b, c, h, w] = x.shape
    let x_in = x
    x = this.norm.call(x)
    let ops = [(z: Tensor) => z.reshape(b, c, mul(h, w)).permute(0, 2, 1), (z: Tensor) => this.proj_in.call(z)]
    x = x.sequential(this.use_linear ? ops : ops.toReversed())
    for (const block of this.transformer_blocks) x = block.call(x, ctx)
    ops = [(z: Tensor) => this.proj_out.call(z), (z: Tensor) => z.permute(0, 2, 1).reshape(b, c, h, w)]
    x = x.sequential(this.use_linear ? ops : ops.toReversed())
    return x.add(x_in)
  }
}
class Downsample {
  op: Conv2d
  constructor(channels: number) {
    this.op = new Conv2d(channels, channels, 3, 2, 1)
  }
  call = (x: Tensor) => this.op.call(x)
}
class Upsample {
  conv: Conv2d
  constructor(channels: number) {
    this.conv = new Conv2d(channels, channels, 3, undefined, 1)
  }
  call = (x: Tensor) => {
    let [bs, c, py, px] = x.shape
    let z = x.reshape(bs, c, py, 1, px, 1).expand(bs, c, py, 2, px, 2).reshape(bs, c, mul(py, 2), mul(px, 2))
    return this.conv.call(z)
  }
}

type BB = ResBlock | SpatialTransformer | Conv2d | Downsample | Upsample
// https://github.com/Stability-AI/generative-models/blob/fbdc58cab9f4ee2be7a5e1f2e2787ecd9311942f/sgm/modules/diffusionmodules/openaimodel.py#L472
export class UNetModel {
  num_res_blocks: number[]
  time_embed: Layer[]
  label_emb?: Layer[][]
  input_blocks: BB[][]
  middle_block: BB[]
  output_blocks: BB[][]
  out: Layer[]
  constructor(
    adm_in_ch: number | undefined,
    in_ch: number,
    out_ch: number,
    public model_ch: number,
    public attention_resolutions: number[],
    num_res_blocks: number,
    channel_mult: number[],
    transformer_depth: number[],
    ctx_dim: number | number[],
    use_linear = false,
    public d_head?: number,
    public n_heads?: number,
  ) {
    this.num_res_blocks = range(channel_mult.length).map(() => num_res_blocks)

    const get_d_and_n_heads = (dims: number): [number, number] => {
      if (this.d_head === undefined) {
        if (this.n_heads === undefined) throw new Error('d_head and n_heads cannot both be None')
        return [idiv(dims, this.n_heads), this.n_heads]
      } else {
        if (this.n_heads !== undefined) throw new Error('d_head and n_heads cannot both be non-None')
        return [this.d_head, idiv(dims, this.d_head)]
      }
    }

    const time_embed_dim = model_ch * 4
    this.time_embed = [new Linear(model_ch, time_embed_dim), Tensor.silu, new Linear(time_embed_dim, time_embed_dim)]

    if (adm_in_ch !== undefined) {
      this.label_emb = [
        [
          new Linear(adm_in_ch, time_embed_dim),
          Tensor.silu,
          new Linear(time_embed_dim, time_embed_dim),
        ],
      ]
    }
    this.input_blocks = [[new Conv2d(in_ch, model_ch, 3, undefined, 1)]]
    const input_block_channels = [model_ch]
    let ch = model_ch
    let ds = 1
    for (const [idx, mult] of channel_mult.entries()) {
      for (const _ of range(this.num_res_blocks[idx])) {
        const layers: BB[] = [new ResBlock(ch, time_embed_dim, model_ch * mult)]
        ch = mult * model_ch
        if (attention_resolutions.includes(ds)) {
          ;[d_head, n_heads] = get_d_and_n_heads(ch)
          layers.push(new SpatialTransformer(ch, n_heads, d_head, ctx_dim, use_linear, transformer_depth[idx]))
        }

        this.input_blocks.push(layers)
        input_block_channels.push(ch)
      }
      if (idx !== channel_mult.length - 1) {
        this.input_blocks.push([new Downsample(ch)])
        input_block_channels.push(ch)
        ds *= 2
      }
    }
    ;[d_head, n_heads] = get_d_and_n_heads(ch)
    this.middle_block = [
      new ResBlock(ch, time_embed_dim, ch),
      new SpatialTransformer(ch, n_heads, d_head, ctx_dim, use_linear, transformer_depth.at(-1)),
      new ResBlock(ch, time_embed_dim, ch),
    ]

    this.output_blocks = []
    for (const [idx, mult] of [...channel_mult.entries()].toReversed()) {
      for (const i of range(this.num_res_blocks[idx] + 1)) {
        const ich = input_block_channels.pop()!
        const layers: BB[] = [new ResBlock(ch + ich, time_embed_dim, model_ch * mult)]
        ch = model_ch * mult

        if (attention_resolutions.includes(ds)) {
          ;[d_head, n_heads] = get_d_and_n_heads(ch)
          layers.push(new SpatialTransformer(ch, n_heads, d_head, ctx_dim, use_linear, transformer_depth[idx]))
        }

        if (idx > 0 && i === this.num_res_blocks[idx]) {
          layers.push(new Upsample(ch))
          ds = idiv(ds, 2)
        }
        this.output_blocks.push(layers)
      }
    }
    this.out = [
      new GroupNorm(32, ch),
      Tensor.silu,
      new Conv2d(model_ch, out_ch, 3, undefined, 1),
    ]
  }
  call = (x: Tensor, tms: Tensor, ctx: Tensor, y?: Tensor) => {
    let t_emb = timestep_embedding(tms, this.model_ch)
    let emb = t_emb.sequential(this.time_embed)

    if (y !== undefined) {
      if (y.shape[0] !== x.shape[0]) throw new Error()
      emb = emb.add(y.sequential(this.label_emb![0]))
    }

    if (is_dtype_supported(dtypes.float16)) {
      emb = emb.cast(dtypes.float16)
      ctx = ctx.cast(dtypes.float16)
      x = x.cast(dtypes.float16)
    }
    const run = (x: Tensor, bb: BB) => {
      if (bb instanceof ResBlock) x = bb.call(x, emb)
      else if (bb instanceof SpatialTransformer) x = bb.call(x, ctx)
      else x = bb.call(x)
      return x
    }

    const saved_inputs = []
    for (const b of this.input_blocks) {
      for (const bb of b) x = run(x, bb)
      saved_inputs.push(x)
    }
    for (const bb of this.middle_block) x = run(x, bb)
    for (const b of this.output_blocks) {
      x = x.cat([saved_inputs.pop()!], 1)
      for (const bb of b) x = run(x, bb)
    }
    return x.sequential(this.out)
  }
}

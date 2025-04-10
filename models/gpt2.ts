import { Embedding, env, idiv, LayerNorm, Linear, load_state_dict, num, range, safe_load, Tensor } from '@jsgrad/jsgrad'

type GPTConfig = {
  block_size: number
  vocab_size: number
  padded_vocab_size: number
  n_layer: number
  n_head: number
  n_embd: number
}

class CausalSelfAttention {
  c_attn: Linear
  c_proj: Linear
  n_head: number
  n_embd: number
  bias: Tensor
  constructor(config: GPTConfig) {
    if (config.n_embd % config.n_head !== 0) throw new Error()
    // key, query, value projections for all heads, but in a batch
    this.c_attn = new Linear(config.n_embd, 3 * config.n_embd)
    // output projection
    this.c_proj = new Linear(config.n_embd, config.n_embd)
    // regularization
    this.n_head = config.n_head
    this.n_embd = config.n_embd
    // not really a 'bias', more of a mask, but following the OpenAI/HF naming though
    this.bias = Tensor.ones([1, 1, config.block_size, config.block_size]).tril()
    this.bias.requires_grad = false
  }
  call = (x: Tensor) => {
    const [B, T, C] = x.shape
    const qkv = this.c_attn.call(x)
    let [q, k, v] = qkv.split(this.n_embd, 2)
    k = k.view(B, T, this.n_head, idiv(C, this.n_head)).transpose(1, 2) // (B, nh, T, hs)
    q = q.view(B, T, this.n_head, idiv(C, this.n_head)).transpose(1, 2) // (B, nh, T, hs)
    v = v.view(B, T, this.n_head, idiv(C, this.n_head)).transpose(1, 2) // (B, nh, T, hs)

    // manual implementation of attention
    let att = q.matmul(k.transpose(-2, -1)).mul(1.0 / Math.sqrt(num(k.size(-1))))
    att = att.masked_fill(this.bias.get({}, {}, { to: num(T) }, { to: num(T) }).eq(0), -Infinity)
    att = att.softmax()
    let y = att.matmul(v) // (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)
    y = y.transpose(1, 2).view(B, T, C) // re-assemble all head outputs side by side
    // output projection
    y = this.c_proj.call(y)
    return y
  }
}
class MLP {
  c_fc: Linear
  c_proj: Linear
  constructor(config: GPTConfig) {
    this.c_fc = new Linear(config.n_embd, 4 * config.n_embd)
    this.c_proj = new Linear(4 * config.n_embd, config.n_embd)
  }

  call = (x: Tensor) => this.c_proj.call(this.c_fc.call(x).gelu())
}

class Block {
  ln_1: LayerNorm
  attn: CausalSelfAttention
  ln_2: LayerNorm
  mlp: MLP
  constructor(config: GPTConfig) {
    this.ln_1 = new LayerNorm(config.n_embd)
    this.attn = new CausalSelfAttention(config)
    this.ln_2 = new LayerNorm(config.n_embd)
    this.mlp = new MLP(config)
  }
  call = (x: Tensor) => {
    x = x.add(this.attn.call(this.ln_1.call(x)))
    x = x.add(this.mlp.call(this.ln_2.call(x)))
    return x
  }
}
export class GPT {
  wte: Embedding
  wpe: Embedding
  h: Block[]
  ln_f: LayerNorm
  lm_head: Linear
  constructor(public config: GPTConfig) {
    this.wte = new Embedding(config.padded_vocab_size, config.n_embd)
    this.wpe = new Embedding(config.block_size, config.n_embd)
    this.h = range(config.n_layer).map(() => new Block(config))
    this.ln_f = new LayerNorm(config.n_embd)
    this.lm_head = new Linear(config.n_embd, config.padded_vocab_size, false)
    this.wte.weight = this.lm_head.weight // https://paperswithcode.com/method/weight-tying
  }
  load_pretrained = async () => {
    const file = await env.fetchSave(`https://huggingface.co/gpt2/resolve/main/model.safetensors`, 'weights/gpt2.safetensors')
    const weights = await safe_load(file)
    const transposed = ['attn.c_attn.weight', 'attn.c_proj.weight', 'mlp.c_fc.weight', 'mlp.c_proj.weight']
    for (const k of Object.keys(weights)) {
      if (k === 'wte.weight') {
        weights[k] = weights[k].pad([[0, this.config.padded_vocab_size - this.config.vocab_size], [0, 0]]).to(undefined).contiguous()
      }
      if (transposed.some((x) => k.endsWith(x))) {
        weights[k] = weights[k].to(undefined).T.contiguous()
      }
    }
    // lm head and wte are tied
    weights['lm_head.weight'] = weights['wte.weight']
    await load_state_dict(this, weights)
  }

  generate = (idx: Tensor, max_new_tokens: number, temperature = 1.0, top_k?: number) => {
    for (const _ in range(max_new_tokens)) {
      const idx_cond = num(idx.shape[1]) <= this.config.block_size ? idx : idx.get({}, { from: -this.config.block_size })
      let [logits] = this.call(idx_cond)
      logits = logits.get({}, -1, {}).div(temperature)
      let idx_next = logits.softmax().multinomial()
      idx = Tensor.cat([idx, idx_next], 1)
    }
    return idx
  }
  call = (idx: Tensor, targets?: Tensor): [Tensor, Tensor?] => {
    const [b, t] = idx.shape
    const pos = Tensor.arange(0, num(t))

    const tok_emb = this.wte.call(idx) // token embeddings of shape (b, t, n_embd)
    const pos_emb = this.wpe.call(pos) // position embeddings of shape (t, n_embd)
    let x = tok_emb.add(pos_emb)

    x = this.ln_f.call(x.sequential(this.h))

    const logits = targets !== undefined ? this.lm_head.call(x).get({}, {}, { to: this.config.vocab_size }) : this.lm_head.call(x.get({}, [-1], {})).get({}, {}, { to: this.config.vocab_size })
    const loss = targets !== undefined ? logits.sparse_categorical_crossentropy(targets) : undefined
    return [logits, loss]
  }
}

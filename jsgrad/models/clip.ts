import { ArrayMap, bytes_to_string, Embedding, env, idiv, LayerNorm, Linear, num, range, string_to_bytes, Tensor, zip } from '../base.ts'

// Clip tokenizer, taken from https://github.com/openai/CLIP/blob/main/clip/simple_tokenizer.py (MIT license)
const default_bpe = () => env.fetchSave('https://github.com/openai/CLIP/raw/main/clip/bpe_simple_vocab_16e6.txt.gz', 'weights/bpe_simple_vocab_16e6.txt.gz')

/**
 * Namespace for CLIP Text Tokenizer components.
 */
export class Tokenizer {
  /**
   * Return set of symbol pairs in a word.
   * Word is represented as tuple of symbols (symbols being variable-length strings).
   */
  static get_pairs = (word: string[]) => new Set(zip(word, word.slice(1)))
  static whitespace_clean = (text: string) => text.replace(/\s+/g, ' ').trim()
  /**
   * Returns list of utf-8 byte and a corresponding list of unicode strings.
   * The reversible bpe codes work on unicode strings.
   * This means you need a large # of unicode characters in your vocab if you want to avoid UNKs.
   * When you're at something like a 10B token dataset you end up needing around 5K for decent coverage.
   * This is a significant percentage of your normal, say, 32K bpe vocab.
   * To avoid that, we want lookup tables between utf-8 bytes and unicode strings.
   * And avoids mapping to whitespace/control characters the bpe code barfs on.
   */
  static bytes_to_unicode = (): Record<number, string> => {
    const bs = [...range('!'.charCodeAt(0), '~'.charCodeAt(0) + 1), ...range('¡'.charCodeAt(0), '¬'.charCodeAt(0) + 1), ...range('®'.charCodeAt(0), 'ÿ'.charCodeAt(0) + 1)]

    let cs = [...bs]
    let n = 0

    for (let b = 0; b < 2 ** 8; b++) {
      if (!bs.includes(b)) {
        bs.push(b)
        cs.push(2 ** 8 + n)
        n += 1
      }
    }

    return Object.fromEntries(zip(bs, cs.map((n) => String.fromCharCode(n))))
  }
}
export class ClipTokenizer {
  byte_encoder!: Record<number, string>
  encoder!: Record<string, number>
  bpe_ranks!: ArrayMap<[string, string], number>
  cache!: Record<string, string>
  pat!: RegExp
  static init = async () => {
    const res = new ClipTokenizer()
    res.byte_encoder = Tokenizer.bytes_to_unicode()
    const bytes = await env.readFile(await default_bpe())
    let lines = bytes_to_string(new Uint8Array(await env.gunzip(bytes.buffer as ArrayBuffer))).split('\n')
    lines = lines.slice(1, 49152 - 256 - 2 + 1)
    const merges = lines.map((line) => line.split(' ') as [string, string])
    const vocab = Object.values(Tokenizer.bytes_to_unicode())
    vocab.push(...vocab.map((v) => v + '</w>'))
    for (const merge of merges) vocab.push(merge.join(''))
    vocab.push('<|startoftext|>', '<|endoftext|>')
    res.encoder = Object.fromEntries(zip(vocab, range(vocab.length)))
    res.bpe_ranks = new ArrayMap(zip(merges, range(merges.length)))
    res.cache = { '<|startoftext|>': '<|startoftext|>', '<|endoftext|>': '<|endoftext|>' }
    res.pat = /<\|startoftext\>|<\|endoftext\>|'s|'t|'re|'ve|'m|'ll|'d|[^\s]+/gi
    return res
  }
  bpe = (token: string) => {
    if (token in this.cache) return this.cache[token]
    let word = [...token.slice(0, -1), token.at(-1)! + '</w>']
    let pairs = Tokenizer.get_pairs(word)

    if (!pairs.size) return token + '</w>'

    while (true) {
      const bigram = [...pairs].toSorted((a, b) => (this.bpe_ranks.get(a) ?? Infinity) - (this.bpe_ranks.get(b) ?? Infinity))[0]
      if (!this.bpe_ranks.has(bigram)) break
      const [first, second] = bigram
      let new_word: string[] = []
      let i = 0
      while (i < word.length) {
        const j = word.indexOf(first, i)
        if (j !== -1) {
          new_word.push(...word.slice(i, j))
          i = j
        } else {
          new_word.push(...word.slice(i))
          break
        }
        if (word[i] === first && i < word.length - 1 && word[i + 1] === second) {
          new_word.push(first + second)
          i += 2
        } else {
          new_word.push(word[i])
          i += 1
        }
      }
      new_word = [...new_word]
      word = new_word
      if (word.length === 1) break
      pairs = Tokenizer.get_pairs(word)
    }
    const out = word.join(' ')
    this.cache[token] = out
    return out
  }
  encode = (text: string, pad_with_zeros = false): number[] => {
    let bpe_tokens: number[] = []
    text = Tokenizer.whitespace_clean(text.trim()).toLowerCase()
    for (let match of text.matchAll(this.pat)) {
      const token = [...string_to_bytes(match.toString())].map((b) => this.byte_encoder[b]).join('')
      bpe_tokens.push(...this.bpe(token).split(' ').map((bpe_token) => this.encoder[bpe_token]))
    }
    // Truncation, keeping two slots for start and end tokens.
    if (bpe_tokens.length > 75) bpe_tokens = bpe_tokens.slice(0, 75)
    return [49406, ...bpe_tokens, 49407, ...range(77 - bpe_tokens.length - 2).map(() => pad_with_zeros ? 0 : 49407)]
  }
}
abstract class Embedder {
  abstract input_key: string
  abstract call: (x: string | string[] | Tensor) => Tensor | Tensor[]
}

export class ClipMlp {
  fc1 = new Linear(768, 3072)
  fc2 = new Linear(3072, 768)

  call = (h: Tensor) => {
    h = this.fc1.call(h)
    h = h.quick_gelu()
    h = this.fc2.call(h)
    return h
  }
}

export class ClipAttention {
  embed_dim = 768
  num_heads = 12
  head_dim = idiv(this.embed_dim, this.num_heads)
  k_proj = new Linear(this.embed_dim, this.embed_dim)
  v_proj = new Linear(this.embed_dim, this.embed_dim)
  q_proj = new Linear(this.embed_dim, this.embed_dim)
  out_proj = new Linear(this.embed_dim, this.embed_dim)

  call = (hidden_states: Tensor, causal_attention_mask: Tensor) => {
    const [bsz, tgt_len, embed_dim] = hidden_states.shape
    let q = this.q_proj.call(hidden_states), k = this.k_proj.call(hidden_states), v = this.v_proj.call(hidden_states)
    ;[q, k, v] = [q, k, v].map((x) => x.reshape(bsz, tgt_len, this.num_heads, this.head_dim).transpose(1, 2))
    const attn_output = q.scaled_dot_product_attention(k, v, causal_attention_mask)
    return this.out_proj.call(attn_output.transpose(1, 2).reshape(bsz, tgt_len, embed_dim))
  }
}
export class ClipEncoderLayer {
  self_attn = new ClipAttention()
  layer_norm1 = new LayerNorm(768)
  mlp = new ClipMlp()
  layer_norm2 = new LayerNorm(768)

  call = (hidden_states: Tensor, causal_attention_mask: Tensor) => {
    let residual = hidden_states
    hidden_states = this.layer_norm1.call(hidden_states)
    hidden_states = this.self_attn.call(hidden_states, causal_attention_mask)
    hidden_states = residual.add(hidden_states)

    residual = hidden_states
    hidden_states = this.layer_norm2.call(hidden_states)
    hidden_states = this.mlp.call(hidden_states)
    hidden_states = residual.add(hidden_states)

    return hidden_states
  }
}
export class ClipTextEmbeddings {
  token_embedding = new Embedding(49408, 768)
  position_embedding = new Embedding(77, 768)

  call = (input_ids: Tensor, position_ids: Tensor) => {
    return this.token_embedding.call(input_ids).add(this.position_embedding.call(position_ids))
  }
}
export class ClipEncoder {
  layers: ClipEncoderLayer[]
  constructor(layer_count: number = 12) {
    this.layers = range(layer_count).map(() => new ClipEncoderLayer())
  }
  call = (x: Tensor, causal_attention_mask: Tensor, ret_layer_idx?: number) => {
    // the indexing of layers is NOT off by 1, the original code considers the "input" as the first hidden state
    const layers = ret_layer_idx === undefined ? this.layers : this.layers.slice(0, ret_layer_idx)
    for (const l of layers) x = l.call(x, causal_attention_mask)
    return x
  }
}
export class ClipTextTransformer {
  embeddings = new ClipTextEmbeddings()
  encoder = new ClipEncoder()
  final_layer_norm = new LayerNorm(768)
  constructor(public ret_layer_idx?: number) {}

  call = (input_ids: Tensor) => {
    let x = this.embeddings.call(input_ids, Tensor.arange(num(input_ids.shape[1])).reshape(1, -1))
    x = this.encoder.call(x, Tensor.full([1, 1, 77, 77], -Infinity).triu(1), this.ret_layer_idx)
    return this.ret_layer_idx === undefined ? this.final_layer_norm.call(x) : x
  }
}
export class ClipTextModel {
  text_model: ClipTextTransformer
  constructor(ret_layer_idx?: number) {
    this.text_model = new ClipTextTransformer(ret_layer_idx)
  }
}

// # https://github.com/Stability-AI/generative-models/blob/fbdc58cab9f4ee2be7a5e1f2e2787ecd9311942f/sgm/modules/encoders/modules.py#L331
// class FrozenClosedClipEmbedder(Embedder):
//   def __init__(self, ret_layer_idx:Optional[int]=None):
//     this.tokenizer   = Tokenizer.ClipTokenizer()
//     this.transformer = Closed.ClipTextModel(ret_layer_idx)
//     this.input_key   = "txt"

//   def __call__(self, texts:Union[str,List[str],Tensor]) -> Union[Tensor,Tuple[Tensor,...]]:
//     if isinstance(texts, str): texts = [texts]
//     assert isinstance(texts, (list,tuple)), f"expected list of strings, got {type(texts).__name__}"
//     tokens = Tensor.cat(*[Tensor(this.tokenizer.encode(text)) for text in texts], dim=0)
//     return this.transformer.text_model(tokens.reshape(len(texts),-1))

// class Open:
//   """
//   Namespace for OpenCLIP model components.
//   """
//   class MultiheadAttention:
//     def __init__(self, dims:int, n_heads:int):
//       this.dims    = dims
//       this.n_heads = n_heads
//       this.d_head  = this.dims // this.n_heads

//       this.in_proj_bias   = Tensor.empty(3*dims)
//       this.in_proj_weight = Tensor.empty(3*dims, dims)
//       this.out_proj = Linear(dims, dims)

//     def __call__(self, x:Tensor, attn_mask:Optional[Tensor]=None) -> Tensor:
//       T,B,C = x.shape

//       proj = x.linear(this.in_proj_weight.T, this.in_proj_bias)
//       proj = proj.unflatten(-1, (3,C)).unsqueeze(0).transpose(0, -2)

//       q,k,v = [y.reshape(T, B*this.n_heads, this.d_head).transpose(0, 1).reshape(B, this.n_heads, T, this.d_head) for y in proj.chunk(3)]

//       attn_output = Tensor.scaled_dot_product_attention(q, k, v, attn_mask=attn_mask)
//       attn_output = attn_output.permute(2, 0, 1, 3).reshape(T*B, C)

//       attn_output = this.out_proj(attn_output)
//       attn_output = attn_output.reshape(T, B, C)

//       return attn_output

//   class Mlp:
//     def __init__(self, dims, hidden_dims):
//       this.c_fc   = Linear(dims, hidden_dims)
//       this.c_proj = Linear(hidden_dims, dims)

//     def __call__(self, x:Tensor) -> Tensor:
//       return x.sequential([this.c_fc, Tensor.gelu, this.c_proj])

//   # https://github.com/mlfoundations/open_clip/blob/58e4e39aaabc6040839b0d2a7e8bf20979e4558a/src/open_clip/transformer.py#L210
//   class ResidualAttentionBlock:
//     def __init__(self, dims:int, n_heads:int, mlp_ratio:float):
//       this.ln_1 = LayerNorm(dims)
//       this.attn = Open.MultiheadAttention(dims, n_heads)

//       this.ln_2 = LayerNorm(dims)
//       this.mlp  = Open.Mlp(dims, int(dims * mlp_ratio))

//     def __call__(self, x:Tensor, attn_mask:Optional[Tensor]=None, transpose:bool=False) -> Tensor:
//       q_x = this.ln_1(x)
//       attn_out = this.attn(q_x.transpose(0, 1) if transpose else q_x, attn_mask=attn_mask)
//       attn_out = attn_out.transpose(0, 1) if transpose else attn_out
//       x = x + attn_out
//       x = x + this.mlp(this.ln_2(x))
//       return x

//   # https://github.com/mlfoundations/open_clip/blob/58e4e39aaabc6040839b0d2a7e8bf20979e4558a/src/open_clip/transformer.py#L317
//   class ClipTransformer:
//     def __init__(self, dims:int, layers:int, n_heads:int, mlp_ratio:float=4.0):
//       this.resblocks = [
//         Open.ResidualAttentionBlock(dims, n_heads, mlp_ratio) for _ in range(layers)
//       ]

//     def __call__(self, x:Tensor, attn_mask:Optional[Tensor]=None) -> Tensor:
//       for r in this.resblocks:
//         x = r(x, attn_mask=attn_mask, transpose=True)
//       return x

//   # https://github.com/mlfoundations/open_clip/blob/58e4e39aaabc6040839b0d2a7e8bf20979e4558a/src/open_clip/model.py#L220
//   # https://github.com/mlfoundations/open_clip/blob/58e4e39aaabc6040839b0d2a7e8bf20979e4558a/src/open_clip/transformer.py#L661
//   class ClipTextTransformer:
//     def __init__(self, width:int, n_heads:int, layers:int, vocab_size:int=49408, ctx_length:int=77):
//       this.token_embedding = Embedding(vocab_size, width)
//       this.positional_embedding = Tensor.empty(ctx_length, width)
//       this.transformer = Open.ClipTransformer(width, layers, n_heads)
//       this.ln_final = LayerNorm(width)
//       this.text_projection = Tensor.empty(width, width)
//       this.attn_mask = Tensor.full((77, 77), float("-inf")).triu(1).realize()

//     def __call__(self, text:Tensor) -> Tensor:
//       seq_len = text.shape[1]

//       x = this.token_embedding(text)
//       x = x + this.positional_embedding[:seq_len]
//       x = this.transformer(x, attn_mask=this.attn_mask)
//       x = this.ln_final(x)

//       pooled = x[:, text.argmax(dim=-1)] @ this.text_projection
//       return pooled

//   class ClipVisionTransformer:
//     def __init__(self, width:int, layers:int, d_head:int, image_size:int, patch_size:int):
//       grid_size = image_size // patch_size
//       n_heads = width // d_head
//       assert n_heads * d_head == width

//       this.conv1 = Conv2d(3, width, kernel_size=patch_size, stride=patch_size, bias=False)

//       this.class_embedding = Tensor.empty(width)
//       this.positional_embedding = Tensor.empty(grid_size * grid_size + 1, width)
//       this.transformer = Open.ClipTransformer(width, layers, n_heads)
//       this.ln_pre  = LayerNorm(width)
//       this.ln_post = LayerNorm(width)
//       this.proj = Tensor.empty(width, 1024)

//     def __call__(self, x:Tensor) -> Tensor:
//       x = this.conv1(x)
//       x = x.reshape(x.shape[0], x.shape[1], -1).permute(0, 2, 1)
//       x = this.class_embedding.reshape(1, 1, -1).expand(x.shape[0], 1, -1).cat(x, dim=1)
//       x = x + this.positional_embedding

//       x = this.ln_pre(x)
//       x = this.transformer(x)
//       x = this.ln_post(x)

//       pooled = x[:, 0] @ this.proj
//       return pooled

// # https://github.com/Stability-AI/generative-models/blob/fbdc58cab9f4ee2be7a5e1f2e2787ecd9311942f/sgm/modules/encoders/modules.py#L396
// # https://github.com/Stability-AI/generative-models/blob/fbdc58cab9f4ee2be7a5e1f2e2787ecd9311942f/sgm/modules/encoders/modules.py#L498
// class FrozenOpenClipEmbedder(Embedder):
//   def __init__(self, dims:int, n_heads:int, layers:int, return_pooled:bool, ln_penultimate:bool=False):
//     this.tokenizer = Tokenizer.ClipTokenizer()
//     this.model = Open.ClipTextTransformer(dims, n_heads, layers)
//     this.return_pooled = return_pooled
//     this.input_key = "txt"
//     this.ln_penultimate = ln_penultimate

//   def tokenize(self, text:str, device:Optional[str]=None) -> Tensor:
//     return Tensor(this.tokenizer.encode(text, pad_with_zeros=True), dtype=dtypes.int64, device=device).reshape(1,-1)

//   def text_transformer_forward(self, x:Tensor, attn_mask:Optional[Tensor]=None):
//     for r in this.model.transformer.resblocks:
//       x, penultimate = r(x, attn_mask=attn_mask), x
//     return x.permute(1, 0, 2), penultimate.permute(1, 0, 2)

//   def embed_tokens(self, tokens:Tensor) -> Union[Tensor,Tuple[Tensor,...]]:
//     x = this.model.token_embedding(tokens).add(this.model.positional_embedding).permute(1,0,2)
//     x, penultimate = this.text_transformer_forward(x, attn_mask=this.model.attn_mask)

//     if this.ln_penultimate:
//       penultimate = this.model.ln_final(penultimate)

//     if this.return_pooled:
//       x = this.model.ln_final(x)
//       index = tokens.argmax(axis=-1).reshape(-1,1,1).expand(x.shape[0],1,x.shape[-1])
//       pooled = x.gather(1, index).squeeze(1) @ this.model.text_projection
//       return penultimate, pooled
//     else:
//       return penultimate

//   def __call__(self, texts:Union[str,List[str],Tensor]) -> Union[Tensor,Tuple[Tensor,...]]:
//     if isinstance(texts, str): texts = [texts]
//     assert isinstance(texts, (list,tuple)), f"expected list of strings, got {type(texts).__name__}"
//     tokens = Tensor.cat(*[this.tokenize(text) for text in texts], dim=0)
//     return this.embed_tokens(tokens)

// clip_configs: Dict = {
//   "ViT-H-14": {
//     "dims": 1024,
//     "vision_cfg": {
//       "width": 1280,
//       "layers": 32,
//       "d_head": 80,
//       "image_size": 224,
//       "patch_size": 14,
//     },
//     "text_cfg": {
//       "width": 1024,
//       "n_heads": 16,
//       "layers": 24,
//       "ctx_length": 77,
//       "vocab_size": 49408,
//     },
//     "return_pooled": False,
//     "ln_penultimate": True,
//   }
// }

// class OpenClipEncoder:
//   def __init__(self, dims:int, text_cfg:Dict, vision_cfg:Dict, **_):
//     this.visual = Open.ClipVisionTransformer(**vision_cfg)

//     text = Open.ClipTextTransformer(**text_cfg)
//     this.transformer = text.transformer
//     this.token_embedding = text.token_embedding
//     this.positional_embedding = text.positional_embedding
//     this.ln_final = text.ln_final
//     this.text_projection = text.text_projection

//     this.attn_mask = Tensor.full((77, 77), float("-inf")).triu(1).realize()
//     this.mean = Tensor([0.48145466, 0.45782750, 0.40821073]).reshape(-1, 1, 1)
//     this.std  = Tensor([0.26862954, 0.26130258, 0.27577711]).reshape(-1, 1, 1)

//   # TODO:
//   # Should be doable in pure tinygrad, would just require some work and verification.
//   # This is very desirable since it would allow for full generation->evaluation in a single JIT call.
//   def prepare_image(self, image:Image.Image) -> Tensor:
//     SIZE = 224
//     w, h = image.size
//     scale = min(SIZE / h, SIZE / w)
//     image = image.resize((max(int(w*scale),SIZE),max(int(h*scale),SIZE)), Image.Resampling.BICUBIC)
//     w, h = image.size
//     if w > SIZE:
//       left = (w - SIZE) // 2
//       image = image.crop((left, left+SIZE, 0, SIZE))
//     elif h > SIZE:
//       top = (h - SIZE) // 2
//       image = image.crop((0, SIZE, top, top+SIZE))
//     print("here")
//     x = Tensor(np.array(image.convert('RGB')), device=this.std.device)
//     x = x.permute(2, 0, 1).cast(dtypes.float32) / 255.0
//     return (x - this.mean) / this.std

//   def encode_tokens(self, tokens:Tensor) -> Tensor:
//     x = this.token_embedding(tokens)
//     x = x + this.positional_embedding
//     x = this.transformer(x, attn_mask=this.attn_mask)
//     x = this.ln_final(x)
//     x = x[:, tokens.argmax(axis=-1)]
//     x = x @ this.text_projection
//     return x

//   def get_clip_score(self, tokens:Tensor, image:Tensor) -> Tensor:
//     image_features: Tensor = this.visual(image)
//     image_features /= image_features.square().sum(-1, keepdim=True).sqrt() # Frobenius Norm

//     text_features = this.encode_tokens(tokens)
//     text_features /= text_features.square().sum(-1, keepdim=True).sqrt() # Frobenius Norm

//     return (image_features * text_features).sum(axis=-1)

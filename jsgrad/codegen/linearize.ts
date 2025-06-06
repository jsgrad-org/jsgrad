import { dtypes, PtrDType } from '../dtype.ts'
import { ArrayMap, assert, dedup, DefaultMap, flatten, id, is_eq, is_less_than, min, partition, set_default, WeakValueMap } from '../helpers/helpers.ts'
import { graph_rewrite, GroupOp, Ops, PatternMatcher, type_verify, UOp, UPat } from '../ops.ts'

const DONT_PLACE_IN_BLOCK = [Ops.DEFINE_GLOBAL, Ops.DEFINE_LOCAL, Ops.DEFINE_VAR, Ops.SPECIAL, Ops.CONST, ...GroupOp.Block]

export const disp = (y: UOp): string => {
  if (y.op === Ops.BLOCKSTART) return 'w' + disp(y.src[0])
  if (y.op === Ops.IF) return `IF${y._id}`
  if (y.op === Ops.RANGE) return y.arg.toString()
  return '<NONE>'
}

export class BasicBlock {
  _id: bigint
  static cache = new WeakValueMap<bigint, BasicBlock>()
  constructor(public ctx: UOp[], public lst: UOp[], public end?: UOp) {
    this._id = id(ctx, lst, end)
    Object.freeze(this)
    return BasicBlock.cache.setDefault(this._id, this)
  }
  lt = (o: BasicBlock) => is_less_than([...this.ctx, ...this.lst].map((x) => x.tuplize), [...o.ctx, ...o.lst].map((x) => x.tuplize))
  toString = () => `${this.end !== undefined ? (disp(this.end) + ' ') : ''}` + `${this.ctx.map((y) => disp(y))} ${this.lst.length}` + '\n' + this.lst.map((x) => x.op.toString()).join('\n')
}
type CTX = [Map<UOp, UOp[]>, Map<UOp, UOp[]>]
export const append_to_block = (ctx: CTX, x: UOp): UOp | undefined => {
  const [block_ctxs, children] = ctx
  const in_this_block = new Set(x.arg.lst)

  // collections to build
  let new_srcs: UOp[] = []
  const to_append: UOp[] = []
  const old_blocks = new ArrayMap<UOp[], UOp>()
  const new_blocks = new ArrayMap<UOp[], UOp[]>()

  for (const u of x.src) {
    if (u.op === Ops.BLOCK) {
      // merge sibling blocks. NOTE: blocks must only have one output source
      if (old_blocks.has(u.arg.ctx)) throw new Error('sibling should never have been created')
      old_blocks.set(u.arg.ctx, u)
    } else if (!DONT_PLACE_IN_BLOCK.includes(u.op) && new Set(children.get(u)).isSubsetOf(in_this_block)) {
      // if it can go in blocks and all its children are in the block, we add it to the block
      const block_ctx = block_ctxs.get(u)!
      if (is_eq(block_ctx, x.arg.ctx)) {
        // if it's the same context, we place the UOp in this block and append the parents to its srcs
        new_srcs = [...new_srcs, ...u.src]
        to_append.push(u)
      } // if it's a different context, we create a new block with this UOp

      else new_blocks.setDefault(block_ctx, []).push(u)
    } // otherwise, we keep it in the srcs
    else new_srcs.push(u)
  }
  if (to_append.length === 0 && new_blocks.size === 0) return undefined

  for (let [rng, lst] of new_blocks.entries()) {
    let srcs = flatten(lst.map((y) => y.src))
    const old_block = old_blocks.get(rng)
    old_blocks.delete(rng)
    if (old_block !== undefined) {
      // NOTE: order shouldn't matter here
      srcs = [...srcs, ...old_block.src]
      lst = [...lst, ...old_block.arg.lst]
    }
    let new_block = new UOp(Ops.BLOCK, dtypes.void, dedup(srcs), new BasicBlock(rng, lst))
    let lrng = [...rng]
    for (const r of rng.toReversed()) {
      if (!x.arg.ctx.includes(r) && r.op !== Ops.BLOCKSTART) {
        lrng = lrng.filter((x) => x !== r)
        new_block = new UOp(Ops.BLOCKEND, undefined, [new_block], new BasicBlock(lrng, [new UOp(r.op === Ops.IF ? Ops.ENDIF : Ops.ENDRANGE, undefined, [r])], r))
      }
    }
    new_srcs.push(new_block)
  }
  return new UOp(Ops.BLOCK, dtypes.void, dedup([...old_blocks.values(), ...new_srcs]), new BasicBlock(x.arg.ctx, [...to_append, ...x.arg.lst]))
}
export const make_basic_blocks = new PatternMatcher<CTX>([
  new UPat(Ops.SINK).named('x').fn(({ x }) => new UOp(Ops.BLOCK, undefined, x.src, new BasicBlock([], [x]))),
  new UPat(Ops.BLOCK).named('x').fn(({ ctx, x }) => append_to_block(ctx, x)),
])

export const block_merge = (ctx: Map<UOp, UOp[]>, x: UOp): UOp | undefined => {
  if (!(x.arg instanceof BasicBlock)) throw new Error('Has to be basic block,maybe??')
  // ctx is children here
  if (x.op === Ops.BLOCKEND) {
    // if it's a BLOCKEND, see if we are done with placement. if all the children of the range are in here
    const in_this_block = new Set(x.arg.lst)
    if (ctx.get(x.arg.end!)!.filter((y) => !in_this_block.has(y)).length === 0) {
      // find the parent block that has the BLOCKSTART in the ctx
      const parent_blocks = x.src.filter((y) => y.op === Ops.BLOCK && y.arg.ctx.includes(new UOp(Ops.BLOCKSTART, undefined, [x.arg.end])))
      if (parent_blocks.length > 1) throw new Error('should never have two parent blocks')
      if (parent_blocks.length === 1) {
        const parent_block = parent_blocks[0]
        // range needs DEFINE_ACC to be before the range (never in DEFINE_ACC for if)
        const [early_ops, late_ops] = partition(x.arg.lst, (y) => y.op === Ops.DEFINE_ACC && y.src.includes(x.arg.end))
        return new UOp(Ops.BLOCK, dtypes.void, [...x.src.filter((y) => y !== parent_block), ...parent_block.src], new BasicBlock(x.arg.ctx.filter((y) => y !== x.arg.end), [...early_ops, ...parent_block.arg.lst, ...late_ops]))
      }
    }
  }
  let new_srcs: UOp[] = []
  let to_append: UOp[] = []
  let new_ctx = x.arg.ctx
  const placed = new Set()
  for (const u of x.src) {
    if (u.op === Ops.BLOCK && (is_eq(u.arg.ctx, x.arg.ctx) || (x.arg.end !== undefined && u.arg.ctx.includes(x.arg.end)))) {
      // NOTE: this can't appear in srcs twice or it would be a BLOCKFORK
      new_ctx = [...new_ctx, ...u.arg.ctx.filter((y: UOp) => !x.arg.ctx.includes(y))]
      new_srcs = [...new_srcs, ...u.src]
      to_append = [...to_append, ...u.arg.lst]
    } else if (u.op === Ops.BLOCKFORK && x.src.filter((a) => a === u).length === u.arg) { // block fork appears # of times in srcs
      if (!placed.has(u)) {
        new_srcs = [...new_srcs, ...u.src]
        placed.add(u)
      }
    } else {
      // keep it in srcs
      new_srcs.push(u)
    }
  }
  if (to_append.length === 0 && placed.size === 0) return undefined
  return new UOp(x.op, dtypes.void, new_srcs, new BasicBlock(new_ctx.toSorted((a, b) => is_less_than(a.tuplize, b.tuplize) ? -1 : 1), [...to_append, ...x.arg.lst], x.arg.end))
}
export const pm_block_merge = new PatternMatcher<Map<UOp, UOp[]>>([[new UPat([Ops.BLOCKEND, Ops.BLOCK]).named('x'), ({ ctx, x }) => block_merge(ctx, x)]])

// NOTE: any toposort should be valid here, unlike last time this isn't required, it's just for speed
export const block_reorder = (in_block: UOp): UOp => {
  const in_this_block = new Set(in_block.arg.lst)
  const local_children = new DefaultMap<UOp, UOp[]>(undefined, () => [])
  const in_degree = new DefaultMap<UOp, number>(undefined, () => 0)
  const priorities = new Map<UOp, number>()
  // get local children and assign priorities
  for (const u of in_block.arg.lst.toReversed()) {
    for (const s of u.src) {
      if (in_this_block.has(s)) {
        local_children.set(s, [...set_default(local_children, s, []), u])
        in_degree.set(u, set_default(in_degree, u, 0) + 1)
      }
    }
    // put loads in the beginning of the block and prevent priority inversion
    priorities.set(u, min([u.op === Ops.LOAD ? -1000 : 0, ...(set_default(local_children, u, []).map((x) => priorities.get(x)!))]))
  }

  // placement queue
  const queue: UOp[] = []
  const push = (u: UOp) => {
    queue.push(u)
    queue.sort((a, b) => {
      const priA = priorities.get(a) || 0
      const priB = priorities.get(b) || 0
      if (priA !== priB) return priA - priB
      // Compare tuplize as secondary sort key
      // Assuming tuplize comparison works similar to Python
      return is_less_than(a.tuplize, b.tuplize) ? -1 : 1
    })
  }

  // place the first ones that don't have deps
  for (const u of in_block.arg.lst) if (!in_degree.has(u)) push(u)

  const newlst = []
  while (queue.length) {
    const x = queue.shift()!
    newlst.push(x)
    for (const u of local_children.get(x)!) {
      in_degree.set(u, in_degree.get(u)! - 1)
      if (in_degree.get(u) === 0) push(u)
    }
  }
  if (newlst.length !== in_block.arg.lst.length) throw new Error(`len mismatch ${newlst.length} != ${in_block.arg.lst.length}`)
  return in_block.replace({ arg: new BasicBlock(in_block.arg.ctx, newlst) })
}

export const linearize_uop = (sink: UOp, skip_check = false): UOp[] => {
  if (sink.op !== Ops.SINK) throw new Error(`sink isn't sink, it's ${sink.op}`)

  // get children and all block contexts
  const temp_block_ctxs = new Map<UOp, UOp[]>()
  const children = new Map<UOp, UOp[]>()
  for (const u of sink.toposort) {
    let this_block_ctx: UOp[] = []
    for (const s of u.src) {
      // save children
      set_default(children, s, []).push(u)
      // compute block ctx
      if ([Ops.RANGE, Ops.IF].includes(s.op)) this_block_ctx.push(s)
      // don't flow (fully) through assign and store
      else if (s.op === Ops.STORE) {
        // ugh, deal with non-reduce locals. probably wrong
        if (s.src[0].dtype instanceof PtrDType && s.src[0].dtype.local) {
          const [idx_context, store_context] = [temp_block_ctxs.get(s.src[0]), temp_block_ctxs.get(s)]
          this_block_ctx = [...this_block_ctx, ...store_context!.filter((x) => !idx_context!.includes(x) && x.op === Ops.RANGE)]
        }
      } else if (s.op === Ops.ASSIGN) {
        // flow though assign, but remove the ranges used in the assign
        if (s.src[0].op !== Ops.DEFINE_ACC) throw new Error(`${s.src[0].op} has to be ${Ops.DEFINE_ACC}`)
        this_block_ctx = [...this_block_ctx, ...temp_block_ctxs.get(s.src[1])!.filter((x) => !s.src[0].src.slice(1).includes(x))]
      } // flow though everything else

      else this_block_ctx = [...this_block_ctx, ...temp_block_ctxs.get(s)!]
    }
    temp_block_ctxs.set(u, dedup(this_block_ctx).toSorted((a, b) => is_less_than(a.tuplize, b.tuplize) ? -1 : 1))
  }
  // make final block_ctxs, add BLOCKSTART to block_ctxs for IF and RANGE
  const block_ctxs = new Map<UOp, UOp[]>()
  for (const u of sink.toposort) {
    block_ctxs.set(u, [Ops.IF, Ops.RANGE].includes(u.op) ? [new UOp(Ops.BLOCKSTART, undefined, [u]), ...temp_block_ctxs.get(u)!] : temp_block_ctxs.get(u)!)
  }

  // TODO: there's probably a clever way to remove this while loop
  while (true) {
    sink = graph_rewrite(sink, make_basic_blocks, [block_ctxs, children] satisfies CTX)

    // add BLOCKFORK (slow!)
    const block_parent_count = [...sink.toposort].filter((x) => x.op === Ops.BLOCK).flatMap((x) => x.src).reduce((acc, src) => {
      acc.set(src, (acc.get(src) || 0) + 1)
      return acc
    }, new Map<UOp, number>())
    const non_block_parents = new Set([...sink.toposort].filter((x) => x.op !== Ops.BLOCK).flatMap((x) => x.src))
    const forks = new Map<UOp, UOp>(
      block_parent_count.entries().filter(([u, child_count]) => !DONT_PLACE_IN_BLOCK.includes(u.op) && child_count > 1 && !non_block_parents.has(u))
        .map(([u, child_count]) => [u, new UOp(Ops.BLOCKFORK, undefined, [new UOp(Ops.BLOCK, undefined, u.src, new BasicBlock(block_ctxs.get(u)!, [u]))], child_count)]),
    )
    if (!forks.size) break
    sink = sink.substitute(forks)
  }
  // combine matching BLOCKENDS
  const blockends_to_arg = new Map<UOp, UOp[]>()
  for (const be of sink.toposort) if (be.op === Ops.BLOCKEND) set_default(blockends_to_arg, be.arg.end, []).push(be)
  const new_forks = new Map<UOp, UOp>()
  for (const [k, v] of blockends_to_arg.entries()) {
    // NOTE: if any BLOCKEND is the parent of any other with the same arg, this algo fails
    if (v.length > 1) {
      const out = new UOp(Ops.BLOCKFORK, undefined, [new UOp(Ops.BLOCKEND, undefined, v.flatMap((x) => x.src), new BasicBlock(dedup(v.flatMap((y) => y.arg.ctx)), v[0].arg.lst, k))], v.length)
      for (const u of v) new_forks.set(u, out)
    }
  }
  sink = sink.substitute(new_forks)

  // reorder ops in block for speed
  sink = sink.substitute(new Map([...sink.toposort].filter((u) => u.op === Ops.BLOCK).map((u) => [u, block_reorder(u)] as [UOp, UOp]).filter(([u, newu]) => newu !== u)))

  // final rewrite to merge all blocks into one
  sink = graph_rewrite(sink, pm_block_merge, children)

  // there should just be one block left, with a few parents with 0 srcs
  assert(sink.op === Ops.BLOCK)
  // TODO this sorts a little bit differently, than tinygrad
  let _uops = dedup(sink.src).toSorted((a, b) => is_less_than(a.tuplize, b.tuplize) ? -1 : 1)
  for (const x of _uops) if (x.src.length !== 0 || [Ops.BLOCK, Ops.BLOCKSTART, Ops.BLOCKEND, Ops.BLOCKFORK].includes(x.op)) throw new Error(`Invalid ${x}`)
  _uops = [..._uops, ...sink.arg.lst]

  // sanity checks (NOTE: these can cause things to be skipped in BEAM)
  if (!skip_check) type_verify(_uops)

  // strip the SINK
  return _uops.slice(0, -1)
}

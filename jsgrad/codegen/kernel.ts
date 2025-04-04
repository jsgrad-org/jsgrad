import { Device } from '../device.ts'
import { ImageDType } from '../dtype.ts'
import { all_int, all_same, ansilen, assert, cache, colored, dedup, DefaultMap, Enum, ge, gt, id, isInt, NotImplemented, num, product, range, round_up, set_default, sorted, sum, to_function_name, vars, WeakValueMap, zip } from '../helpers/helpers.ts'
import { can_pad, graph_rewrite, GroupOp, KernelInfo, Ops, print_uops, resolve, type sint, type_verify, UOp, type Variable, view_left } from '../ops.ts'
import { idiv, le, mod, mul, ne, prod } from '../helpers/helpers.ts'
import { ProgramSpec, type Renderer, type TensorCore } from '../renderer/index.ts'
import { ShapeTracker } from '../shape/shapetracker.ts'
import { strides_for_shape } from '../shape/view.ts'
import { linearize_uop } from './linearize.ts'
import { get_contraction, rewrite_shapetracker_with_index } from './lowerer.ts'
import { full_graph_rewrite } from '../ops.ts'

export class OptOps<Name extends string = string, Value extends number = number> extends Enum {
  private static VALUES: OptOps[] = []
  static values = () => [...OptOps.VALUES]
  _id: bigint
  constructor(name: Name) {
    super('OptOps', name, OptOps.VALUES.length + 1)
    this._id = id(name, this.value)
    OptOps.VALUES.push(this)
  }

  static readonly TC = new OptOps('TC')
  static readonly UPCAST = new OptOps('UPCAST')
  static readonly UNROLL = new OptOps('UNROLL')
  static readonly LOCAL = new OptOps('LOCAL')
  static readonly GROUP = new OptOps('GROUP')
  static readonly GROUPTOP = new OptOps('GROUPTOP')
  static readonly NOLOCALS = new OptOps('NOLOCALS')
  static readonly PADTO = new OptOps('PADTO')
  static readonly SWAP = new OptOps('SWAP')
}
export class KernelOptError extends Error {}

export const check = (cond: boolean, msg = '') => {
  if (!cond) throw new KernelOptError(msg)
}

export class Opt {
  _id: bigint
  static cache = new WeakValueMap<bigint, Opt>()
  constructor(public op: OptOps, public axis?: number, public amt?: number) {
    this._id = id(op, axis, amt)
    Object.freeze(this)
    return Opt.cache.setDefault(this._id, this)
  }
  toString = () => `new Opt(${this.op}, ${this.axis}, ${this.amt})`;
  [Symbol.for('nodejs.util.inspect.custom')](_depth: number, _options: any) {
    return this.toString()
  }
  real_axis = (k: Kernel): number => {
    if (this.axis === undefined) return -1
    if (this.op === OptOps.UNROLL) return k.first_reduce + this.axis
    if ([OptOps.GROUP, OptOps.GROUPTOP].includes(this.op)) return k.first_reduce + k.group_for_reduces + this.axis
    return this.axis
  }
}

export class TensorCoreOptions {
  constructor(
    public axes: number[], // the location of the original N and M axes if still in the shape
    public axes_exist: boolean[], // true if the original N and M axes are still in the shape
    public axis_pads: [number, number][],
  ) {}
  fix_axes = (removed_axis: number) => { // adjust the TC axes if necessary when a dimension is removed
    for (const tc_dim of range(2).filter((i) => this.axes_exist[i])) {
      if (removed_axis < this.axes[tc_dim]) this.axes[tc_dim] -= 1
      else if (removed_axis === this.axes[tc_dim]) this.axes_exist[tc_dim] = false
    }
  }
}

export class Kernel {
  ast!: UOp
  opts: Renderer
  reduceops: UOp[]
  vars: Variable[]
  bufs: UOp[]
  full_buf_index: number
  sts: ShapeTracker[]
  applied_opts: Opt[] = []
  group_for_reduces = 0

  uops?: UOp[]

  upcasted = 0
  local_dims = 0
  tensor_core?: TensorCore = undefined
  tensor_core_opts?: TensorCoreOptions = undefined
  use_tensor_cores = 0
  dont_use_locals = false
  constructor(ast: UOp, opts?: Renderer) {
    if (ast.op === Ops.SINK) this.ast = ast

    this.opts = opts !== undefined ? opts : Device.get(Device.DEFAULT).renderer!
    try {
      verify_ast(this.ast)
    } catch (e) {
      console.log(`INVALID AST`)
      console.log(this.ast)
      throw e
    }

    this.reduceops = [...this.ast.toposort].filter((x) => x.op === Ops.REDUCE_AXIS)

    this.vars = this.ast.variables()
    // NOTE: this requires a specific order with the [::-1], this===likely a bug
    this.bufs = [...this.ast.toposort].filter((x) => GroupOp.Buffer.includes(x.op)).toReversed()

    // get earlybufs, before any reduceops
    const earlybufs: UOp[] = this.reduceops.flatMap((reduceop) => [...reduceop.src[0].toposort].filter((x) => GroupOp.Buffer.includes(x.op)))
    this.full_buf_index = earlybufs.length ? this.bufs.indexOf(earlybufs[0]) : 0
    // NOTE: full_shape can be wrong if there's a tree of reduces

    // create new shapetrackers inside this kernel, we will permute them
    this.sts = this.bufs.map((x) => x.st_arg)

    // add the shapetrackers for each reduce
    // we use this to track which axes are reduced in each reduce
    for (const x of this.reduceops) {
      this.sts.push(x.st!)
      this.sts.push(x.src[0].st!)
    }
    // move all reduce axes to the end
    const reduce = [...zip(this.full_shape, this.output_shape).entries()]
    const permute = [...reduce.filter(([_, [s, n]]) => !resolve(ne(s, n))).map(([i]) => i), ...reduce.filter(([_, [s, n]]) => resolve(ne(s, n))).map(([i]) => i)]
    this.reshape_and_permute(undefined, permute)

    // group simplifies
    this.simplify_ones()
    this.simplify_merge_adjacent()
  }
  copy = () => {
    const ret = new Kernel(this.ast, this.opts)

    // base linearizer params
    ret.opts = this.opts, ret.ast = this.ast

    // things downstream of the AST
    ret.reduceops = [...this.reduceops], ret.vars = [...this.vars], ret.bufs = [...this.bufs], ret.full_buf_index = this.full_buf_index
    ret.sts = this.sts.slice(0, ret.bufs.length + ret.reduceops.length * 2) // NOTE: must redo the local buffers with TC in beam

    // parameters for optimizations
    ret.applied_opts = [...this.applied_opts], ret.group_for_reduces = this.group_for_reduces, ret.upcasted = this.upcasted, ret.local_dims = this.local_dims, ret.dont_use_locals = this.dont_use_locals
    ret.tensor_core = this.tensor_core, ret.tensor_core_opts = this.tensor_core_opts, ret.use_tensor_cores = this.use_tensor_cores

    return ret
  }

  get membufs(): UOp[] {
    return dedup(this.bufs.filter((x) => [Ops.LOAD, Ops.STORE].includes(x.op)).map((x) => x.src[0]))
  }

  // TODO: these need more tests ||it might silently be no-op
  float4_axis = (i: number) => this.sts[i].unit_stride_axes().filter((x) => x >= this.first_upcast && mod(this.sts[i].shape[x], 4) === 0).map((x) => x - this.first_upcast)

  upcasted_axis = (i: number): [number, undefined | sint, boolean][] => {
    const upcasted_shape = this.sts[i].shape.slice(this.first_upcast), upcasted_stride = this.sts[i].real_strides().slice(this.first_upcast)
    if (!all_int(upcasted_shape)) throw new Error(`cannot upcast a symbolic amount upcasted_shape=${upcasted_shape}`)
    return zip(upcasted_shape.map(num), upcasted_stride, zip(this.sts[0].shape.slice(this.first_upcast), this.full_shape.slice(this.first_upcast)).map(([x, y]) => Boolean(ne(x, y))))
  }
  get first_reduce() {
    return zip([...this.sts[0].shape.slice(0, this.first_upcast), 0], [...this.full_shape.slice(0, this.first_upcast), 1]).map(([x, y]) => resolve(ne(x, y))).indexOf(true)
  }

  get first_upcast() {
    return this.shape_len - this.upcasted
  }

  get reduceop() {
    return this.reduceops.length > 0 ? this.reduceops[0] : undefined
  }

  get output_shape() {
    return this.sts[0].shape
  }

  get full_shape() {
    return this.sts[this.full_buf_index].shape
  }

  get full_unupcasted_shape() {
    return this.full_shape.slice(0, this.first_upcast)
  }

  get shape_len() {
    return this.sts[0].shape.length
  }

  get upcast_in_mid_reduce_axes(): number[] {
    throw new NotImplemented()
  }

  get global_dims() {
    return this.first_reduce - this.local_dims
  }

  // there's eight chunks of the shape
  // blue   -- global dims
  // cyan   -- local dims (warp ones first)
  //  *** this.first_reduce
  // green  -- reduce-local dims
  // red    -- reduce loops
  //  *** this.upcasted
  // purple -- reduce upcasted
  // yellow -- normal upcasted dimensions
  colors = (): string[] => {
    // first non local non reduce dims are global (blue)
    let colors: string[] = range(this.global_dims).map(() => !this.dont_use_locals ? 'blue' : 'BLUE')
    // after global are local_dims; warp ones used in tensor cores must be closest to first_reduce (cyan)
    colors = [...colors, ...range(this.local_dims).map(() => 'cyan')]
    // between first_reduce and first_reduce + group_for_reduces, they are late upcasted (green)
    colors = [...colors, ...range(this.group_for_reduces).map(() => 'green')]
    // between first_reduce + group_for_reduces && upcasted, they are reduce (red)
    colors = [...colors, ...range(this.first_upcast - (this.first_reduce + this.group_for_reduces)).map(() => 'red')]
    // upcasted dimensions are reduce (magenta) ||normal (yellow)
    colors = [...colors, ...range(this.first_upcast, this.shape_len).map((i) => this.full_shape[i] !== this.sts[0].shape[i] ? 'magenta' : 'yellow')]
    if (colors.length !== this.shape_len) throw new Error('colors size mismatch')
    return colors
  }
  colored_shape = (pad?: number, dense = false): string => {
    const shape_strs = this.full_shape.map((s) => isInt(s) ? (dense ? `${s}` : s.toString().padStart(4)) : s.render())
    let ret = zip(shape_strs, this.colors()).map(([s, color]) => colored(s, color)).join(' ')
    if (pad) ret += ' '.repeat(pad - ansilen(ret))
    return ret
  }

  // ******************** base simplifiers ********************

  // apply reshape && permute to all shapetrackers
  reshape_and_permute = (new_shape_fxn?: (a: sint[]) => sint[], axis?: number[]) => {
    const reshape = (st: ShapeTracker) => new_shape_fxn !== undefined ? st.reshape(new_shape_fxn(st.shape)) : st
    const permute = (st: ShapeTracker) => axis !== undefined ? st.permute(axis) : st
    this.sts = this.sts.map((st) => permute(reshape(st)))
  }
  // drops the final dimension
  upcast = () => {
    check(this.full_shape.at(-1)! !== 1, "can't upcast a dimension with size 1")
    this.upcasted += 1
  }
  // axis : the axis to pull from
  // amount : the amount to take
  // top : if you want to pull that amount from the top
  // insert_before : place to insert the new stuff
  shift_to = (axis: number, amount: sint, top = false, insert_before?: number) => {
    if (insert_before === undefined) insert_before = this.shape_len
    const move_axis = top ? axis : axis + 1
    if (move_axis < insert_before) insert_before += 1
    this.reshape_and_permute((x) => [
      ...x.slice(0, axis),
      ...(num(x[axis]) > 1 ? (top ? [amount, idiv(x[axis], amount)] : [idiv(x[axis], amount), amount]) : [1, 1]),
      ...x.slice(axis + 1),
    ], [
      ...range(insert_before).filter((i) => i !== move_axis),
      move_axis,
      ...range(insert_before, this.shape_len + 1).filter((i) => i !== move_axis),
    ])
  }
  // ******************** complex simplifiers ********************

  simplify_ones = (): boolean => {
    // remove places where the shape===all ones
    // TODO: this should be factored in to multi shape stride
    if (this.shape_len === 0) return false
    const all_ones = this.full_shape.map((s) => Number(s === 1))
    this.local_dims = this.local_dims - sum(all_ones.slice(this.first_reduce - this.local_dims, this.first_reduce))
    this.upcasted = this.upcasted - sum(all_ones.slice(this.first_upcast)) // TODO: no necessary since upcasted axis can't be un-upcasted
    this.reshape_and_permute((shape) => [...shape.entries()].filter(([i, x]) => !all_ones[i]).map(([i, x]) => x), undefined)
    return all_ones.some(Boolean)
  }
  simplify_merge_adjacent = () => {
    if (this.shape_len === 0) return
    const shapes = this.sts.map((x) => x.shape), strides = this.sts.map((x) => x.real_strides())

    // if it's an image, insert fake strides such that this fusion doesn't happen across image axes
    if (this.membufs[0].dtype instanceof ImageDType) {
      const base_shape = this.membufs[0].dtype.shape
      const shape_idx_groups = get_contraction(this.output_shape, base_shape)
      if (shape_idx_groups?.length) {
        let special_strides: sint[] = []
        for (const [i, g] of shape_idx_groups.entries()) {
          const shape_piece = g.map((x) => this.output_shape[x])
          if (prod(shape_piece) !== base_shape[i]) throw new Error(`get_contraction was wrong? ${shape_piece} !== ${base_shape[i]}`)
          special_strides = [...special_strides, ...strides_for_shape(shape_piece)]
        }
        // adding the fake image shape
        shapes.push(this.output_shape)
        strides.push(special_strides)
      }
    }
    // merge dimensions if we can, multi _merge_dims
    // NOTE: this does not always preserve the reduce dimension
    // TODO: move this into shapetracker, with tests!
    // TODO: how does this work with multi-reduce?
    const rets: [sint, sint | undefined][][] = zip(shapes, strides).map(([s, st]) => [[s[0], st[0]]])
    for (const i of range(1, shapes[0].length)) {
      const can_merge = []
      for (const [s, st, ret] of zip(shapes, strides, rets)) {
        // TODO: added the always mergeability of 1s,===this right? if so, add to shapetracker in the 1 case
        const si = s[i], sti = st[i], last_st = ret.at(-1)![1]
        can_merge.push((sti !== undefined) && ((sti !== 0 && last_st === mul(si, sti)) || (sti === 0 && last_st === 0)))
      }
      // more can merge than this
      const mergeable = can_merge.every(Boolean) && i !== this.first_reduce
      for (const [j, [s, st]] of zip(shapes, strides).entries()) {
        if (mergeable) rets[j][rets[j].length - 1] = [mul(rets[j].at(-1)![0], s[i]), st[i]]
        else rets[j].push([s[i], st[i]])
      }
    }
    // do the reshapes
    for (const [i, x] of rets.slice(0, this.sts.length).entries()) this.sts[i] = this.sts[i].reshape(x.map((y) => y[0]))
  }
  // ******************** high level optimizers ********************

  _create_tc_opts = (reduceop: UOp, tc: TensorCore, axis: number, opt_level: number): TensorCoreOptions | undefined => {
    const has_cast = tc.dtype_in !== tc.dtype_out
    if (has_cast && !(reduceop.src[0].op === Ops.CAST && reduceop.src[0].dtype === tc.dtype_out)) return undefined

    const mul_op = has_cast ? reduceop.src[0].src[0] : reduceop.src[0]
    if (mul_op.op !== Ops.MUL) return undefined

    const buf_index = (src: UOp): number | undefined => {
      // TODO: apply tc even if the sources are not from LOAD
      let res: number | undefined = undefined
      if (src.op === Ops.LOAD && src.dtype === tc.dtype_in) res = this.bufs.indexOf(src)
      else if (opt_level >= 1 && src.op === Ops.CAST && src.dtype === tc.dtype_in) res = this.bufs.indexOf(src.src[0])
      return (res === undefined || res === -1) ? undefined : res
    }
    const buf0 = buf_index(mul_op.src[0]), buf1 = buf_index(mul_op.src[1])
    if (buf0 === undefined || buf1 === undefined) return undefined

    const buf0_strides = this.sts[buf0].real_strides(), buf1_strides = this.sts[buf1].real_strides()
    const axis_buf0 = [...buf0_strides.slice(0, this.first_reduce).entries().filter(([i, s]) => s === 0).map(([i, s]) => [i, this.full_shape[i], buf1_strides[i]] as [number, number, number])]
    const axis_buf1 = [...buf1_strides.slice(0, this.first_reduce).entries().filter(([i, s]) => s === 0).map(([i, s]) => [i, this.full_shape[i], buf0_strides[i]] as [number, number, number])]
    if (!(axis_buf0.length && axis_buf1.length && ((this.shape_len - this.first_reduce) === 1 || (opt_level >= 1)))) return undefined

    const axis_choices: [[number, sint, sint | undefined], [number, sint, sint | undefined], number][] = product(axis_buf0, axis_buf1, range(this.first_reduce, this.shape_len))
    if (!(axis < axis_choices.length)) return undefined

    const s0 = axis_choices.at(-(axis + 1))![0][0], s1 = axis_choices.at(-(axis + 1))![1][0], s2 = axis_choices.at(-(axis + 1))![2] // s0 is n, s1 is m, s2 is k
    const axis_pads = [...[s0, s1, s2].entries()].filter(([i, x]) => resolve(ne(mod(this.full_shape[x], tc.dims[i]), 0))).map(([i, x]) => [x, tc.dims[i]] as [number, number])
    if (axis_pads.length && (opt_level < 2)) return undefined
    if (vars.DEBUG >= 3) console.log('TENSOR CORES', axis_buf0, axis_buf1, tc)
    return new TensorCoreOptions([s0, s1, s2], [true, true], axis_pads)
  }
  _apply_tc_opt = (use_tensor_cores: number, axis: number, opt_level: number): boolean => {
    if (use_tensor_cores && this.reduceop !== undefined && this.reduceop.arg[0] === Ops.ADD) {
      for (const tc of this.opts.tensor_cores!) {
        const tensor_core_opts = this.reduceops.map((reduceop) => this._create_tc_opts(reduceop, tc, axis, opt_level))
        // can only fuse reduces with the same tc options
        assert(all_same(tensor_core_opts))
        if (tensor_core_opts[0] === undefined) continue
        this.tensor_core_opts = tensor_core_opts[0]
        // attempt to pad the tensor axes that require it
        try {
          for (const [axis, dim] of this.tensor_core_opts.axis_pads) this.apply_opt(new Opt(OptOps.PADTO, axis, dim), false) // PADTO might fail
        } catch (e) {
          if (e instanceof KernelOptError) continue
          throw e
        }
        // tensor core -- unroll the reduce dim (K), upcast and local the inner and outer dims (N, M)
        for (const [dim, amt] of tc.get_reduce_axes()) this.apply_opt(new Opt(OptOps.UNROLL, this.tensor_core_opts.axes[2] - this.first_reduce, amt), false)
        for (const opt of tc.opts) this.apply_opt(new Opt({ 'u': OptOps.UPCAST, 'l': OptOps.LOCAL }[opt[0] as 'u' | 'l'], this.tensor_core_opts.axes[Math.trunc(Number(opt[1]))], 2), false)
        this.tensor_core = tc
        this.use_tensor_cores = use_tensor_cores // TC=2 will do the shape ops without the WMMA
        return true
      }
    }
    return false
  }
  /**
   * Attempts to apply a tensor core optimization to the kernel.  If one exists && applies properly, return true, otherwise return false.
   * Tensor cores are optimized instructions that matrix multiply-accumulate across a wave of threads: D(M, N) = A(M, K) * B(K, N) + C(M, N).
   *
   * Keyword arguments:
   * use_tensor_cores -- controls how tensor cores are applied (default 1)
   * 0: will disable any tensor core matching
   * 1: enable tensor cores
   * 2: apply tensor core shape but don't use UOp.WMMA
   * extra_opts -- additional Opt's to apply after the tensor core instead of the hand-coded additional Opt's (default undefined)
   * tc_opt -- controls which kinds of kernels may be eligible for tensor cores application (default 2 during BEAM, 0 otherwise)
   * 0: applies to only kernels with a single reduce axis && direct UOps.LOAD into Ops.MUL
   * 1: allows kernels with multiple reduce axes && also multiplication of UOps.CAST'd buffers
   * 2: allows kernels with M, N, K axes that are not multiples of the tensor core dimensions by applying padding those axes as needed
   */
  apply_tensor_cores = (use_tensor_cores = 1, extra_opts?: Opt[], axis = 0, tc_opt?: number): boolean => {
    if (tc_opt === undefined) tc_opt = vars.TC_OPT
    if (!this.opts.tensor_cores?.length && use_tensor_cores !== 2) return false
    try { // check TC first and apply hand-coded opts if successful
      this.apply_opt(new Opt(OptOps.TC, axis, tc_opt))
      const tc_opts = this.tensor_core_opts
      if (tc_opts !== undefined) {
        if (extra_opts !== undefined) {
          for (const opt of extra_opts) this.apply_opt(opt)
        } else {
          if (this.opts.device === 'CLANG' && vars.AMX) return true // skip hand-coded TC opts if AMX, upcasting will make kernel slower
          // hand-coded TC opts
          for (const tc_dim of [1, 0].filter((tc_dim) => tc_opts.axes_exist[tc_dim])) { // attempt to upcast M and N
            const szs = [5, 4, 3, 2].filter((sz) => mod(this.full_shape[tc_opts.axes[tc_dim]], sz) === 0)
            if (szs.length) this.apply_opt(new Opt(OptOps.UPCAST, tc_opts.axes[tc_dim], szs[0]))
          }

          if (tc_opts.axes_exist[0]) {
            const szs = [4, 2].filter((sz) => mod(this.full_shape[tc_opts.axes[0]], sz) === 0) // attempt to local N
            if (szs.length) this.apply_opt(new Opt(OptOps.LOCAL, tc_opts.axes[0], szs[0]))
          }
        }
      }
      return true
    } catch (e) {
      if (e instanceof KernelOptError) return false
      throw e
    }
  }
  apply_opt = (opt: Opt, append_opt = true) => {
    if (this.dont_use_locals) check(![OptOps.LOCAL, OptOps.GROUP, OptOps.GROUPTOP].includes(opt.op), 'not using locals')

    if (opt.op === OptOps.TC) {
      check(this.applied_opts.length === 0, 'tensor core opts must be first') // TODO: things like PADTO might be fine
      check(opt.axis !== undefined && opt.amt !== undefined, 'tensor core opts must have an axis && amt')
      check(vars.USE_TC === 2 || (this.opts.tensor_cores?.length || 0) > 0, 'must have tensor cores or TC=2')
      check(this._apply_tc_opt(vars.USE_TC, opt.axis!, opt.amt!), 'no tensor core available')
      this.applied_opts.push(opt)
      return
    }
    const axis = opt.real_axis(this)
    check(axis < this.full_shape.length, 'invalid axis')
    let amt: number
    if (opt.op === OptOps.SWAP) amt = opt.amt! // amt===an axis in the SWAPs
    else if (opt.amt !== undefined) {
      amt = opt.amt !== 0 ? opt.amt : this.full_shape[axis] as number
      check(typeof amt === 'number' && amt !== 1, `shift/padto of amt=${amt}, 1 or symbolic amount is meaningless`)
      if (opt.op !== OptOps.PADTO) check(mod(this.full_shape[axis], amt) === 0, `no longer valid shift full_shape=${this.full_shape[axis]}, amt=${amt}, ${opt}`)
    } else amt = -1

    if (this.reduceop !== undefined && ([OptOps.GROUP, OptOps.GROUPTOP].includes(opt.op) || (this.group_for_reduces && ![OptOps.NOLOCALS, OptOps.PADTO].includes(opt.op)))) {
      const acc_sz = this.reduceop.dtype.itemsize
      const upcast_sz = prod(zip(this.full_shape.slice(this.first_upcast), this.sts[0].shape.slice(this.first_upcast)).filter(([a, b]) => a === b).map(([a, _]) => a))
      const local_sz = prod(this.full_shape.slice(this.first_reduce - this.local_dims, this.first_reduce + this.group_for_reduces))
      const smem_sz = mul(mul(mul(amt, acc_sz), upcast_sz), local_sz)
      check(!!le(smem_sz, this.opts.shared_max), `exceeds maximum shared memory size: needs ${smem_sz}, max ${this.opts.shared_max}`)
    }

    if (opt.op === OptOps.LOCAL) { // cyan
      check(this.opts.has_local, 'target does not support local')
      check(axis < this.global_dims, 'local is for globals')
      this.shift_to(axis, amt, undefined, this.first_reduce)
      this.local_dims += 1
    } else if ([OptOps.GROUP, OptOps.GROUPTOP].includes(opt.op)) { // green
      check(this.opts.has_local && this.opts.has_shared, 'target does not support local or shared mem')
      check(this.first_reduce + this.group_for_reduces <= axis && axis < this.first_upcast, 'must be reduce axis to group')
      check(!this.tensor_core, "can't group with tensor cores")
      const reduce_axes = this.reduceops.flatMap((r) => r.axis_arg.map((i) => i))
      check(reduce_axes.length === new Set(reduce_axes).size, "can't group with parallel reduces")
      this.shift_to(axis, amt, opt.op === OptOps.GROUPTOP, this.first_reduce + this.group_for_reduces)
      this.group_for_reduces += 1
    } else if (opt.op === OptOps.UNROLL) { // purple
      check(axis < this.first_upcast, "can't upcasted already upcasted")
      check(amt <= 32, "don't unroll more than 32")
      // TODO: fix upcast_count to put purples before yellows. broken because of METAL tensor cores
      //upcast_count = sum(x === y for x,y in zip(this.full_shape[-this.upcasted:], this.output_shape[-this.upcasted:])) if this.upcasted else 0
      //this.shift_to(axis, amt, insert_before=undefined if upcast_count === 0 else this.shape_len-upcast_count)
      if (this.full_shape[axis] === amt && axis === this.first_reduce) this.local_dims += 1 // first_reduce will ++, so offset loss in simplify_ones
      if (this.full_shape[axis] === amt && axis < this.first_reduce + this.group_for_reduces) this.group_for_reduces -= 1 // fully unrolling a GROUP
      this.shift_to(axis, amt, undefined, undefined)
      this.upcast()
    } else if (opt.op === OptOps.UPCAST) { // yellow
      check(axis < this.first_reduce, 'upcast is for non-reduce')
      check(!(this.tensor_core && this.global_dims <= axis && axis < this.global_dims + this.tensor_core.get_local_axes().length), "can't upcast TC locals")
      check(amt <= 16, "don't upcast more than 16")
      this.shift_to(axis, amt, undefined, undefined)
      this.upcast()
    } else if (opt.op === OptOps.NOLOCALS) {
      check(this.opts.has_local && !this.dont_use_locals, 'NOLOCALS is meaningless if target does not support local or already not using locals')
      check(this.local_dims === 0 && this.group_for_reduces === 0, "can't have no locals with locals")
      this.dont_use_locals = true
    } else if (opt.op === OptOps.SWAP) {
      check(axis < amt && amt < this.global_dims, `swap is only for globals with axis < amt, getting amt=${amt}, axis=${axis}, this.global_dims=${this.global_dims}`)
      const permute = range(this.shape_len)
      ;[permute[axis], permute[amt]] = [permute[amt], permute[axis]]
      this.reshape_and_permute(undefined, permute)
    } else if (opt.op === OptOps.PADTO) {
      check(!this.vars, 'does not work with symbolic shape')
      check(axis < this.first_upcast, 'cannot pad upcasted')
      // ok to pad SUM if all parent ALU ops have f(0) = 0
      const r = this.reduceop
      if (r !== undefined && this.first_reduce <= axis) check(r.arg[0] === Ops.ADD && can_pad(r, new Map(), new Set([])), `cannot pad ${r}`)
      let padded = false
      for (const [i, st] of this.sts.entries()) {
        const s = num(st.shape[axis])
        if (s === 1) continue // reduced
        check(s > idiv(amt, 4), `pad adds more than quadruple the work ${st.shape[axis]} > ${idiv(amt, 4)}`)
        const ru = round_up(s, amt) - s
        if (ru) {
          // pad right seems to be faster
          this.sts[i] = st.pad([...range(axis).map(() => [0, 0] as [number, number]), [0, ru], ...range(st.shape.length - axis - 1).map((x) => [0, 0] as [number, number])])
          padded = true
        }
      }
      check(padded, 'nothing was padded')
    }

    if (append_opt) this.applied_opts.push(opt)
    if (this.simplify_ones() && this.tensor_core_opts) {
      this.tensor_core_opts.fix_axes(axis) // fix up axes in TC opts if required after simplify_ones()
    }
  }
  required_optimizations = (): Kernel => {
    if (this.membufs[0].dtype instanceof ImageDType) {
      const unit_stride_axes_mul_4 = this.sts[0].unit_stride_axes(true).filter((i) => mod(this.sts[0].shape[i], 4) === 0)
      if (!unit_stride_axes_mul_4.length) throw new Error(`needs a unit stride axis in ${this.bufs[0]}`)
      if (unit_stride_axes_mul_4.every((x) => x < this.first_upcast)) this.apply_opt(new Opt(OptOps.UPCAST, unit_stride_axes_mul_4[0], 4))
    }
    return this
  }
  hand_coded_optimizations = (): Kernel => {
    this.required_optimizations()

    // should use matvec - TODO: adjust/tune based on the wide vs tall/large vs small mat
    const MV_BLOCKSIZE = vars.get_num('MV_BLOCKSIZE', 4), MV_THREADS_PER_ROW = vars.get_num('MV_THREADS_PER_ROW', 8), MV_ROWS_PER_THREAD = vars.get_num('MV_ROWS_PER_THREAD', 4)
    const mulop = this.reduceop?.src[0]
    if (
      this.opts.has_local && vars.get_num('MV', 1) !== 0 && (MV_BLOCKSIZE > 1 || MV_THREADS_PER_ROW > 1 || MV_ROWS_PER_THREAD > 1) &&
      this.reduceop !== undefined && this.reduceop.arg[0] === Ops.ADD && this.full_shape.length >= 2 && this.opts.has_shared &&
      mulop && mulop.op === Ops.MUL && mulop.src[0].op === Ops.LOAD && mulop.src[1].op === Ops.LOAD
    ) {
      const st0 = this.sts[this.bufs.indexOf(mulop.src[0])], st1 = this.sts[this.bufs.indexOf(mulop.src[1])]
      const strides0 = st0.real_strides(), strides1 = st1.real_strides()
      const has_expanded_axis = (shape: (sint | undefined)[], strides: (sint | undefined)[]) => zip(shape, strides).some(([s, st]) => (!s || resolve(gt(s, 1))) && (!st || !resolve(ne(st, 0))))
      if (strides0[this.first_reduce] === 1 && !(has_expanded_axis(st0.shape, strides0) && has_expanded_axis(st1.shape, strides1))) {
        for (const global_idx of range(this.global_dims)) {
          if (mod(this.full_shape[this.first_reduce], MV_THREADS_PER_ROW) === 0 && mod(this.full_shape[global_idx], MV_BLOCKSIZE * MV_ROWS_PER_THREAD) === 0) {
            if (vars.DEBUG >= 3) console.log(`MATVEC: ${this.full_shape} ${this.first_reduce} ${strides0} ${MV_BLOCKSIZE} ${MV_THREADS_PER_ROW} ${MV_ROWS_PER_THREAD}`)
            if (MV_THREADS_PER_ROW > 1) this.apply_opt(new Opt(OptOps.GROUP, 0, MV_THREADS_PER_ROW))
            if (MV_BLOCKSIZE > 1) this.apply_opt(new Opt(OptOps.LOCAL, global_idx, MV_BLOCKSIZE))
            if (MV_ROWS_PER_THREAD > 1) this.apply_opt(new Opt(OptOps.UPCAST, global_idx, MV_ROWS_PER_THREAD))
            return this
          }
        }
      }
    }
    if (this.opts.has_local && this.opts.has_shared && all_int(this.sts[0].shape.slice(0, this.first_reduce))) {
      // are we grouping? (requires local shape support)
      if (!this.float4_axis(0) && this.first_reduce <= 2 && this.first_reduce + 1 <= this.shape_len && num(prod(this.sts[0].shape.slice(0, this.first_reduce))) <= 2048) {
        // TODO: use 1024 if it's allowed in a smarter way
        for (const sz of (num(prod(this.sts[0].shape.slice(0, this.first_reduce))) <= 32 ? [256, 16] : [16])) {
          if (this.sts.every((st) => mod(st.shape[this.first_reduce], sz) === 0 || st.shape[this.first_reduce] === 1)) {
            try { // may fail due to excessive smem usage
              this.apply_opt(new Opt(OptOps.GROUPTOP, 0, sz))
              break
            } catch (e) {
              if (!(e instanceof KernelOptError)) throw e
            }
          }
        }
      }
    }
    // upcast float4 images
    for (const [buf_index, buf] of this.bufs.entries()) {
      const unit_stride_axes_mul_4 = this.sts[buf_index].unit_stride_axes(true).filter((i) => mod(this.sts[buf_index].shape[i], 4) === 0)
      if (buf.src[0].dtype instanceof ImageDType) {
        // assert len(unit_stride_axes_mul_4) >= 1, f"needs a unit stride axis in {this.bufs[buf_index]}"
        if (unit_stride_axes_mul_4.length && unit_stride_axes_mul_4.every((x) => x < this.first_upcast)) {
          if (unit_stride_axes_mul_4[0] < this.first_reduce) this.apply_opt(new Opt(OptOps.UPCAST, unit_stride_axes_mul_4[0], 4))
          else this.apply_opt(new Opt(OptOps.UNROLL, unit_stride_axes_mul_4[0] - this.first_reduce, 4))
        }
      }
    }

    // no more opt if we are grouping
    if (this.group_for_reduces) return this

    // **** below this line need to be optional and benchmarked ****

    // TODO: doing extra upcasts with images doesn't work for some reason (maybe has to do with to_image_idx)
    // to trigger the above bug, remove prod(this.full_shape[this.first_upcast:]) from the below
    // expression and run test/test_ops.py with IMAGE=2
    // if there are small dims with lots of valid masks, upcast them (they might be from Tensor.stack)
    // this can be made much smarter
    const to_upcast: number[] = []
    // upcast leading axes first (hack-ish for winograd; we actually want to upcast masked axes with low stride first)
    for (const axis of range(this.first_reduce)) {
      // we might want to be able to split axes that are masked, or refuse to merge them in simplify_merge_adjacent
      // for now skip upcasting here if there is a symbolic axis
      if (typeof this.full_shape[axis] === 'number' && this.full_shape[axis] <= 7 && this.sts.some((st) => st.axis_is_masked(axis)) && num(prod(this.full_shape.slice(this.first_upcast))) * num(prod(to_upcast.map((j) => this.full_shape[j]))) * this.full_shape[axis] <= 7 * 7) {
        if (vars.DEBUG >= 4) console.log(`upcasting masked axis : ${axis}`)
        to_upcast.push(axis)
      }
    }
    for (const axis of to_upcast.toReversed()) this.apply_opt(new Opt(OptOps.UPCAST, axis, 0))

    // potentially do more upcasts of non reduce axes based on a heuristic
    const upcasted_axis = new Set<number>()
    while (resolve(ge(prod(this.sts[0].shape.slice(0, this.first_reduce)), 1024))) {
      let xb_choices: [number, number, number, number][] = []
      for (const [axis, upcast_amount] of product(range(this.first_reduce), [3, 4])) { // consider all the non reduce axes, and a 3 or 4 reduce
        // if we haven't upcasted it, it's not symbolic, it mods, and buffer has stride 0 on axis while having no stride 0 in the upcasted axis already
        if (!upcasted_axis.has(axis) && isInt(this.full_shape[axis]) && mod(this.full_shape[axis], upcast_amount) === 0 && this.sts.some((st, buf_index) => st.views.at(-1)!.strides[axis] === 0 && !this.upcasted_axis(buf_index).some((x) => x[1] === 0))) {
          xb_choices.push([sum(this.sts.map((st) => st.views.at(-1)!.strides[axis]).map((x) => Number(typeof x === 'number' && x > 0))), sum(this.sts.map((st) => st.views.at(-1)!.strides[axis])) as number, axis, upcast_amount])
        }
      }
      if (xb_choices.length) {
        xb_choices = sorted(xb_choices)
        if (vars.DEBUG >= 4) console.log(`float4 merging axis : ${xb_choices}`)
        this.apply_opt(new Opt(OptOps.UPCAST, xb_choices[0][2], xb_choices[0][3]))
        upcasted_axis.add(xb_choices[0][2])
      } else break
    }
    // if last dim is small(ish) and it's a reduce dim, upcast the reduce (loop unrolling). no simplify needed since it's just an upcast.
    if (this.first_reduce < this.first_upcast && (num(prod(this.full_shape.slice(this.first_upcast))) <= 4 || !this.upcasted_axis(this.full_buf_index).some(([_, _1, r]) => r)) && (this.upcasted === 0 || num(prod(this.full_shape.slice(-this.upcasted))) < 64)) {
      const s = this.full_unupcasted_shape.at(-1)!
      if (isInt(s) && s <= 32) { // NOTE: cannot loop unroll symbolic axis
        this.apply_opt(new Opt(OptOps.UNROLL, this.full_unupcasted_shape.length - 1 - this.first_reduce, 0))
        // if it's small, upcast a second reduce dimension too
        if (this.first_reduce < this.first_upcast && s <= 3 && isInt(this.full_unupcasted_shape.at(-1)) && num(this.full_unupcasted_shape.at(-1)) <= 3) {
          this.apply_opt(new Opt(OptOps.UNROLL, this.full_unupcasted_shape.length - 1 - this.first_reduce, 0))
        }
      } else {
        for (const splits of [4]) {
          if (mod(this.full_unupcasted_shape.at(-1)!, splits) === 0) {
            this.apply_opt(new Opt(OptOps.UNROLL, this.full_unupcasted_shape.length - 1 - this.first_reduce, splits))
            break
          }
        }
      }
    }
    // if nothing at all is upcasted and it's easy to, do an upcast
    // TODO: this is breaking the tests
    for (const splits of [4]) {
      if (this.upcasted === 0 && this.full_unupcasted_shape.length && mod(this.full_unupcasted_shape.at(-1)!, splits) === 0) {
        this.apply_opt(new Opt(OptOps.UPCAST, this.full_unupcasted_shape.length - 1, splits))
      }
    }

    // **** local groups ****

    if (this.opts.has_local) {
      if (vars.get('NOLOCALS') && this.local_dims === 0 && !this.group_for_reduces) {
        this.apply_opt(new Opt(OptOps.NOLOCALS))
      } else {
        // prioritize making expand axes local
        const local_axis_ranking = range(this.full_shape.slice(0, this.first_reduce).length).map((axis) => [range(this.sts.length).some((buf_index) => this.sts[buf_index].views.at(-1)!.strides[axis] === 0), axis])
        let to_local: [number, number][] = []
        for (const [_, axis] of local_axis_ranking.toSorted((a, b) => Number(b[0]) - Number(a[0]) || Number(b[1]) - Number(a[1]))) {
          const local_size = prod(to_local.map(([_, sz]) => sz))
          const local_sz = [...(axis === 0 ? [32] : []), 16, 8, 4, 3, 2].filter((x) => mod(this.full_shape[Number(axis)], x) === 0 && local_size * x <= 128).shift() // KAREL: should be .next()
          if (local_sz !== undefined) to_local.push([Number(axis), local_sz])
        }
        let deleted_shape = 0
        for (let [axis, local_sz] of sorted(to_local.slice(0, 3))) {
          axis = axis - deleted_shape
          let will_delete_shape = local_sz === this.full_shape[axis]
          this.apply_opt(new Opt(OptOps.LOCAL, axis, local_sz))
          if (will_delete_shape) deleted_shape += 1
        }
      }
    }

    return this
  }

  // **** kernel outputs ****

  static kernel_cnt = new DefaultMap<string, number>(undefined, () => 0)
  private _name = cache((): string => {
    // kernel name (before late upcast)
    const kernel_type = this.reduceop !== undefined ? 'r' : ([...this.ast.toposort].every((x) => x.op === Ops.SINK || GroupOp.Buffer.includes(x.op)) ? 'C' : 'E')
    const suffix = zip(this.full_shape, this.colors()).map(([x, c]) => colored(x instanceof UOp ? x.render() : x.toString(), c)).join(colored('_', 'BLACK'))
    const name = kernel_type + (this.ast.src.length > 1 ? `${this.ast.src.length}` : '') + '_' + suffix

    // name the function something unique
    const function_name = to_function_name(name)
    Kernel.kernel_cnt.set(function_name, Kernel.kernel_cnt.get(function_name) + 1)
    const num = Kernel.kernel_cnt.get(function_name) > 1 ? `n${Kernel.kernel_cnt.get(function_name) - 1}` : ''
    return name + colored(num, 'BLACK')
  })
  get name() {
    return this._name()
  }
  fixup_ast = cache((op: UOp): UOp => {
    let ret = op.replace({ src: op.src.map((x) => this.fixup_ast(x)) })
    if (GroupOp.Buffer.includes(op.op) && this.bufs.includes(op)) {
      const st_uop = this.sts[this.bufs.indexOf(op)].to_uop()
      return op.op === Ops.VALID ? ret.replace({ src: [st_uop] }) : ret.replace({ src: [ret.src[0], st_uop, ...ret.src.slice(2)] })
    }
    if (op.op === Ops.SINK) return ret.replace({ arg: new KernelInfo(this.local_dims, this.upcasted, this.dont_use_locals) })
    if (op.op === Ops.REDUCE_AXIS) {
      const reduce_idx = this.bufs.length + this.reduceops.indexOf(op) * 2

      const reduced_axes = (start: number, stop: number) => range(start, stop).filter((i) => resolve(ne(this.sts[reduce_idx].shape[i], this.sts[reduce_idx + 1].shape[i])))
      const axes = reduced_axes(this.first_reduce + this.group_for_reduces, this.shape_len)
      const grouped_axes = reduced_axes(this.first_reduce, this.first_reduce + this.group_for_reduces)
      if (this.tensor_core && (this.use_tensor_cores === 1 || this.use_tensor_cores === 3)) {
        throw new NotImplemented()
      }

      ret = ret.replace({ arg: [op.arg[0], axes] })
      if (this.group_for_reduces && grouped_axes.length) {
        const local_shape = [
          ...range(this.global_dims).map(() => 1),
          ...this.full_shape.slice(this.global_dims, this.global_dims + this.local_dims),
          ...range(this.first_reduce, this.first_reduce + this.group_for_reduces).map((i) => this.sts[reduce_idx].shape[i] !== this.sts[reduce_idx + 1].shape[i] ? this.full_shape[i] : 1),
          ...range(this.shape_len - this.upcasted - this.group_for_reduces - this.first_reduce).map(() => 1),
          ...this.upcasted_axis(0).map((x) => x[0]),
        ]
        let st_uop = ShapeTracker.from_shape(local_shape).to_uop()
        const local_size = st_uop.arg.real_size()
        const local_buffer = new UOp(Ops.DEFINE_LOCAL, op.dtype.ptr(local_size, true), [], [`temp${this.reduceops.indexOf(op) + 1}`, local_size])
        const local_load = new UOp(Ops.LOAD, op.dtype, [local_buffer, st_uop, local_buffer.store([st_uop, ret])])
        const grouped_reduce = new UOp(Ops.REDUCE_AXIS, op.dtype, [local_load], [op.arg[0], grouped_axes])
        if (op === this.reduceops.at(-1)) return grouped_reduce
        st_uop = ShapeTracker.from_shape(local_shape.map((a, i) => grouped_axes.includes(i) ? 1 : a)).to_uop()
        return new UOp(Ops.LOAD, op.dtype, [local_buffer, st_uop, local_buffer.store([st_uop, grouped_reduce])])
      }
    }
    return ret
  })
  get_optimized_ast = (): UOp => {
    return graph_rewrite(this.fixup_ast(this.ast), view_left)
  }
  // **** this===the lowerer ****

  //   @track_rewrites()
  linearize = (): Kernel => {
    const modified_ast = this.get_optimized_ast()
    if (vars.DEBUG >= 3) {
      console.log(this.name)
      if (vars.get('RAWAST')) console.log(this.ast)
      console.log(modified_ast)
      console.log(this.applied_opts)
      verify_ast(modified_ast)
    }
    this.uops = linearize_uop(full_graph_rewrite(rewrite_shapetracker_with_index(modified_ast, this.opts), this.opts))
    if (vars.DEBUG >= 5) print_uops(this.uops)
    return this
  }
  to_program = (name_override?: string): ProgramSpec => {
    this.linearize()
    const ansiname = name_override !== undefined ? name_override : this.name
    const name = to_function_name(ansiname)
    const src = this.opts.render(name, this.uops!)

    if (vars.CAPTURE_PROCESS_REPLAY) {
      throw new NotImplemented()
    }

    // group non-local bufs by the op type (LOAD ||STORE) && the buffer arg. take the max access of that buffer in bytes
    // TODO: these max && min don't work on symbolic, && results are very wrong.
    const groups = new Map<[Ops, any], UOp[]>()
    for (const x of [...this.ast.toposort].filter((x) => GroupOp.Buffer.includes(x.op) && x.src[0].op === Ops.DEFINE_GLOBAL)) set_default(groups, [x.op, x.src[0].arg], []).push(x)
    const mem_bytes = [...groups.values()].flatMap((group) => Math.max(...group.map((x) => x.src[0].dtype.itemsize * x.st_arg.real_size()))).reduce((acc, x) => acc + x, 0)
    return new ProgramSpec(ansiname, src, this.opts.device, this.uops, mem_bytes, this.opts.has_local ? [1, 1, 1] : undefined, this.opts.has_local ? [1, 1, 1] : undefined)
  }
}
// the living definition of intermediate UOps

export const _assert_valid_uop = (uop: UOp, st: ShapeTracker, sts: Map<UOp, ShapeTracker>): undefined => {
  if (sts.has(uop)) return
  // restore globals from the two stage reduce
  // this is because this LOAD has an implicit movement op
  if (uop.op === Ops.LOAD && uop.src[0].op === Ops.DEFINE_LOCAL) {
    const local_reduce = uop.src[2].src[2]
    _assert_valid_uop(local_reduce, uop.st_arg, sts)
    sts.set(uop, sts.get(local_reduce)!)
    return
  }
  for (const x of uop.src) _assert_valid_uop(x, st, sts)
  // only reduceuop===allowed to change shape, limited to turning n to 1
  if ([Ops.REDUCE_AXIS, Ops.WMMA].includes(uop.op)) st = ShapeTracker.from_shape(sts.get(uop.src[0])!.reduce(uop.axis_arg))
  // movementops are pushed to VIEW
  else if (uop.op === Ops.VIEW) {
    if (uop.src.length !== 0) throw new Error(`can't swizzle in kernel yet ${uop}`)
    st = uop.arg
  } // everything else inherits shape
  else {
    const src_sts = uop.src.filter((x) => sts.has(x)).map((x) => sts.get(x)!)
    if (src_sts.length === 0) return undefined
    st = src_sts[0]
    const shapes = src_sts.map((x) => x.shape)
    if (!all_same(shapes)) {
      const sizes = shapes.map((x) => prod(x))
      if (all_same(sizes)) throw new Error(`found implicit reshape ${shapes}`)
      throw new Error(`found implicit expand ${sizes} ${shapes}`)
    }
  }
  sts.set(uop, st)
}

export const verify_ast = (ast: UOp): undefined => {
  if (ast.op !== Ops.SINK || ast.src.some((x) => x.op !== Ops.STORE)) throw new Error('must be SINK')
  if (!all_same(ast.src.map((x) => x.st_arg.size))) throw new Error('outputs must be exactly the same size')
  const sts = new Map<UOp, ShapeTracker>()
  for (const out of ast.src) _assert_valid_uop(out, out.st_arg, sts)
  const shape_dims = zip(...sts.values().map((x) => x.shape)).map((dims) => dedup(dims).toSorted())
  if (!shape_dims.every((x) => x.length === 1 || (x.length === 2 && x[0] === 1))) throw new Error(`shapes must have either 1 ||n in each dimension, ${shape_dims}`)
  type_verify([...sts.keys()])
}

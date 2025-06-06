import { env } from '../../../env/index.ts'

export type DenoFnType =
  | Deno.ToNativeParameterTypes<[Deno.NativeType]>[number]
  | void

export class Type<
  NativeValue extends DenoFnType,
  Value = NativeValue,
  SetNativeValue = NativeValue,
  SetValue = Value,
> {
  _buffer: ArrayBuffer
  constructor(
    buffer?: ArrayBuffer,
    public _offset: number = 0,
    public _byteLength: number = 0,
    public _alignment: number = 0,
  ) {
    this._buffer = buffer ?? new ArrayBuffer(this._byteLength)
  }
  get _bytes() {
    return new Uint8Array(this._buffer, this._offset, this._byteLength)
  }
  protected _get(): Value {
    throw new Error()
  }
  get get() {
    return this._get()
  }
  protected _set(val: SetValue): void {
    throw new Error()
  }
  set(val: SetValue) {
    this._set(val)
    return this
  }
  protected _native = (): NativeValue => this._get() as any
  get native(): NativeValue {
    return this._native()
  }
  protected _setNative = (val: SetNativeValue) => this._set(val as any)
  setNative(val: SetNativeValue) {
    this._setNative(val)
    return this
  }
  ptr(): Pointer<typeof this> {
    return new Pointer().setNative(env.ptr(this._buffer, this._offset))
  }
  /** Doesn't change the underlying buffer */
  loadFromPtr(ptr: Pointer<typeof this>, offset = 0): typeof this {
    if (ptr.get) {
      const buffer = env.getArrayBuffer(ptr.native, this._byteLength, offset)
      new Uint8Array(this._buffer, this._offset, this._byteLength).set(new Uint8Array(buffer))
    }
    return this
  }
  /** Changes the buffer to the pointed buffer */
  replaceWithPtr(ptr: Pointer<typeof this>, offset = 0): typeof this {
    if (ptr.get) {
      this._buffer = env.getArrayBuffer(ptr.native, this._byteLength, offset)
    }
    return this
  }
  toString = () => {
    const val = this.get
    if (typeof val === 'object') {
      return `${this.constructor.name}({ ${Object.entries(val!).map(([k, v]) => `${k}: ${v}`).join(', ')} })`
    } else return `${this.constructor.name}(${val})`
  };
  [Symbol.for('nodejs.util.inspect.custom')](_depth: number, _options: any) {
    return this.toString()
  }
}
// UINTS
export class U8 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 1, 1)
  }
  protected override _get = () => new Uint8Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Uint8Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new U8().set(val)
}

export class U16 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 2, 2)
  }
  protected override _get = () => new Uint16Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Uint16Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new U16().set(val)
}

export class U32 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 4, 4)
  }
  protected override _get = () => new Uint32Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Uint32Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new U32().set(val)
}

export class U64 extends Type<bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override _get = () => new BigUint64Array(this._buffer, this._offset)[0]
  protected override _set = (val: bigint) => new BigUint64Array(this._buffer, this._offset).set([val])
  static new = (val: bigint) => new U64().set(val)
}
export class Size extends U64 {
  static override new = (val: bigint) => new Size().set(val)
}
// INTS
export class I8 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 1, 1)
  }
  protected override _get = () => new Int8Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Int8Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new I8().set(val)
}

export class I16 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 2, 2)
  }
  protected override _get = () => new Int16Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Int16Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new I16().set(val)
}

export class I32 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 4, 4)
  }
  protected override _get = () => new Int32Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Int32Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new I32().set(val)
}

export class I64 extends Type<bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override _get = () => new BigInt64Array(this._buffer, this._offset)[0]
  protected override _set = (val: bigint) => new BigInt64Array(this._buffer, this._offset).set([val])
  static new = (val: bigint) => new I64().set(val)
}

// FLOATS
export class F32 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 4, 4)
  }
  protected override _get = () => new Float32Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Float32Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new F32().set(val)
}

export class F64 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override _get = () => new Float64Array(this._buffer, this._offset)[0]
  protected override _set = (val: number) => new Float64Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new F64().set(val)
}

// STRUCT
export class Struct<Value extends Record<string, Type<any>>> extends Type<
  ArrayBuffer,
  Value,
  Uint8Array,
  Partial<Value>
> {
  protected override _set(val: Partial<Value>) {
    for (const [k, v] of Object.entries(val)) {
      this.get[k].set((v as Type<any>).get)
    }
  }
  protected override _native = () => this._buffer
  protected override _setNative = (val: Uint8Array) => {
    if (val instanceof Uint8Array) this._buffer = val.buffer as ArrayBuffer
    else throw new Error(`Invalid input ${val}`)
  }
}

// POINTER
export class Pointer<_Value extends Type<any, any>> extends Type<Deno.PointerValue, bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override _get(): bigint {
    return new BigUint64Array(this._buffer, this._offset)[0]
  }
  protected override _set(val: bigint) {
    new BigUint64Array(this._buffer, this._offset).set([val])
  }
  protected override _native = () => env.u64ToPtr(this.get)
  protected override _setNative = (val: Deno.PointerValue) => this._buffer = new BigUint64Array([env.ptrToU64(val)]).buffer
  static new = (val: bigint = 0n) => new Pointer().set(val)
}

// VOID
export class Void extends Type<void, bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override _get(): bigint {
    return new BigUint64Array(this._buffer, this._offset)[0]
  }
  protected override _set(val: bigint) {
    new BigUint64Array(this._buffer, this._offset).set([val])
  }
  protected override _native = () => {}
  protected override _setNative = (val: void) => {}
  static new = (val: bigint = 0n) => new Void().set(val)
}

// FUNCTION
export class Function<Args extends Type<any>[]> extends Type<
  Deno.PointerValue,
  bigint,
  Deno.PointerValue,
  (...a: Args) => void
> {
  constructor(
    buffer: ArrayBuffer | undefined,
    offset: undefined | number,
    public args: Deno.NativeType[],
  ) {
    super(buffer, offset, 8, 8)
  }
  protected override _get(): bigint {
    return new BigUint64Array(this._buffer, this._offset)[0]
  }
  protected _fn = (fn: (...a: any[]) => void): (...a: any[]) => void => {
    throw new Error('Override this')
  }
  protected override _set(val: (...a: Args) => void) {
    const fn = env.callback(
      { parameters: this.args, result: 'void' },
      this._fn(val),
    )
    new BigUint64Array(this._buffer, this._offset).set([env.ptrToU64(fn)])
  }
  protected override _native = () => {
    return env.u64ToPtr(this.get)
  }
  protected override _setNative = (val: Deno.PointerValue) => {
    throw new Error("Can't set native function")
  }
}

// ARRAY
export const createArray = <T extends Type<any>>(items: T[]): T => {
  const len = items.reduce((acc, x) => acc + x._byteLength, 0)
  const arr = new Type(new ArrayBuffer(len), 0, len, len)
  let offset = 0
  for (const item of items) {
    arr._bytes.set(item._bytes, offset)
    offset += item._byteLength
  }
  return arr as T
}

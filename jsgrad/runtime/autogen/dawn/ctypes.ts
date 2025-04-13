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
  protected __value(): Value {
    throw new Error()
  }
  get _value() {
    return this.__value()
  }
  protected __set(val: SetValue): void {
    throw new Error()
  }
  _set(val: SetValue) {
    this.__set(val)
    return this
  }
  protected __native = (): NativeValue => this.__value() as any
  get _native(): NativeValue {
    return this.__native()
  }
  protected __setNative = (val: SetNativeValue) => this.__set(val as any)
  _setNative(val: SetNativeValue) {
    this.__setNative(val)
    return this
  }
  _ptr(): Pointer<typeof this> {
    return new Pointer()._setNative(env.ptr(this._buffer, this._offset))
  }
  /** Doesn't change the underlying buffer */
  _loadFromPtr(ptr: Pointer<typeof this>, offset = 0): typeof this {
    if (ptr._value) {
      const buffer = env.getArrayBuffer(ptr._native, this._byteLength, offset)
      new Uint8Array(this._buffer, this._offset, this._byteLength).set(new Uint8Array(buffer))
    }
    return this
  }
  /** Changes the buffer to the pointed buffer */
  _replaceWithPtr(ptr: Pointer<typeof this>, offset = 0): typeof this {
    if (ptr._value) {
      this._buffer = env.getArrayBuffer(ptr._native, this._byteLength, offset)
    }
    return this
  }
  toString = () => {
    const val = this._value
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
  protected override __value = () => new Uint8Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Uint8Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new U8()._set(val)
}

export class U16 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 2, 2)
  }
  protected override __value = () => new Uint16Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Uint16Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new U16()._set(val)
}

export class U32 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 4, 4)
  }
  protected override __value = () => new Uint32Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Uint32Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new U32()._set(val)
}

export class U64 extends Type<bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override __value = () => new BigUint64Array(this._buffer, this._offset)[0]
  protected override __set = (val: bigint) => new BigUint64Array(this._buffer, this._offset).set([val])
  static new = (val: bigint) => new U64()._set(val)
}
export class Size extends U64 {
  static override new = (val: bigint) => new Size()._set(val)
}
// INTS
export class I8 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 1, 1)
  }
  protected override __value = () => new Int8Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Int8Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new I8()._set(val)
}

export class I16 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 2, 2)
  }
  protected override __value = () => new Int16Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Int16Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new I16()._set(val)
}

export class I32 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 4, 4)
  }
  protected override __value = () => new Int32Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Int32Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new I32()._set(val)
}

export class I64 extends Type<bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override __value = () => new BigInt64Array(this._buffer, this._offset)[0]
  protected override __set = (val: bigint) => new BigInt64Array(this._buffer, this._offset).set([val])
  static new = (val: bigint) => new I64()._set(val)
}

// FLOATS
export class F32 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 4, 4)
  }
  protected override __value = () => new Float32Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Float32Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new F32()._set(val)
}

export class F64 extends Type<number> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override __value = () => new Float64Array(this._buffer, this._offset)[0]
  protected override __set = (val: number) => new Float64Array(this._buffer, this._offset).set([val])
  static new = (val: number) => new F64()._set(val)
}

// STRUCT
export class Struct<Value extends Record<string, Type<any>>> extends Type<
  ArrayBuffer,
  Value,
  Uint8Array,
  Partial<Value>
> {
  protected override __set(val: Partial<Value>) {
    for (const [k, v] of Object.entries(val)) {
      this._value[k]._set(v._value)
    }
  }
  protected override __native = () => this._buffer
  protected override __setNative = (val: Uint8Array) => {
    if (val instanceof Uint8Array) this._buffer = val.buffer as ArrayBuffer
    else throw new Error(`Invalid input ${val}`)
  }
}

// POINTER
export class Pointer<_Value extends Type<any, any>> extends Type<Deno.PointerValue, bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override __value(): bigint {
    return new BigUint64Array(this._buffer, this._offset)[0]
  }
  protected override __set(val: bigint) {
    new BigUint64Array(this._buffer, this._offset).set([val])
  }
  protected override __native = () => env.u64ToPtr(this._value)
  protected override __setNative = (val: Deno.PointerValue) => this._buffer = new BigUint64Array([env.ptrToU64(val)]).buffer
  static new = (val: bigint = 0n) => new Pointer()._set(val)
}

// VOID
export class Void extends Type<void, bigint> {
  constructor(buffer?: ArrayBuffer, offset?: number) {
    super(buffer, offset, 8, 8)
  }
  protected override __value(): bigint {
    return new BigUint64Array(this._buffer, this._offset)[0]
  }
  protected override __set(val: bigint) {
    new BigUint64Array(this._buffer, this._offset).set([val])
  }
  protected override __native = () => {}
  protected override __setNative = (val: void) => {}
  static new = (val: bigint = 0n) => new Void()._set(val)
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
  protected override __value(): bigint {
    return new BigUint64Array(this._buffer, this._offset)[0]
  }
  protected _fn = (fn: (...a: any[]) => void): (...a: any[]) => void => {
    throw new Error('Override this')
  }
  protected override __set(val: (...a: Args) => void) {
    const fn = env.callback(
      { parameters: this.args, result: 'void' },
      this._fn(val),
    )
    new BigUint64Array(this._buffer, this._offset).set([env.ptrToU64(fn)])
  }
  protected override __native = () => {
    return env.u64ToPtr(this._value)
  }
  protected override __setNative = (val: Deno.PointerValue) => {
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

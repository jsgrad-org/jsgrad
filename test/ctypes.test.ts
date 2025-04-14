import '@jsgrad/jsgrad/node'
import * as c from '../jsgrad/runtime/autogen/dawn/ctypes.ts'
import { expect, test } from 'vitest'

const check = (ctype: c.Type<any>, val: any, buffer: ArrayBuffer) => {
  expect(new Uint8Array(ctype._buffer)).toEqual(new Uint8Array(buffer))
  expect(ctype.get).toEqual(val)
  expect(ctype.native).toEqual(val)
}

test('Base types', () => {
  const test = <T extends c.DenoFnType>(
    type: typeof c.Type<T>,
    res: (val: number) => any,
  ) => {
    // initialize empty type
    let ctype = new type()
    let val = res(0)
    check(ctype, val[0], val.buffer)
    // set
    val = res(55)
    ctype.set(val[0])
    check(ctype, val[0], val.buffer)

    // set native
    val = res(88)
    ctype.setNative(val[0])
    check(ctype, val[0], val.buffer)
  }

  test(c.U8, (val) => new Uint8Array([val]))
  test(c.U16, (val) => new Uint16Array([val]))
  test(c.U32, (val) => new Uint32Array([val]))
  test(c.U64, (val) => new BigUint64Array([BigInt(val)]))

  test(c.I8, (val) => new Int8Array([val]))
  test(c.I16, (val) => new Int16Array([val]))
  test(c.I32, (val) => new Int32Array([val]))
  test(c.I64, (val) => new BigInt64Array([BigInt(val)]))

  test(c.F32, (val) => new Float32Array([val]))
  test(c.F64, (val) => new Float64Array([val]))
})

test('Structs', async () => {
  class Struct extends c.Struct<{
    val1: c.U8 // 0
    val2: c.U32 // 4 - 7
    val3: c.U16 // 8 - 9
    val4: c.U64 // 16 - 23
    val5: c.U8 // 24
  }> {
    constructor(buffer?: ArrayBuffer, offset?: number) {
      super(buffer, offset, 32, 8)
    }
    protected override _get = () => ({
      val1: new c.U8(this._buffer, this._offset + 0),
      val2: new c.U32(this._buffer, this._offset + 4),
      val3: new c.U16(this._buffer, this._offset + 8),
      val4: new c.U64(this._buffer, this._offset + 16),
      val5: new c.U8(this._buffer, this._offset + 24),
    })
  }
  // empty init
  let s1 = new Struct()
  expect(s1._bytes).toEqual(new Uint8Array(32))
  expect(new Uint8Array(s1.native)).toEqual(new Uint8Array(32))
  expect(s1.get.val1.get).toBe(0)

  // set individual
  s1.get.val2.set(10)
  expect(s1.get.val2.get).toBe(10)
  expect(s1._bytes[4]).toBe(10)

  // use set
  s1.set({ val3: c.U16.new(3), val5: c.U8.new(99) })
  expect(s1.get.val3.get).toBe(3)
  expect(s1.get.val5.get).toBe(99)
  expect(s1._bytes[4]).toBe(10) // didn't change
  expect(s1._bytes[8]).toBe(3)
  expect(s1._bytes[0]).toBe(0)
  expect(s1._bytes[24]).toBe(99)

  // getting pointer
  const ptr = s1.ptr()
  expect(typeof ptr.get).toBe('bigint')
  expect(typeof ptr.native).toBe('object')

  // loading from pointer
  const s2 = new Struct()
  s2.loadFromPtr(ptr)
  expect(s2.get.val2.get).toBe(10)
  expect(s2.get.val3.get).toBe(3)
  expect(s2.get.val5.get).toBe(99)

  // setting won't change the old struct
  s2.set({ val1: c.U8.new(88) })
  expect(s1.get.val1.get).toBe(0)

  // loading from pointer
  const s3 = new Struct()
  s3.replaceWithPtr(ptr)
  expect(s3.get.val2.get).toBe(10)
  expect(s3.get.val3.get).toBe(3)
  expect(s3.get.val5.get).toBe(99)

  // set will change the old struct
  s3.set({ val1: c.U8.new(33) })
  expect(s1.get.val1.get).toBe(33)

  // loading from null pointer
  const s4 = new Struct()
  s4.loadFromPtr(c.Pointer.new())
  expect(s4.get.val2.get).toBe(0)
  expect(s4.get.val3.get).toBe(0)
  expect(s4.get.val5.get).toBe(0)

  class MegaStruct extends c.Struct<{
    val1: c.U8 // 0
    val2: Struct // 8 - 39
    val3: c.U32 // 40 - 43
    val4: Struct // 48 - 79
  }> {
    constructor(buffer?: ArrayBuffer, offset?: number) {
      super(buffer, offset, 80, 8)
    }
    protected override _get() {
      return {
        val1: new c.U8(this._buffer, this._offset + 0),
        val2: new Struct(this._buffer, this._offset + 8),
        val3: new c.U32(this._buffer, this._offset + 40),
        val4: new Struct(this._buffer, this._offset + 48),
      }
    }
  }

  const m1 = new MegaStruct()
  expect(m1._bytes).toEqual(new Uint8Array(80))

  // set
  m1.set({ val2: new Struct().set({ val2: c.U32.new(3) }) })
  expect(m1.get.val2.get.val2.get).toBe(3)

  // child set
  m1.get.val2.get.val2.set(89)
  expect(m1.get.val2.get.val2.get).toBe(89)

  // replaceWithPtr won't change the value
  m1.get.val4.replaceWithPtr(m1.get.val2.ptr())
  expect(m1.get.val4._bytes).toEqual(new Uint8Array(32))

  // loadFromPtr will change the value
  m1.get.val4.loadFromPtr(m1.get.val2.ptr())
  expect(m1.get.val4._bytes).toEqual(m1.get.val2._bytes)
})

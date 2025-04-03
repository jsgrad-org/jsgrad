import { arrayConstructor, createPointer, DataType, FFITypeTag, load, open, unwrapPointer } from 'ffi-rs'

const PATH = '/usr/lib/libwebgpu_dawn.so'
const library = 'dawn'
open({ path: PATH, library })

const features = new Uint8Array(24)
features.set([0, 0, 0, 0, 0, 0, 0, 0], 0)
features.set([1, 0, 0, 0], 8)
features.set([1, 0, 0, 0, 0, 0, 0, 0], 16)

const desc = new Uint8Array(32)
desc.set([0, 0, 0, 0, 0, 0, 0, 0], 0)
desc.set(features, 8)
const instance = load({
  library,
  funcName: 'wgpuCreateInstance',
  retType: DataType.External,
  paramsType: [DataType.U8Array],
  paramsValue: [desc],
})
console.log(instance)

const opts = new Uint8Array(40)
opts.set([0, 0, 0, 0, 0, 0, 0, 0], 0)
opts.set([0, 0, 0, 0, 0, 0, 0, 0], 8)
opts.set([0, 0, 0, 0], 16)
opts.set([2, 0, 0, 0], 20)
opts.set([0, 0, 0, 0], 24)
opts.set([0, 0, 0, 0], 28)
opts.set([0, 0, 0, 0], 32)

const cb = new Uint8Array(32)
cb.set([0, 0, 0, 0, 0, 0, 0, 0], 0)
cb.set([1, 0, 0, 0], 8)
cb.set([0, 0, 0, 0, 0, 0, 0, 0], 16)
cb.set([0, 0, 0, 0, 0, 0, 0, 0], 24)

console.log([...desc], desc.length)
console.log([...opts], opts.length)
console.log([...cb], cb.length)

const cbType = {
  nextInChain: DataType.U64,
  mode: DataType.U64,
  callback: DataType.U64,
  userdata: DataType.U64,
  ffiTypeTag: DataType.StackStruct,
}
const optsPtr = createPointer({
  paramsType: [DataType.U8Array],
  paramsValue: [opts],
})
const future = load({
  library,
  funcName: 'wgpuInstanceRequestAdapterF',
  retType: DataType.U64,
  paramsType: [DataType.External, DataType.External, cbType],
  paramsValue: [instance, unwrapPointer(optsPtr)[0], { nextInChain: 0, mode: 1, callback: 0, userdata: 0 }],
})
console.log(future)

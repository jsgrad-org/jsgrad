import { createPointer, DataType, load, open, unwrapPointer } from 'ffi-rs'

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
const descPtr = createPointer({
  paramsType: [DataType.U8Array],
  paramsValue: [desc],
})
const instance = load({
  library,
  funcName: 'wgpuCreateInstance',
  retType: DataType.External,
  paramsType: [DataType.External],
  paramsValue: [unwrapPointer(descPtr)[0]],
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
const optsPtr = createPointer({
  paramsType: [DataType.U8Array],
  paramsValue: [desc],
})
const future = load({
  library,
  funcName: 'wgpuInstanceRequestAdapterF',
  retType: DataType.BigInt,
  paramsType: [DataType.External, DataType.External, DataType.U8Array],
  paramsValue: [instance, unwrapPointer(optsPtr)[0], cb],
})
console.log(future)

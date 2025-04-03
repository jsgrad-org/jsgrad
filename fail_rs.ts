import { createPointer, DataType, load, open } from 'ffi-rs'

const PATH = '/usr/lib/libwebgpu_dawn.so'
const library = 'dawn'
open({ path: PATH, library })

const Features = {
  nextInChain: DataType.U64,
  timedWaitAnyEnable: DataType.I32,
  timedWaitAnyMaxCount: DataType.U64,
  ffiTypeTag: DataType.StackStruct,
}
const Desc = {
  nextInChain: DataType.U64,
  features: Features,
  ffiTypeTag: DataType.StackStruct,
}
const desc = createPointer({
  paramsType: [Desc],
  paramsValue: [{
    nextInChain: 0,
    features: {
      nextInChain: 0,
      timedWaitAnyEnable: 1,
      timedWaitAnyMaxCount: 1,
    },
  }],
})[0]

const instance = load({
  library,
  funcName: 'wgpuCreateInstance',
  retType: DataType.External,
  paramsType: [DataType.External],
  paramsValue: [desc],
})
console.log(instance)

const Opts = {
  nextInChain: DataType.U64,
  compatibleSurface: DataType.U64,
  featureLevel: DataType.I32,
  powerPreference: DataType.I32,
  backendType: DataType.I32,
  forceFallbackAdapter: DataType.I32,
  compatibilityMode: DataType.I32,
  ffiTypeTag: DataType.StackStruct,
}
const opts = createPointer({
  paramsType: [Opts],
  paramsValue: [{
    nextInChain: 0,
    compatibleSurface: 0,
    featureLevel: 0,
    powerPreference: 2,
    backendType: 0,
    forceFallbackAdapter: 0,
    compatibilityMode: 0,
  }],
})[0]
const Cb = {
  nextInChain: DataType.U64,
  mode: DataType.U64,
  callback: DataType.U64,
  userdata: DataType.U64,
  ffiTypeTag: DataType.StackStruct,
}
console.log(instance, opts)
const future = load({
  library,
  funcName: 'wgpuInstanceRequestAdapterF',
  retType: DataType.U64,
  paramsType: [DataType.External, DataType.External, Cb],
  paramsValue: [instance, opts, { nextInChain: 0, mode: 0, callback: 0, userdata: 0 }],
})
console.log(future)

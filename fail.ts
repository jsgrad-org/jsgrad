import { env } from './jsgrad/node.ts'
// import * as c from './dawn/bindings.ts'

const FILE = env.OSX ? 'libwebgpu_dawn.dylib' : 'libwebgpu_dawn.so'
const PATH = `${env.CACHE_DIR}/${FILE}`

// await c.init(PATH)
// const desc = new c.InstanceDescriptor()
// desc.$features.$timedWaitAnyEnable.set(1)
// const instance = c.createInstance(desc.ptr())

// const cb = new c.RequestAdapterCallbackInfo()
// cb.$mode.set(c.CallbackMode.WaitAnyOnly.value)
// const promise = new Promise<any>((resolve) => cb.$callback.set((...args) => resolve(args)))
// const opts = c.RequestAdapterOptions.new({ powerPreference: c.PowerPreference.HighPerformance })
// const future = c.instanceRequestAdapterF(instance, opts.ptr(), cb)
// console.log('fails before this', future)
// console.log(await promise)

const lib = Deno.dlopen(PATH, {
  wgpuCreateInstance: { parameters: ['pointer'], result: 'pointer' },
  wgpuInstanceRequestAdapterF: { parameters: ['pointer', 'pointer', 'buffer'], result: 'buffer' },
})
const desc = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const instance = lib.symbols.wgpuCreateInstance(Deno.UnsafePointer.of(desc))
console.log(Deno.UnsafePointer.value(instance))
const opts = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const cb = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const future = lib.symbols.wgpuInstanceRequestAdapterF(instance, Deno.UnsafePointer.of(opts), cb)
console.log(future)

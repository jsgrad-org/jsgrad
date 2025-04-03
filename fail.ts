import { env } from './jsgrad/node.ts'
import * as c from './dawn/bindings.ts'

const FILE = env.OSX ? 'libwebgpu_dawn.dylib' : 'libwebgpu_dawn.so'
const PATH = `${env.CACHE_DIR}/${FILE}`

await c.init(PATH)

const desc = new c.InstanceDescriptor()
desc.$features.$timedWaitAnyEnable.set(1)

const instance = c.createInstance(desc.ptr())
if (!instance.value) throw new Error(`Failed creating instance!`)

const _wait = (future: c.Future) => {
  const res = c.instanceWaitAny(instance, c.Size.new(1n), c.FutureWaitInfo.new({ future }).ptr(), c.U64.new(2n ** 64n - 1n))
  if (res.value !== c.WaitStatus.Success.value) throw new Error('Future failed')
}
const from_wgpu_str = (_str: c.StringView): string => {
  if (_str.$length.value <= 1) return ''
  const buf = env.getArrayBuffer(_str.$data.native, Number(_str.$length.value))
  return new TextDecoder().decode(buf)
}
type CallBack = typeof c.BufferMapCallbackInfo2 | typeof c.PopErrorScopeCallbackInfo | typeof c.CreateComputePipelineAsyncCallbackInfo2 | typeof c.RequestAdapterCallbackInfo | typeof c.RequestDeviceCallbackInfo | typeof c.QueueWorkDoneCallbackInfo2
const _run = async <T extends CallBack>(cb_class: T, async_fn: (cb: InstanceType<T>) => c.Future): Promise<Parameters<Parameters<InstanceType<T>['$callback']['set']>[0]>> => {
  return await new Promise((resolve) => {
    const cb = new cb_class()
    cb.$mode.set(c.CallbackMode.WaitAnyOnly.value)
    cb.$callback.set((...args) => resolve(args as any))
    _wait(async_fn(cb as any))
  })
}
const [status, adapter, msg] = await _run(c.RequestAdapterCallbackInfo, (cb) => c.instanceRequestAdapterF(instance, c.RequestAdapterOptions.new({ powerPreference: c.PowerPreference.HighPerformance }).ptr(), cb))
if (status.value !== c.RequestAdapterStatus.Success.value) throw new Error(`Error requesting adapter: ${status} ${from_wgpu_str(msg)}`)

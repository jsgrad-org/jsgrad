import '@webgpu/types'
import { env } from '../../../env'
import * as c from './bindings.ts'

// ----------------------------------------------- Helpers -----------------------------------------------
const _wait = (future: c.Future) => {
  const res = c.instanceWaitAny(instance, c.Size.new(1n), c.FutureWaitInfo.new({ future })._ptr(), c.U64.new(2n ** 64n - 1n))
  if (res._value !== c.WaitStatus.Success._value) throw new Error('Future failed')
}
const from_wgpu_str = (_str: c.StringView): string => {
  if (_str.$length._value <= 1) return ''
  const buf = env.getArrayBuffer(_str.$data._native, Number(_str.$length._value))
  return new TextDecoder().decode(buf)
}
const to_wgpu_str = (str: string) => {
  const data = new TextEncoder().encode(str)
  const _str = new c.Type(data.buffer as ArrayBuffer, 0, data.length, 8)
  return c.StringView.new({ data: _str._ptr(), length: c.Size.new(BigInt(_str._byteLength)) })
}

const write_buffer = (device: c.Device, buf: c.Buffer, offset: number, src: Uint8Array) => {
  c.queueWriteBuffer(c.deviceGetQueue(device), buf, c.U64.new(BigInt(offset)), new c.Pointer()._setNative(env.ptr(src.buffer as ArrayBuffer)), c.Size.new(BigInt(src.length)))
}

type ReplaceStringView<T extends any[]> = { [K in keyof T]: T[K] extends c.StringView ? string : T[K] }
type CallBack = typeof c.BufferMapCallbackInfo2 | typeof c.PopErrorScopeCallbackInfo | typeof c.CreateComputePipelineAsyncCallbackInfo2 | typeof c.RequestAdapterCallbackInfo | typeof c.RequestDeviceCallbackInfo | typeof c.QueueWorkDoneCallbackInfo2
const _run = async <T extends CallBack>(cb_class: T, async_fn: (cb: InstanceType<T>) => c.Future): Promise<ReplaceStringView<Parameters<Parameters<InstanceType<T>['$callback']['_set']>[0]>>> => {
  return await new Promise((resolve) => {
    const cb = new cb_class()
    cb.$mode._set(c.CallbackMode.WaitAnyOnly._value)
    cb.$callback._set((...args) => {
      for (let i = 0; i < args.length; i++) {
        args[i] = args[i] instanceof c.StringView ? from_wgpu_str(args[i] as any) : args[i]
      }
      resolve(args as any)
    })
    _wait(async_fn(cb as any))
  })
}

// ----------------------------------------------- Adapter -----------------------------------------------
export const FeatureName = new Map<c.FeatureName, string>([
  [c.FeatureName.DepthClipControl, 'depth-clip-control'],
  [c.FeatureName.Depth32FloatStencil8, 'depth32float-stencil8'],
  [c.FeatureName.TimestampQuery, 'timestamp-query'],
  [c.FeatureName.TextureCompressionBC, 'texture-compression-bc'],
  [c.FeatureName.TextureCompressionETC2, 'texture-compression-etc2'],
  [c.FeatureName.TextureCompressionASTC, 'texture-compression-astc'],
  [c.FeatureName.IndirectFirstInstance, 'indirect-first-instance'],
  [c.FeatureName.ShaderF16, 'shader-f16'],
  [c.FeatureName.RG11B10UfloatRenderable, 'rg11b10ufloat-renderable'],
  [c.FeatureName.BGRA8UnormStorage, 'bgra8unorm-storage'],
  [c.FeatureName.Float32Filterable, 'float32-filterable'],
  [c.FeatureName.Float32Blendable, 'float32-blendable'],
  [c.FeatureName.Subgroups, 'subgroups'],
  [c.FeatureName.SubgroupsF16, 'subgroups-f16'],
  [c.FeatureName.DawnInternalUsages, 'dawn-internal-usages'],
  [c.FeatureName.DawnMultiPlanarFormats, 'dawn-multi-planar-formats'],
  [c.FeatureName.DawnNative, 'dawn-native'],
  [c.FeatureName.ChromiumExperimentalTimestampQueryInsidePasses, 'chromium-experimental-timestamp-query-inside-passes'],
  [c.FeatureName.ImplicitDeviceSynchronization, 'implicit-device-synchronization'],
  [c.FeatureName.ChromiumExperimentalImmediateData, 'chromium-experimental-immediate-data'],
  [c.FeatureName.TransientAttachments, 'transient-attachments'],
  [c.FeatureName.MSAARenderToSingleSampled, 'msaa-render-to-single-sampled'],
  [c.FeatureName.DualSourceBlending, 'dual-source-blending'],
  [c.FeatureName.D3D11MultithreadProtected, 'd3d11-multithread-protected'],
  [c.FeatureName.ANGLETextureSharing, 'angle-texture-sharing'],
  [c.FeatureName.PixelLocalStorageCoherent, 'pixel-local-storage-coherent'],
  [c.FeatureName.PixelLocalStorageNonCoherent, 'pixel-local-storage-non-coherent'],
  [c.FeatureName.Unorm16TextureFormats, 'unorm16-texture-formats'],
  [c.FeatureName.Snorm16TextureFormats, 'snorm16-texture-formats'],
  [c.FeatureName.MultiPlanarFormatExtendedUsages, 'multi-planar-format-extended-usages'],
  [c.FeatureName.MultiPlanarFormatP010, 'multi-planar-format-p010'],
  [c.FeatureName.HostMappedPointer, 'host-mapped-pointer'],
  [c.FeatureName.MultiPlanarRenderTargets, 'multi-planar-render-targets'],
  [c.FeatureName.MultiPlanarFormatNv12a, 'multi-planar-format-nv12a'],
  [c.FeatureName.FramebufferFetch, 'framebuffer-fetch'],
  [c.FeatureName.BufferMapExtendedUsages, 'buffer-map-extended-usages'],
  [c.FeatureName.AdapterPropertiesMemoryHeaps, 'adapter-properties-memory-heaps'],
  [c.FeatureName.AdapterPropertiesD3D, 'adapter-properties-d3d'],
  [c.FeatureName.AdapterPropertiesVk, 'adapter-properties-vk'],
  [c.FeatureName.R8UnormStorage, 'r8unorm-storage'],
  [c.FeatureName.FormatCapabilities, 'format-capabilities'],
  [c.FeatureName.DrmFormatCapabilities, 'drm-format-capabilities'],
  [c.FeatureName.Norm16TextureFormats, 'norm16-texture-formats'],
  [c.FeatureName.MultiPlanarFormatNv16, 'multi-planar-format-nv16'],
  [c.FeatureName.MultiPlanarFormatNv24, 'multi-planar-format-nv24'],
  [c.FeatureName.MultiPlanarFormatP210, 'multi-planar-format-p210'],
  [c.FeatureName.MultiPlanarFormatP410, 'multi-planar-format-p410'],
  [c.FeatureName.SharedTextureMemoryVkDedicatedAllocation, 'shared-texture-memory-vk-dedicated-allocation'],
  [c.FeatureName.SharedTextureMemoryAHardwareBuffer, 'shared-texture-memory-a-hardware-buffer'],
  [c.FeatureName.SharedTextureMemoryDmaBuf, 'shared-texture-memory-dma-buf'],
  [c.FeatureName.SharedTextureMemoryOpaqueFD, 'shared-texture-memory-opaque-fd'],
  [c.FeatureName.SharedTextureMemoryZirconHandle, 'shared-texture-memory-zircon-handle'],
  [c.FeatureName.SharedTextureMemoryDXGISharedHandle, 'shared-texture-memory-dxgi-shared-handle'],
  [c.FeatureName.SharedTextureMemoryD3D11Texture2D, 'shared-texture-memory-d3d11-texture2d'],
  [c.FeatureName.SharedTextureMemoryIOSurface, 'shared-texture-memory-iosurface'],
  [c.FeatureName.SharedTextureMemoryEGLImage, 'shared-texture-memory-egl-image'],
  [c.FeatureName.SharedFenceVkSemaphoreOpaqueFD, 'shared-fence-vk-semaphore-opaque-fd'],
  [c.FeatureName.SharedFenceSyncFD, 'shared-fence-sync-fd'],
  [c.FeatureName.SharedFenceVkSemaphoreZirconHandle, 'shared-fence-vk-semaphore-zircon-handle'],
  [c.FeatureName.SharedFenceDXGISharedHandle, 'shared-fence-dxgi-shared-handle'],
  [c.FeatureName.SharedFenceMTLSharedEvent, 'shared-fence-mtl-shared-event'],
  [c.FeatureName.SharedBufferMemoryD3D12Resource, 'shared-buffer-memory-d3d12-resource'],
  [c.FeatureName.StaticSamplers, 'static-samplers'],
  [c.FeatureName.YCbCrVulkanSamplers, 'ycbcr-vulkan-samplers'],
  [c.FeatureName.ShaderModuleCompilationOptions, 'shader-module-compilation-options'],
  [c.FeatureName.DawnLoadResolveTexture, 'dawn-load-resolve-texture'],
  [c.FeatureName.DawnPartialLoadResolveTexture, 'dawn-partial-load-resolve-texture'],
  [c.FeatureName.MultiDrawIndirect, 'multi-draw-indirect'],
  [c.FeatureName.ClipDistances, 'clip-distances'],
  [c.FeatureName.DawnTexelCopyBufferRowAlignment, 'dawn-texel-copy-buffer-row-alignment'],
  [c.FeatureName.FlexibleTextureViews, 'flexible-texture-views'],
  [c.FeatureName.Force32, 'force32'],
])

class SupportedLimits implements GPUSupportedLimits {
  constructor(private _supportedLimits: c.SupportedLimits) {}
  __brand = 'GPUSupportedLimits' as const
  get maxTextureDimension1D() { return this._supportedLimits.$limits.$maxTextureDimension1D._value }
  get maxTextureDimension2D() { return this._supportedLimits.$limits.$maxTextureDimension2D._value }
  get maxTextureDimension3D() { return this._supportedLimits.$limits.$maxTextureDimension3D._value }
  get maxTextureArrayLayers() { return this._supportedLimits.$limits.$maxTextureArrayLayers._value }
  get maxBindGroups() { return this._supportedLimits.$limits.$maxBindGroups._value }
  get maxBindGroupsPlusVertexBuffers() { return this._supportedLimits.$limits.$maxBindGroupsPlusVertexBuffers._value }
  get maxBindingsPerBindGroup() { return this._supportedLimits.$limits.$maxBindingsPerBindGroup._value }
  get maxDynamicUniformBuffersPerPipelineLayout() { return this._supportedLimits.$limits.$maxDynamicUniformBuffersPerPipelineLayout._value }
  get maxDynamicStorageBuffersPerPipelineLayout() { return this._supportedLimits.$limits.$maxDynamicStorageBuffersPerPipelineLayout._value }
  get maxSampledTexturesPerShaderStage() { return this._supportedLimits.$limits.$maxSampledTexturesPerShaderStage._value }
  get maxSamplersPerShaderStage() { return this._supportedLimits.$limits.$maxSamplersPerShaderStage._value }
  get maxStorageBuffersPerShaderStage() { return this._supportedLimits.$limits.$maxStorageBuffersPerShaderStage._value }
  get maxStorageTexturesPerShaderStage() { return this._supportedLimits.$limits.$maxStorageTexturesPerShaderStage._value }
  get maxUniformBuffersPerShaderStage() { return this._supportedLimits.$limits.$maxUniformBuffersPerShaderStage._value }
  get maxUniformBufferBindingSize() { return Number(this._supportedLimits.$limits.$maxUniformBufferBindingSize._value) }
  get maxStorageBufferBindingSize() { return Number(this._supportedLimits.$limits.$maxStorageBufferBindingSize._value) }
  get minUniformBufferOffsetAlignment() { return this._supportedLimits.$limits.$minUniformBufferOffsetAlignment._value }
  get minStorageBufferOffsetAlignment() { return this._supportedLimits.$limits.$minStorageBufferOffsetAlignment._value }
  get maxVertexBuffers() { return this._supportedLimits.$limits.$maxVertexBuffers._value }
  get maxBufferSize() { return Number(this._supportedLimits.$limits.$maxBufferSize._value) }
  get maxVertexAttributes() { return this._supportedLimits.$limits.$maxVertexAttributes._value }
  get maxVertexBufferArrayStride() { return this._supportedLimits.$limits.$maxVertexBufferArrayStride._value }
  get maxInterStageShaderComponents() { return this._supportedLimits.$limits.$maxInterStageShaderComponents._value }
  get maxInterStageShaderVariables() { return this._supportedLimits.$limits.$maxInterStageShaderVariables._value }
  get maxColorAttachments() { return this._supportedLimits.$limits.$maxColorAttachments._value }
  get maxColorAttachmentBytesPerSample() { return this._supportedLimits.$limits.$maxColorAttachmentBytesPerSample._value }
  get maxComputeWorkgroupStorageSize() { return this._supportedLimits.$limits.$maxComputeWorkgroupStorageSize._value }
  get maxComputeInvocationsPerWorkgroup() { return this._supportedLimits.$limits.$maxComputeInvocationsPerWorkgroup._value }
  get maxComputeWorkgroupSizeX() { return this._supportedLimits.$limits.$maxComputeWorkgroupSizeX._value }
  get maxComputeWorkgroupSizeY() { return this._supportedLimits.$limits.$maxComputeWorkgroupSizeY._value }
  get maxComputeWorkgroupSizeZ() { return this._supportedLimits.$limits.$maxComputeWorkgroupSizeZ._value }
  get maxComputeWorkgroupsPerDimension() { return this._supportedLimits.$limits.$maxComputeWorkgroupsPerDimension._value }
  get maxStorageBuffersInVertexStage() { return this._supportedLimits.$limits.$maxStorageBuffersInVertexStage._value }
  get maxStorageTexturesInVertexStage() { return this._supportedLimits.$limits.$maxStorageTexturesInVertexStage._value }
  get maxStorageBuffersInFragmentStage() { return this._supportedLimits.$limits.$maxStorageBuffersInFragmentStage._value }
  get maxStorageTexturesInFragmentStage() { return this._supportedLimits.$limits.$maxStorageTexturesInFragmentStage._value }
}

class Adapter implements GPUAdapter {
  constructor(private _adapter: c.Adapter) {}
  __brand = 'GPUAdapter' as const
  get info(): GPUAdapterInfo {
    throw new Error()
  }
  get features(): GPUSupportedFeatures {
    const supported_features = new c.SupportedFeatures()
    c.adapterGetFeatures(this._adapter, supported_features._ptr())
    supported_features.$features
    const features = new Set<string>()
    for (let i = 0n; i < supported_features.$featureCount._value; i++) {
      features.add(FeatureName.get(new c.FeatureName()._loadFromPtr(c.Pointer.new(supported_features.$features._value + i)))!)
    }
    return features
  }
  get limits(): GPUSupportedLimits {
    const supported_limits = new c.SupportedLimits()
    c.adapterGetLimits(this._adapter, supported_limits._ptr())
    return new SupportedLimits(supported_limits)
  }
  async requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice> {
    // TODO
    const dev_desc = c.DeviceDescriptor.new({ 
    })
    const [dev_status, device, dev_msg] = await _run(c.RequestDeviceCallbackInfo, (cb) => c.adapterRequestDeviceF(this._adapter, dev_desc._ptr(), cb))
    if (dev_status._value !== c.RequestDeviceStatus.Success._value) throw new Error(`Failed to request device: ${dev_status}] ${dev_msg}`)
    return new Device(device)
  }
}

let instance: c.Instance

const PowerPreference =new Map<GPUPowerPreference|undefined, c.PowerPreference>([
  ["high-performance",c.PowerPreference.HighPerformance],
  ["low-power",c.PowerPreference.LowPower],
  [undefined,c.PowerPreference.Undefined]
])
const FeatureLevel =new Map<string|undefined, c.FeatureLevel>([
  ["compatibility",c.FeatureLevel.Compatibility],
  ["core",c.FeatureLevel.Core],
  [undefined,c.FeatureLevel.Undefined],
])
export const requestAdapter = async (options?: GPURequestAdapterOptions): Promise<Adapter | null> => {
  const FILE = env.OSX ? 'libwebgpu_dawn.dylib' : 'libwebgpu_dawn.so'
  const URL = `https://github.com/wpmed92/pydawn/releases/download/v0.1.6/${FILE}`
  const PATH = `${env.CACHE_DIR}/${FILE}`

  await env.fetchSave(URL, PATH)
  await c.init(PATH)

  const desc = new c.InstanceDescriptor()
  desc.$features.$timedWaitAnyEnable._set(1)
  instance = c.createInstance(desc._ptr())
  if (!instance._value) throw new Error(`Failed creating instance!`)

  const opts = c.RequestAdapterOptions.new({
      powerPreference: PowerPreference.get(options?.powerPreference),
      featureLevel:FeatureLevel.get(options?.featureLevel),
      forceFallbackAdapter:c.Bool.new(Number(options?.forceFallbackAdapter ?? 0))
  })
  const [status, adapter, msg] = await _run(c.RequestAdapterCallbackInfo, (cb) => c.instanceRequestAdapterF(instance, opts._ptr(), cb))
  if (status._value !== c.RequestAdapterStatus.Success._value) throw new Error(`Error requesting adapter: ${status} ${msg}`)
  return new Adapter(adapter)
}

// ----------------------------------------------- Device -----------------------------------------------
class Device implements GPUDevice{
  constructor(private _device: c.Device){}
}
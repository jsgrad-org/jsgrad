import { env } from '../../../env/index.ts'
import * as c from './bindings.ts'

// ----------------------------------------------- Helpers -----------------------------------------------
const _wait = (future: c.Future) => {
  const res = c.instanceWaitAny(instance, c.Size.new(1n), c.FutureWaitInfo.new({ future })._ptr(), c.U64.new(2n ** 64n - 1n))
  if (res._value !== c.WaitStatus.Success._value) throw new Error('Future failed')
}
const from_wgpu_str = (_str: c.StringView): string => {
  if (_str.length <= 1) return ''
  const buf = env.getArrayBuffer(_str.$data._native, Number(_str.length))
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
    cb.mode = c.CallbackMode.WaitAnyOnly._value
    cb.callback = (...args: any[]) => {
      for (let i = 0; i < args.length; i++) {
        args[i] = args[i] instanceof c.StringView ? from_wgpu_str(args[i] as any) : args[i]
      }
      resolve(args as any)
    }
    _wait(async_fn(cb as any))
  })
}

// ----------------------------------------------- Adapter -----------------------------------------------
export const FeatureName = new Map<string, c.FeatureName>([
  ['depth-clip-control', c.FeatureName.DepthClipControl],
  ['depth32float-stencil8', c.FeatureName.Depth32FloatStencil8],
  ['timestamp-query', c.FeatureName.TimestampQuery],
  ['texture-compression-bc', c.FeatureName.TextureCompressionBC],
  ['texture-compression-etc2', c.FeatureName.TextureCompressionETC2],
  ['texture-compression-astc', c.FeatureName.TextureCompressionASTC],
  ['indirect-first-instance', c.FeatureName.IndirectFirstInstance],
  ['shader-f16', c.FeatureName.ShaderF16],
  ['rg11b10ufloat-renderable', c.FeatureName.RG11B10UfloatRenderable],
  ['bgra8unorm-storage', c.FeatureName.BGRA8UnormStorage],
  ['float32-filterable', c.FeatureName.Float32Filterable],
  ['float32-blendable', c.FeatureName.Float32Blendable],
  ['subgroups', c.FeatureName.Subgroups],
  ['subgroups-f16', c.FeatureName.SubgroupsF16],
  ['dawn-internal-usages', c.FeatureName.DawnInternalUsages],
  ['dawn-multi-planar-formats', c.FeatureName.DawnMultiPlanarFormats],
  ['dawn-native', c.FeatureName.DawnNative],
  ['chromium-experimental-timestamp-query-inside-passes', c.FeatureName.ChromiumExperimentalTimestampQueryInsidePasses],
  ['implicit-device-synchronization', c.FeatureName.ImplicitDeviceSynchronization],
  ['chromium-experimental-immediate-data', c.FeatureName.ChromiumExperimentalImmediateData],
  ['transient-attachments', c.FeatureName.TransientAttachments],
  ['msaa-render-to-single-sampled', c.FeatureName.MSAARenderToSingleSampled],
  ['dual-source-blending', c.FeatureName.DualSourceBlending],
  ['d3d11-multithread-protected', c.FeatureName.D3D11MultithreadProtected],
  ['angle-texture-sharing', c.FeatureName.ANGLETextureSharing],
  ['pixel-local-storage-coherent', c.FeatureName.PixelLocalStorageCoherent],
  ['pixel-local-storage-non-coherent', c.FeatureName.PixelLocalStorageNonCoherent],
  ['unorm16-texture-formats', c.FeatureName.Unorm16TextureFormats],
  ['snorm16-texture-formats', c.FeatureName.Snorm16TextureFormats],
  ['multi-planar-format-extended-usages', c.FeatureName.MultiPlanarFormatExtendedUsages],
  ['multi-planar-format-p010', c.FeatureName.MultiPlanarFormatP010],
  ['host-mapped-pointer', c.FeatureName.HostMappedPointer],
  ['multi-planar-render-targets', c.FeatureName.MultiPlanarRenderTargets],
  ['multi-planar-format-nv12a', c.FeatureName.MultiPlanarFormatNv12a],
  ['framebuffer-fetch', c.FeatureName.FramebufferFetch],
  ['buffer-map-extended-usages', c.FeatureName.BufferMapExtendedUsages],
  ['adapter-properties-memory-heaps', c.FeatureName.AdapterPropertiesMemoryHeaps],
  ['adapter-properties-d3d', c.FeatureName.AdapterPropertiesD3D],
  ['adapter-properties-vk', c.FeatureName.AdapterPropertiesVk],
  ['r8unorm-storage', c.FeatureName.R8UnormStorage],
  ['format-capabilities', c.FeatureName.FormatCapabilities],
  ['drm-format-capabilities', c.FeatureName.DrmFormatCapabilities],
  ['norm16-texture-formats', c.FeatureName.Norm16TextureFormats],
  ['multi-planar-format-nv16', c.FeatureName.MultiPlanarFormatNv16],
  ['multi-planar-format-nv24', c.FeatureName.MultiPlanarFormatNv24],
  ['multi-planar-format-p210', c.FeatureName.MultiPlanarFormatP210],
  ['multi-planar-format-p410', c.FeatureName.MultiPlanarFormatP410],
  ['shared-texture-memory-vk-dedicated-allocation', c.FeatureName.SharedTextureMemoryVkDedicatedAllocation],
  ['shared-texture-memory-a-hardware-buffer', c.FeatureName.SharedTextureMemoryAHardwareBuffer],
  ['shared-texture-memory-dma-buf', c.FeatureName.SharedTextureMemoryDmaBuf],
  ['shared-texture-memory-opaque-fd', c.FeatureName.SharedTextureMemoryOpaqueFD],
  ['shared-texture-memory-zircon-handle', c.FeatureName.SharedTextureMemoryZirconHandle],
  ['shared-texture-memory-dxgi-shared-handle', c.FeatureName.SharedTextureMemoryDXGISharedHandle],
  ['shared-texture-memory-d3d11-texture2d', c.FeatureName.SharedTextureMemoryD3D11Texture2D],
  ['shared-texture-memory-iosurface', c.FeatureName.SharedTextureMemoryIOSurface],
  ['shared-texture-memory-egl-image', c.FeatureName.SharedTextureMemoryEGLImage],
  ['shared-fence-vk-semaphore-opaque-fd', c.FeatureName.SharedFenceVkSemaphoreOpaqueFD],
  ['shared-fence-sync-fd', c.FeatureName.SharedFenceSyncFD],
  ['shared-fence-vk-semaphore-zircon-handle', c.FeatureName.SharedFenceVkSemaphoreZirconHandle],
  ['shared-fence-dxgi-shared-handle', c.FeatureName.SharedFenceDXGISharedHandle],
  ['shared-fence-mtl-shared-event', c.FeatureName.SharedFenceMTLSharedEvent],
  ['shared-buffer-memory-d3d12-resource', c.FeatureName.SharedBufferMemoryD3D12Resource],
  ['static-samplers', c.FeatureName.StaticSamplers],
  ['ycbcr-vulkan-samplers', c.FeatureName.YCbCrVulkanSamplers],
  ['shader-module-compilation-options', c.FeatureName.ShaderModuleCompilationOptions],
  ['dawn-load-resolve-texture', c.FeatureName.DawnLoadResolveTexture],
  ['dawn-partial-load-resolve-texture', c.FeatureName.DawnPartialLoadResolveTexture],
  ['multi-draw-indirect', c.FeatureName.MultiDrawIndirect],
  ['clip-distances', c.FeatureName.ClipDistances],
  ['dawn-texel-copy-buffer-row-alignment', c.FeatureName.DawnTexelCopyBufferRowAlignment],
  ['flexible-texture-views', c.FeatureName.FlexibleTextureViews],
  ['force32', c.FeatureName.Force32],
])

class SupportedLimits implements GPUSupportedLimits {
  constructor(private _supportedLimits: c.SupportedLimits) {}
  __brand = 'GPUSupportedLimits' as const
  get maxTextureDimension1D() { return this._supportedLimits.$limits.maxTextureDimension1D }
  get maxTextureDimension2D() { return this._supportedLimits.$limits.maxTextureDimension2D }
  get maxTextureDimension3D() { return this._supportedLimits.$limits.maxTextureDimension3D }
  get maxTextureArrayLayers() { return this._supportedLimits.$limits.maxTextureArrayLayers }
  get maxBindGroups() { return this._supportedLimits.$limits.maxBindGroups }
  get maxBindGroupsPlusVertexBuffers() { return this._supportedLimits.$limits.maxBindGroupsPlusVertexBuffers }
  get maxBindingsPerBindGroup() { return this._supportedLimits.$limits.maxBindingsPerBindGroup }
  get maxDynamicUniformBuffersPerPipelineLayout() { return this._supportedLimits.$limits.maxDynamicUniformBuffersPerPipelineLayout }
  get maxDynamicStorageBuffersPerPipelineLayout() { return this._supportedLimits.$limits.maxDynamicStorageBuffersPerPipelineLayout }
  get maxSampledTexturesPerShaderStage() { return this._supportedLimits.$limits.maxSampledTexturesPerShaderStage }
  get maxSamplersPerShaderStage() { return this._supportedLimits.$limits.maxSamplersPerShaderStage }
  get maxStorageBuffersPerShaderStage() { return this._supportedLimits.$limits.maxStorageBuffersPerShaderStage }
  get maxStorageTexturesPerShaderStage() { return this._supportedLimits.$limits.maxStorageTexturesPerShaderStage }
  get maxUniformBuffersPerShaderStage() { return this._supportedLimits.$limits.maxUniformBuffersPerShaderStage }
  get maxUniformBufferBindingSize() { return Number(this._supportedLimits.$limits.maxUniformBufferBindingSize) }
  get maxStorageBufferBindingSize() { return Number(this._supportedLimits.$limits.maxStorageBufferBindingSize) }
  get minUniformBufferOffsetAlignment() { return this._supportedLimits.$limits.minUniformBufferOffsetAlignment }
  get minStorageBufferOffsetAlignment() { return this._supportedLimits.$limits.minStorageBufferOffsetAlignment }
  get maxVertexBuffers() { return this._supportedLimits.$limits.maxVertexBuffers }
  get maxBufferSize() { return Number(this._supportedLimits.$limits.maxBufferSize) }
  get maxVertexAttributes() { return this._supportedLimits.$limits.maxVertexAttributes }
  get maxVertexBufferArrayStride() { return this._supportedLimits.$limits.maxVertexBufferArrayStride }
  get maxInterStageShaderComponents() { return this._supportedLimits.$limits.maxInterStageShaderComponents }
  get maxInterStageShaderVariables() { return this._supportedLimits.$limits.maxInterStageShaderVariables }
  get maxColorAttachments() { return this._supportedLimits.$limits.maxColorAttachments }
  get maxColorAttachmentBytesPerSample() { return this._supportedLimits.$limits.maxColorAttachmentBytesPerSample }
  get maxComputeWorkgroupStorageSize() { return this._supportedLimits.$limits.maxComputeWorkgroupStorageSize }
  get maxComputeInvocationsPerWorkgroup() { return this._supportedLimits.$limits.maxComputeInvocationsPerWorkgroup }
  get maxComputeWorkgroupSizeX() { return this._supportedLimits.$limits.maxComputeWorkgroupSizeX }
  get maxComputeWorkgroupSizeY() { return this._supportedLimits.$limits.maxComputeWorkgroupSizeY }
  get maxComputeWorkgroupSizeZ() { return this._supportedLimits.$limits.maxComputeWorkgroupSizeZ }
  get maxComputeWorkgroupsPerDimension() { return this._supportedLimits.$limits.maxComputeWorkgroupsPerDimension }
  get maxStorageBuffersInVertexStage() { return this._supportedLimits.$limits.maxStorageBuffersInVertexStage }
  get maxStorageTexturesInVertexStage() { return this._supportedLimits.$limits.maxStorageTexturesInVertexStage }
  get maxStorageBuffersInFragmentStage() { return this._supportedLimits.$limits.maxStorageBuffersInFragmentStage }
  get maxStorageTexturesInFragmentStage() { return this._supportedLimits.$limits.maxStorageTexturesInFragmentStage }
}

class Adapter implements GPUAdapter {
  constructor(private _adapter: c.Adapter) {}
  __brand = 'GPUAdapter' as const
  isFallbackAdapter = false
  get info(): GPUAdapterInfo {
    throw new Error()
  }
  get features(): GPUSupportedFeatures {
    const supported_features = new c.SupportedFeatures()
    c.adapterGetFeatures(this._adapter, supported_features._ptr())
    const features = new Set<string>()
    for (let i = 0n; i < supported_features.featureCount; i++) {
      const supported = new c.FeatureName()._loadFromPtr(c.Pointer.new(supported_features.features + i))
      const str = FeatureName.entries().find(([k,v])=>supported._value === v._value)?.[0]
      if (!str) continue
      features.add(str)
    }
    return features
  }
  get limits(): GPUSupportedLimits {
    const supported_limits = new c.SupportedLimits()
    c.adapterGetLimits(this._adapter, supported_limits._ptr())
    return new SupportedLimits(supported_limits)
  }
  async requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice> {
    const features = ((descriptor?.requiredFeatures || []) as GPUFeatureName[]).map(feat=>FeatureName.get(feat)!)
    
    // TODO: instead of this actually apply the correct limits
    const supported_limits = new c.SupportedLimits()
    c.adapterGetLimits(this._adapter, supported_limits._ptr())
    
    const desc = c.DeviceDescriptor.new({
      requiredFeatureCount: c.U64.new(BigInt(features.length)),
      requiredFeatures: c.createArray(features)._ptr(),
      requiredLimits: c.RequiredLimits.new({ limits: supported_limits.$limits })._ptr()
    })
    const [dev_status, device, dev_msg] = await _run(c.RequestDeviceCallbackInfo, (cb) => c.adapterRequestDeviceF(this._adapter, desc._ptr(), cb))
    if (dev_status._value !== c.RequestDeviceStatus.Success._value) throw new Error(`Failed to request device: ${dev_status} ${dev_msg}`)
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
  desc.$features.timedWaitAnyEnable = 1
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
const ErrorFilter = new Map([
  ["validation", c.ErrorFilter.Validation],
  ["out-of-memory", c.ErrorFilter.OutOfMemory],
  ["internal", c.ErrorFilter.Internal]
])
const BufferBindingType = new Map<GPUBufferBindingType | undefined, c.BufferBindingType>([
  ["read-only-storage", c.BufferBindingType.ReadOnlyStorage],
  ["storage", c.BufferBindingType.Storage],
  ["uniform", c.BufferBindingType.Uniform],
  [undefined, c.BufferBindingType.BindingNotUsed]
])
class Device implements GPUDevice{
  constructor(private _device: c.Device){}
  onuncapturederror=null
  label=""
  __brand= 'GPUDevice' as const
  get features(): GPUSupportedFeatures {
    throw new Error('Method not implemented.')
  }
  get limits(): GPUSupportedLimits {
    throw new Error('Method not implemented.')
  }
  get adapterInfo(): GPUAdapterInfo {
    throw new Error('Method not implemented.')
  }
  get queue(): GPUQueue {
    return new Queue(c.deviceGetQueue(this._device))
  }
  addEventListener(type: unknown, listener: unknown, options?: unknown): void {
    throw new Error('Method not implemented.')
  }
  removeEventListener(type: unknown, listener: unknown, options?: unknown): void {
    throw new Error('Method not implemented.')
  }
  destroy(): undefined {
    throw new Error('Method not implemented.')
  }
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
    const desc = c.BufferDescriptor.new({
      size: c.U64.new(BigInt(descriptor.size)),
      usage: c.BufferUsage.new(BigInt(descriptor.usage)),
      mappedAtCreation: c.Bool.new(Number(descriptor.mappedAtCreation ?? 0)),
    })
    return new Buffer(c.deviceCreateBuffer(this._device, desc._ptr()))
  }
  createTexture(descriptor: unknown): GPUTexture {
    throw new Error('Method not implemented.')
  }
  createSampler(descriptor?: unknown): GPUSampler {
    throw new Error('Method not implemented.')
  }
  importExternalTexture(descriptor: unknown): GPUExternalTexture {
    throw new Error('Method not implemented.')
  }
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
    const layouts: c.BindGroupLayoutEntry[] = []
    for (const entry of descriptor.entries){
      const layout = c.BindGroupLayoutEntry.new({
        binding: c.U32.new(entry.binding),
        visibility: c.ShaderStage.new(BigInt(entry.visibility)),
        buffer: c.BufferBindingLayout.new({ type: BufferBindingType.get(entry.buffer?.type)!, }),
      })
      layouts.push(layout)
    }
    return new BindGroupLayout(c.deviceCreateBindGroupLayout(
      this._device,
      c.BindGroupLayoutDescriptor.new({
        entryCount: c.Size.new(BigInt(layouts.length)),
        entries: c.createArray(layouts)._ptr(),
      })._ptr()
    ))
  }
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
    const bindGroupLayouts = (descriptor.bindGroupLayouts as BindGroupLayout[]).map(x=>x._bindGroupLayout)
    const pipeline_layout_desc = c.PipelineLayoutDescriptor.new({
      bindGroupLayoutCount: c.Size.new(BigInt(bindGroupLayouts.length)),
      bindGroupLayouts: c.createArray(bindGroupLayouts)._ptr(),
    })
    return new PipelineLayout(c.deviceCreatePipelineLayout(this._device, pipeline_layout_desc._ptr()))
  }
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    const entries:c.BindGroupEntry[] = []
    for (const x of descriptor.entries){
      const resource = x.resource as GPUBufferBinding
      const entry = c.BindGroupEntry.new({
        binding: c.U32.new(x.binding),
        buffer: (resource.buffer as Buffer)._buffer,
        offset: c.U64.new(BigInt(resource.offset ?? 0)),
        size:  c.U64.new(BigInt(resource.size ??0))
      })
      entries.push(entry)
    }
    const bind_group_desc = c.BindGroupDescriptor.new({ 
      layout: (descriptor.layout as BindGroupLayout)._bindGroupLayout,
      entryCount: c.Size.new(BigInt(entries.length)),
      entries: c.createArray(entries)._ptr(),
    })
    return new BindGroup(c.deviceCreateBindGroup(this._device, bind_group_desc._ptr()))
  }
  createShaderModule(descriptor: GPUShaderModuleDescriptor): ShaderModule {
    const shader = c.ShaderModuleWGSLDescriptor.new({
      code: to_wgpu_str(descriptor.code),
      chain: c.ChainedStruct.new({ sType: c.SType.ShaderSourceWGSL }),
    })
    const module = c.ShaderModuleDescriptor.new({nextInChain: shader._ptr()})
    return new ShaderModule(c.deviceCreateShaderModule(this._device, module._ptr()))
  }
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    const compute_desc = c.ComputePipelineDescriptor.new({
      layout: (descriptor.layout as PipelineLayout)._piplineLayout,
      compute: c.ComputeState.new({ 
        module: (descriptor.compute.module as ShaderModule)._shaderModule, 
        entryPoint: to_wgpu_str(descriptor.compute.entryPoint!) 
      }),
    })
    return new ComputePipeline(c.deviceCreateComputePipeline(this._device,compute_desc._ptr()))
  }
  createRenderPipeline(descriptor: unknown): GPURenderPipeline {
    throw new Error('Method not implemented.')
  }
  createComputePipelineAsync(descriptor: unknown): Promise<GPUComputePipeline> {
    throw new Error('Method not implemented.')
  }
  createRenderPipelineAsync(descriptor: unknown): Promise<GPURenderPipeline> {
    throw new Error('Method not implemented.')
  }
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder {
    return new CommandEncoder(c.deviceCreateCommandEncoder(this._device, new c.CommandEncoderDescriptor()._ptr()))
  }
  createRenderBundleEncoder(descriptor: unknown): GPURenderBundleEncoder {
    throw new Error('Method not implemented.')
  }
  createQuerySet(descriptor: unknown): GPUQuerySet {
    throw new Error('Method not implemented.')
  }
  get lost(): Promise<GPUDeviceLostInfo>{
    throw new Error("Method not implemented")
  }
  pushErrorScope(filter: GPUErrorFilter): undefined {
    c.devicePushErrorScope(this._device, ErrorFilter.get(filter)!)
  }
  async popErrorScope(): Promise<GPUError | null> {
    const [_ , __, message] = await _run(c.PopErrorScopeCallbackInfo, (cb) => c.devicePopErrorScopeF(this._device, cb))
    return message ? { message } : null
  }
  dispatchEvent(event: unknown): boolean {
    throw new Error('Method not implemented.')
  }
}
class ShaderModule implements GPUShaderModule{
  constructor(public _shaderModule: c.ShaderModule) {}
  __brand = 'GPUShaderModule' as const
  label = ''
  getCompilationInfo(): Promise<GPUCompilationInfo> {
    throw new Error('Method not implemented.')
  }
}
class BindGroupLayout implements GPUBindGroupLayout{
  constructor(public _bindGroupLayout: c.BindGroupLayout) {}
  __brand = 'GPUBindGroupLayout' as const
  label = ''
}
class PipelineLayout implements GPUPipelineLayout{
  constructor(public _piplineLayout: c.PipelineLayout) {}
  __brand = 'GPUPipelineLayout' as const
  label = ''
}
class ComputePipeline implements GPUComputePipeline{
  constructor(public _computePipeline: c.ComputePipeline) {}
  __brand = 'GPUComputePipeline' as const
  label = ''
  getBindGroupLayout(index: unknown): GPUBindGroupLayout {
    throw new Error('Method not implemented.')
  }
}
class BindGroup implements GPUBindGroup{
  constructor(public _bindGroup: c.BindGroup) {}
  __brand = 'GPUBindGroup' as const
  label = ''
}
class CommandEncoder implements GPUCommandEncoder{
  constructor(public _commandEncoder: c.CommandEncoder) {}
  __brand = 'GPUCommandEncoder' as const
  label = ''
  beginRenderPass(descriptor: unknown): GPURenderPassEncoder {
    throw new Error('Method not implemented.')
  }
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    const desc = new c.ComputePassDescriptor()
    if (descriptor?.timestampWrites) desc.timestampWrites = c.ComputePassTimestampWrites.new({
      querySet: (descriptor.timestampWrites.querySet as QuerySet)._querySet,
      beginningOfPassWriteIndex: c.U32.new(descriptor.timestampWrites.beginningOfPassWriteIndex ?? 0),
      endOfPassWriteIndex: c.U32.new(descriptor.timestampWrites.endOfPassWriteIndex ?? 0),
    })._ptr()._value
    return new ComputePassEncoder(c.commandEncoderBeginComputePass(this._commandEncoder, desc._ptr()))
  }
  copyBufferToBuffer(source: Buffer, sourceOffset: number, destination: Buffer, destinationOffset?: number, size?: number): undefined {
    c.commandEncoderCopyBufferToBuffer(this._commandEncoder, source._buffer, c.U64.new(BigInt(sourceOffset)), destination._buffer, c.U64.new(BigInt(destinationOffset ?? 0)), c.U64.new(BigInt(BigInt(size ?? 0))))
  }
  copyBufferToTexture(source: unknown, destination: unknown, copySize: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  copyTextureToBuffer(source: unknown, destination: unknown, copySize: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  copyTextureToTexture(source: unknown, destination: unknown, copySize: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  clearBuffer(buffer: unknown, offset?: unknown, size?: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  resolveQuerySet(querySet: unknown, firstQuery: unknown, queryCount: unknown, destination: unknown, destinationOffset: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer {
    return new CommandBuffer(c.commandEncoderFinish(this._commandEncoder, new c.CommandBufferDescriptor()._ptr()))
  }
  pushDebugGroup(groupLabel: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  popDebugGroup(): undefined {
    throw new Error('Method not implemented.')
  }
  insertDebugMarker(markerLabel: unknown): undefined {
    throw new Error('Method not implemented.')
  }
}
class CommandBuffer implements GPUCommandBuffer{
  constructor(public _commandBuffer: c.CommandBuffer){}
  __brand = 'GPUCommandBuffer' as const
  label = ''
}
class QuerySet implements GPUQuerySet{
  constructor(public _querySet: c.QuerySet) {}
  __brand = 'GPUQuerySet' as const
  label = ''
  destroy(): undefined {
    throw new Error('Method not implemented.')
  }
  get type(): GPUQueryType{
    throw new Error('Method not implemented.')
  }
  get count(): number{
    throw new Error('Method not implemented.')
  }
}
class Buffer implements GPUBuffer{
  constructor(public _buffer: c.Buffer) {}
  __brand = 'GPUBuffer' as const 
  label = ''
  get size(): number{
    return Number(c.bufferGetSize(this._buffer)._value)
  }
  get usage(): number{
    throw new Error('Method not implemented.')
  }
  get mapState(): GPUBufferMapState{
    throw new Error('Method not implemented.')
  }
  async mapAsync(mode: GPUMapModeFlags, offset?: number, size?: number): Promise<undefined> {
    const [status, msg] = await _run(c.BufferMapCallbackInfo2, (cb) => c.bufferMapAsync2(this._buffer, c.MapMode.new(BigInt(mode)), c.Size.new(BigInt(offset ?? 0)), c.Size.new(BigInt(size ?? 0)), cb))
    if (status._value !== c.BufferMapAsyncStatus.Success._value) throw new Error(`Async failed: ${msg}`)
  }
  getMappedRange(offset?: number, size?: number): ArrayBuffer {
    const ptr = c.bufferGetConstMappedRange(this._buffer, c.Size.new(BigInt(offset ?? 0)), c.Size.new(BigInt(size ?? 0)))
    const buf = new c.Type(new ArrayBuffer(size ?? 0), 0, size)._replaceWithPtr(ptr)
    return buf._buffer
  }
  unmap(): undefined {
    throw new Error('Method not implemented.')
  }
  destroy(): undefined {
    c.bufferDestroy(this._buffer)
  }
}
class ComputePassEncoder implements GPUComputePassEncoder{
  constructor(private _computePassEncoder: c.ComputePassEncoder) {}
  __brand = 'GPUComputePassEncoder' as const
  label = ''
  setPipeline(pipeline: ComputePipeline): undefined {
    c.computePassEncoderSetPipeline(this._computePassEncoder, pipeline._computePipeline)
  }
  dispatchWorkgroups(workgroupCountX: GPUSize32, workgroupCountY: GPUSize32, workgroupCountZ: GPUSize32): undefined {
    c.computePassEncoderDispatchWorkgroups(this._computePassEncoder, c.U32.new(workgroupCountX), c.U32.new(workgroupCountY), c.U32.new(workgroupCountZ))
  }
  dispatchWorkgroupsIndirect(indirectBuffer: unknown, indirectOffset: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  end(): undefined {
    c.computePassEncoderEnd(this._computePassEncoder)
  }
  pushDebugGroup(groupLabel: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  popDebugGroup(): undefined {
    throw new Error('Method not implemented.')
  }
  insertDebugMarker(markerLabel: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  setBindGroup(index: GPUIndex32, bindGroup?: BindGroup): undefined {
    c.computePassEncoderSetBindGroup(this._computePassEncoder, c.U32.new(index), bindGroup!._bindGroup, c.Size.new(0n), new c.Pointer())
  }
}
class Queue implements GPUQueue{
  constructor(private _queue: c.Queue) {}
  __brand = 'GPUQueue' as const 
  label = ''
  submit(commandBuffers: CommandBuffer[]): undefined {
    const bufs = commandBuffers.map(x => x._commandBuffer)
    c.queueSubmit(this._queue, c.Size.new(BigInt(bufs.length)), c.createArray(bufs)._ptr())
  }
  onSubmittedWorkDone(): Promise<undefined> {
    throw new Error('Method not implemented.')
  }
  writeBuffer(buffer: Buffer, bufferOffset: GPUSize64, data: BufferSource | SharedArrayBuffer, dataOffset?: GPUSize64, size?: GPUSize64): undefined {
    c.queueWriteBuffer(this._queue, buffer._buffer, c.U64.new(BigInt(bufferOffset)), new c.Pointer()._setNative(env.ptr(data as ArrayBuffer)), c.Size.new(BigInt(data.byteLength)))
  }
  writeTexture(destination: unknown, data: unknown, dataLayout: unknown, size: unknown): undefined {
    throw new Error('Method not implemented.')
  }
  copyExternalImageToTexture(source: unknown, destination: unknown, copySize: unknown): undefined {
    throw new Error('Method not implemented.')
  }
}
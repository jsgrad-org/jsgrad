import { bytes_to_string, isInt, perf, round_up } from '../helpers/helpers.ts'
import { Allocator, type BufferSpec, Compiled, Compiler, Program, type ProgramCallArgs } from './allocator.ts'
import { WGSLRenderer } from '../renderer/wgsl.ts'
import type { MemoryView } from '../helpers/memoryview.ts'
import { env } from '../env/index.ts'

const uniforms: { [key: number]: GPUBuffer } = {}
const create_uniform = (val: number): GPUBuffer => {
  if (uniforms[val]) return uniforms[val]
  const buf = WEBGPU.device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const bytes = new Uint8Array(4)
  if (isInt(val)) new DataView(bytes.buffer).setInt32(0, val, true)
  else new DataView(bytes.buffer).setFloat32(0, val, true)
  WEBGPU.device.queue.writeBuffer(buf, 0, bytes)
  uniforms[val] = buf
  return buf
}

class WebGPUProgram extends Program {
  prg!: GPUShaderModule
  code!: string
  bind_group_layout?: GPUBindGroupLayout
  compute_pipeline?: GPUComputePipeline
  static override init = (name: string, lib: Uint8Array) => {
    const res = new WebGPUProgram(name, lib)
    res.code = bytes_to_string(res.lib)
    res.prg = WEBGPU.device.createShaderModule({ code: res.code })
    return res
  }
  override call = async (bufs: GPUBuffer[], { global_size = [1, 1, 1], vals = [] }: ProgramCallArgs, wait = false) => {
    const isStorage = (i: number) => i < bufs.length && bytes_to_string(this.lib).split('\n').find((x) => x.includes(`binding(${i + 1})`))?.includes('var<storage,read_write>')
    WEBGPU.device.pushErrorScope('validation')
    if (!this.bind_group_layout || !this.compute_pipeline) {
      const binding_layouts: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ...[...bufs, ...vals].map<GPUBindGroupLayoutEntry>((_, i) => ({ binding: i + 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: isStorage(i) ? 'storage' : 'uniform' } })),
      ]

      this.bind_group_layout = WEBGPU.device.createBindGroupLayout({ entries: binding_layouts })
      const pipeline_layout = WEBGPU.device.createPipelineLayout({ bindGroupLayouts: [this.bind_group_layout] })
      this.compute_pipeline = WEBGPU.device.createComputePipeline({ layout: pipeline_layout, compute: { module: this.prg, entryPoint: this.name } })
    }

    const bindings: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: create_uniform(Infinity), offset: 0, size: 4 } },
      ...[...bufs, ...vals].map<GPUBindGroupEntry>((x, i) => (
        typeof x === 'number' ? { binding: i + 1, resource: { buffer: create_uniform(x), offset: 0, size: 4 } } : { binding: i + 1, resource: { buffer: x, offset: 0, size: x.size } }
      )),
    ]
    const bind_group = WEBGPU.device.createBindGroup({ layout: this.bind_group_layout, entries: bindings })
    const encoder = WEBGPU.device.createCommandEncoder()
    let timestampWrites: GPUComputePassTimestampWrites | undefined, querySet: GPUQuerySet | undefined, queryBuf: GPUBuffer | undefined
    if (wait && env.NAME !== 'deno') {
      querySet = WEBGPU.device.createQuerySet({ type: 'timestamp', count: 2 })
      queryBuf = WEBGPU.device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
      timestampWrites = { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
    }
    const compute_pass = encoder.beginComputePass(timestampWrites ? { timestampWrites } : undefined)
    compute_pass.setPipeline(this.compute_pipeline)
    compute_pass.setBindGroup(0, bind_group)
    compute_pass.dispatchWorkgroups(global_size[0], global_size[1], global_size[2]) // x y z
    compute_pass.end()
    if (wait && env.NAME !== 'deno') encoder.resolveQuerySet(querySet!, 0, 2, queryBuf!, 0)
    const st = performance.now()
    WEBGPU.device.queue.submit([encoder.finish()])

    const error = await WEBGPU.device.popErrorScope()
    if (error) throw new Error(error.message)

    if (wait) {
      if (env.NAME === 'deno') return perf(st)

      await WEBGPU.device.queue.onSubmittedWorkDone()

      const staging = WEBGPU.device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
      const commandEncoder = WEBGPU.device.createCommandEncoder()
      commandEncoder.copyBufferToBuffer(queryBuf!, 0, staging, 0, queryBuf!.size)
      WEBGPU.device.queue.submit([commandEncoder.finish()])
      await staging.mapAsync(GPUMapMode.READ)
      const timestamps = [...new BigUint64Array(staging.getMappedRange())]
      staging.destroy(), queryBuf!.destroy(), querySet!.destroy()
      return Number(timestamps[1] - timestamps[0]) / 1e9
    }
  }
}

class WebGpuAllocator extends Allocator<GPUBuffer> {
  _alloc = (size: number, options?: BufferSpec) => {
    // WebGPU buffers have to be 4-byte aligned
    const buf = WEBGPU.device.createBuffer({ size: round_up(size, 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC })
    return buf
  }
  _copyin = (dest: GPUBuffer, src: MemoryView) => WEBGPU.device.queue.writeBuffer(dest, 0, src.bytes)
  _copyout = async (dest: MemoryView, src: GPUBuffer) => {
    const staging = WEBGPU.device.createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    const encoder = WEBGPU.device.createCommandEncoder()
    encoder.copyBufferToBuffer(src, 0, staging, 0, src.size)
    WEBGPU.device.queue.submit([encoder.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    dest.set(new Uint8Array(staging.getMappedRange()).slice(0, dest.length))
    staging.destroy()
  }
  _free = (opaque: GPUBuffer, options?: BufferSpec) => opaque.destroy()
}

export class WEBGPU extends Compiled {
  static device: GPUDevice
  static timestamp_supported: boolean
  static f16_supported: boolean
  constructor(device: string) {
    super(device, new WebGpuAllocator(), new WGSLRenderer(), new Compiler(), WebGPUProgram)
  }
  override init = async () => {
    if (WEBGPU.device) return

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No adapter')
    WEBGPU.f16_supported = adapter.features.has('shader-f16')
    WEBGPU.timestamp_supported = adapter.features.has('timestamp-query')

    const { maxStorageBufferBindingSize, maxBufferSize, maxUniformBufferBindingSize, maxStorageBuffersPerShaderStage, maxComputeInvocationsPerWorkgroup } = adapter.limits
    WEBGPU.device = await adapter.requestDevice({
      requiredFeatures: [...(WEBGPU.f16_supported ? ['shader-f16' as const] : []), ...(WEBGPU.timestamp_supported ? ['timestamp-query' as const] : [])],
      requiredLimits: { maxStorageBufferBindingSize, maxBufferSize, maxUniformBufferBindingSize, maxStorageBuffersPerShaderStage, maxComputeInvocationsPerWorkgroup },
    })
  }
}

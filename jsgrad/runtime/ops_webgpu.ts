import { bytes_to_string, isInt, round_up } from '../helpers/helpers.ts'
import { Allocator, type BufferSpec, Compiled, Compiler, Program, type ProgramCallArgs } from './allocator.ts'
import { WGSLRenderer } from '../renderer/wgsl.ts'
import type { MemoryView } from '../helpers/memoryview.ts'

let device!: GPUDevice
let timestamp_supported: boolean | undefined
let f16_supported: boolean | undefined

const uniforms: { [key: number]: GPUBuffer } = {}
const create_uniform = (val: number): GPUBuffer => {
  if (uniforms[val]) return uniforms[val]
  const buf = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const bytes = new Uint8Array(4)
  if (isInt(val)) new DataView(bytes.buffer).setInt32(0, val, true)
  else new DataView(bytes.buffer).setFloat32(0, val, true)
  device.queue.writeBuffer(buf, 0, bytes)
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
    res.prg = device.createShaderModule({ code: res.code })
    return res
  }
  override call = async (bufs: GPUBuffer[], { global_size = [1, 1, 1], vals = [] }: ProgramCallArgs, wait = false) => {
    device.pushErrorScope('validation')

    if (!this.bind_group_layout || !this.compute_pipeline) {
      const binding_layouts: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ...[...bufs, ...vals].map<GPUBindGroupLayoutEntry>((_, i) => ({ binding: i + 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: i < bufs.length ? 'storage' : 'uniform' } })),
      ]

      this.bind_group_layout = device.createBindGroupLayout({ entries: binding_layouts })
      const pipeline_layout = device.createPipelineLayout({ bindGroupLayouts: [this.bind_group_layout] })
      this.compute_pipeline = device.createComputePipeline({ layout: pipeline_layout, compute: { module: this.prg, entryPoint: this.name } })
    }

    const bindings: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: create_uniform(Infinity), offset: 0, size: 4 } },
      ...[...bufs, ...vals].map<GPUBindGroupEntry>((x, i) => (
        typeof x === 'number' ? { binding: i + 1, resource: { buffer: create_uniform(x), offset: 0, size: 4 } } : { binding: i + 1, resource: { buffer: x, offset: 0, size: x.size } }
      )),
    ]
    const bind_group = device.createBindGroup({ layout: this.bind_group_layout, entries: bindings })
    const encoder = device.createCommandEncoder()
    let timestampWrites: GPUComputePassTimestampWrites | undefined, querySet: GPUQuerySet | undefined, queryBuf: GPUBuffer | undefined
    if (wait) {
      querySet = device.createQuerySet({ type: 'timestamp', count: 2 })
      queryBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
      timestampWrites = { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
    }
    const compute_pass = encoder.beginComputePass(timestampWrites ? { timestampWrites } : undefined)
    compute_pass.setPipeline(this.compute_pipeline)
    compute_pass.setBindGroup(0, bind_group)
    compute_pass.dispatchWorkgroups(global_size[0], global_size[1], global_size[2]) // x y z
    compute_pass.end()
    if (wait) encoder.resolveQuerySet(querySet!, 0, 2, queryBuf!, 0)
    device.queue.submit([encoder.finish()])

    const error = await device.popErrorScope()
    if (error) throw new Error(error.message)

    if (wait) {
      await device.queue.onSubmittedWorkDone()

      const staging = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
      const commandEncoder = device.createCommandEncoder()
      commandEncoder.copyBufferToBuffer(queryBuf!, 0, staging, 0, queryBuf!.size)
      device.queue.submit([commandEncoder.finish()])
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
    const buf = device.createBuffer({ size: round_up(size, 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC })
    return buf
  }
  _copyin = (dest: GPUBuffer, src: MemoryView) => device.queue.writeBuffer(dest, 0, src.bytes)
  _copyout = async (dest: MemoryView, src: GPUBuffer) => {
    const staging = device.createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    const encoder = device.createCommandEncoder()
    encoder.copyBufferToBuffer(src, 0, staging, 0, src.size)
    device.queue.submit([encoder.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    dest.set(new Uint8Array(staging.getMappedRange()).slice(0, dest.length))
    staging.destroy()
  }
  _free = (opaque: GPUBuffer, options?: BufferSpec) => opaque.destroy()
}

export class WEBGPU extends Compiled {
  constructor(device: string) {
    super(device, new WebGpuAllocator(), new WGSLRenderer(), new Compiler(), WebGPUProgram)
  }
  override init = async () => {
    if (device) return

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No adapter')
    f16_supported = adapter.features.has('shader-f16')
    timestamp_supported = adapter.features.has('timestamp-query')

    const { maxStorageBufferBindingSize, maxBufferSize, maxUniformBufferBindingSize, maxStorageBuffersPerShaderStage, maxComputeInvocationsPerWorkgroup } = adapter.limits
    device = await adapter.requestDevice({
      requiredFeatures: [...(f16_supported ? ['shader-f16' as const] : []), ...(timestamp_supported ? ['timestamp-query' as const] : [])],
      requiredLimits: { maxStorageBufferBindingSize, maxBufferSize, maxUniformBufferBindingSize, maxStorageBuffersPerShaderStage, maxComputeInvocationsPerWorkgroup },
    })
  }
}
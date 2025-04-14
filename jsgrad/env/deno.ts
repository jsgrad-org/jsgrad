import { DISK } from '../runtime/ops_disk.ts'
import { JS } from '../runtime/ops_js.ts'
import { WASM } from '../runtime/ops_wasm.ts'
import { WEBGPU } from '../runtime/ops_webgpu.ts'
import { CLANG } from '../runtime/ops_clang.ts'
import { CLOUD } from '../runtime/ops_cloud.ts'
import { NodeEnv } from './node.ts'
import type { FFICallback } from './web.ts'
import { NULL } from '../runtime/ops_null.ts'
import { vars } from '../helpers/helpers.ts'
import { requestAdapter } from '../runtime/autogen/dawn/index.ts'

export class DenoEnv extends NodeEnv {
  constructor(){
    super()
    if (!vars.get_num("WGPU")) navigator.gpu.requestAdapter = requestAdapter
  }
  override NAME = 'deno'
  override CPU_DEVICE = 'CLANG'
  override PLATFORM = process.platform
  override DEVICES = { CLANG, WEBGPU, WASM, JS, DISK, CLOUD, NULL }
  override dlopen = Deno.dlopen
  override ptr = (buffer: ArrayBuffer, offset?: number) => (offset ? Deno.UnsafePointer.offset(Deno.UnsafePointer.of(buffer) as any, offset) : Deno.UnsafePointer.of(buffer))
  override ptrToU64 = (ptr: any) => Deno.UnsafePointer.value(ptr)
  override u64ToPtr = (u64: any) => Deno.UnsafePointer.create(u64)
  override getCString = (ptr: any) => Deno.UnsafePointerView.getCString(ptr)
  override getArrayBuffer = (ptr: any, byteLength: number, offset?: number) => Deno.UnsafePointerView.getArrayBuffer(ptr, byteLength, offset)
  override callback: FFICallback = (x, cb) => new Deno.UnsafeCallback(x, cb).pointer
}

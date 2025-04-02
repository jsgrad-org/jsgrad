import type { MemoryView } from '../helpers/memoryview.ts'
import type { UOp } from '../ops.ts'
import { Renderer } from '../renderer/index.ts'
import { Allocator, Compiled, Compiler, Program, type ProgramCallArgs } from './allocator.ts'

class NullRenderer extends Renderer {
  override render = (name: string, uops: UOp[]) => ''
}
class NullProgram extends Program {
  static override init = async (name: string, lib: Uint8Array) => new NullProgram(name, lib)
  override call = (bufs: any[], args: ProgramCallArgs, wait: boolean) => {
    return 1e-4
  }
}
class NullAllocator extends Allocator<any> {
  override _alloc = (size: number, options: any) => 'null'
  override _copyin = (dest: any, src: MemoryView) => {}
  override _copyout = (dest: MemoryView, src: any) => {}
  override _free = () => {}
}
export class NULL extends Compiled {
  constructor(device: string) {
    super(device, new NullAllocator(), new NullRenderer(), new Compiler(), NullProgram)
  }
  override init = async () => {}
}

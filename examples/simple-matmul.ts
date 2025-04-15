/** [](type:markdown) */
/**
# Simple matmul

See how fast your device does matmul, you can try with HALF and BEAM as well

*/
/** [](type:code) */
import { Tensor, dtypes, range, vars } from '@jsgrad/jsgrad'

vars.set("DEBUG", "2")

// vars.set("HALF", "1") // Uncomment for testing half precision
// vars.set("BEAM", "2") // Uncomment to see if BEAM=2 makes it faster

let dtype_in = vars.get('HALF') ? dtypes.half : vars.get('BFLOAT16') ? dtypes.bfloat16 : dtypes.float
let acc_dtype = vars.get('ACC_HALF') ? dtypes.half : vars.get('ACC_BFLOAT16') ? dtypes.bfloat16 : undefined
if (vars.get('INT')) {
  dtype_in = dtypes.int8
  acc_dtype = dtypes.int32
}
const N = vars.get_num('N', 4096)
const M = vars.get_num('M', N)
const K = vars.get_num('K', N)
const CNT = vars.get_num('CNT', 10)

let a = await  Tensor.rand([M, K],undefined, { dtype: dtype_in }).realize()
let b = await Tensor.rand([K, N], undefined, { dtype: dtype_in }).realize()

for (const i of range(CNT)){
  if (i > 0 && vars.get_num("RAND", 0) !== 0){
    a = await Tensor.rand([M, K], undefined, { dtype: dtype_in }).realize()
    b = await Tensor.rand([K, N], undefined, { dtype: dtype_in }).realize()
  }
  await a.matmul(b, undefined, acc_dtype).realize()
}
// TODO: check correctness
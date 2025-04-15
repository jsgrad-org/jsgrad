import { Tensor, dtypes, range, vars } from '@jsgrad/jsgrad'

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
const ATOL = vars.get_num('ATOL', 1e-4)
const RTOL = vars.get_num('RTOL', 3e-2)

let a = await  Tensor.rand([M, K],undefined, { dtype: dtype_in }).realize(), b = await Tensor.rand([K, N], undefined,{ dtype: dtype_in }).realize()

for (const i of range(CNT)){
  if (i > 0 && vars.get_num("RAND", 0) != 0){
    a = await Tensor.rand([M, K],undefined, { dtype: dtype_in }).realize(), b = await Tensor.rand([K, N], undefined, { dtype: dtype_in }).realize()
  }
  await a.matmul(b, undefined, acc_dtype).realize()
}
// TODO: check correctness
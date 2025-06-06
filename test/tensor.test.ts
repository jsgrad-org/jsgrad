import { Device } from '../jsgrad/device.ts'
import { type DType, dtypes } from '../jsgrad/dtype.ts'
import { Ops, type sint } from '../jsgrad/ops.ts'
import { Tensor, type TensorOptions } from '../jsgrad/tensor.ts'
import { compare, tryCatch } from './helpers.ts'
import { describe } from 'vitest'

describe(
  'Tensor.numel',
  compare<[Tensor]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6.5])],
      [new Tensor(4)],
      [new Tensor([true, false])],
    ],
    (t: Tensor) => t.numel(),
    'out(data[0].numel())',
  ),
)
describe(
  'Tensor.item',
  compare<[Tensor]>(
    () => [
      [new Tensor(4)],
      [new Tensor(4.55)],
      [new Tensor(true)],
    ],
    async (t: Tensor) => await t.item(),
    'out(data[0].item())',
  ),
)

describe(
  'Tensor.init',
  compare<[any, TensorOptions]>(
    [
      [[4, 4, 4, 2, 6.5], { dtype: dtypes.float }],
      [[], {}],
      [[4], {}],
      [[555], {}],
      [[-1], {}],
      [[255], {}],
      [undefined, {}],
      [1.2, {}],
      [255, {}],
      [[256], {}],
      [[257], {}],
      [[4, 5], {}],
      [[[4, 5]], {}],
      [[[[4, 5]]], {}],
      [[4, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER], {
        dtype: dtypes.bool,
      }],
      [[true, false], {}],
      [new Uint8Array([2, 3]), { dtype: dtypes.float }],
    ],
    (data, opts) => new Tensor(data, opts),
    'out(tiny.Tensor(data[0], dtype=data[1].get("dtype")))',
  ),
)

describe(
  'Tensor.reshape',
  compare<[Tensor, number[]]>(
    [
      [new Tensor([4, 4, 4, 2, 6.5, 1, 2, 3, 4, 5]), [10]],
      [new Tensor([4, 4, 4, 2, 6.5, 1, 2, 3, 4, 5]), [1, 10]],
      [new Tensor([4, 4, 4, 2, 6.5, 1, 2, 3, 4, 5]), [1, 1, 10]],
      [new Tensor([[4, 4, 4, 2, 6.5, 1, 2, 3, 4, 5]]), [2, 1, 5]],
    ],
    (t: Tensor, shape: number[]) => t.reshape(...shape),
    'out(data[0].reshape(data[1]))',
  ),
)

describe(
  'Tensor._broadcast_to',
  compare<[Tensor, number[]]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6.5, 1, 2, 3, 4, 5]), [1, 10]],
      [new Tensor([4, 4, 4, 2, 6.5, 1, 2, 3, 4, 5]), [1, 1, 10]],
    ],
    tryCatch(async (t: Tensor, shape: number[]) => await t._broadcast_to(shape).tolist()),
    'out(data[0]._broadcast_to(data[1]).tolist())',
  ),
)

describe(
  'Tensor.get.data',
  compare<[Tensor]>(
    () => [
      [new Tensor([4, 11, 255, 2, 65, 1, 24, 3, 1, 5])],
    ],
    async (t: Tensor) => {
      return [
        await t.get(undefined).data(),
        await t.get('...').data(),
        await t.reshape(5, 2).data(),
        await t.get(0).data(),
        await t.get(9).data(),
        await t.get({ from: 2, to: 2 }).data(),
        await t.reshape(2, 5).get(0, 4).data(),
        await t.get({ from: 2, to: 6 }).data(),
        await t.reshape(2, 5).get(1).data(),
        await t.get({ from: 0, to: 2 }).data(),
        await t.reshape(5, 2).get({ from: 1, to: 2 }).data(),
        await t.reshape(5, 2).get({ from: 1, to: 3 }).data(),
      ]
    },
    [
      't = data[0]',
      'out([',
      '   t[None].data(),',
      '   t[...].data(),',
      '   t.reshape((5,2)).data(),',
      '   t[0].data(),',
      '   t[9].data(),',
      '   t[2:2].data(),',
      '   t.reshape((2,5))[0, 4].data(),',
      '   t[2:6].data(),',
      '   t.reshape((2,5))[1].data(),',
      '   t[0:2].data(),',
      '   t.reshape((5,2))[1:2].data(),',
      '   t.reshape((5,2))[1:3].data(),',
      '])',
    ],
    {
      skip: (Device.DEFAULT === 'WEBGPU' || Device.DEFAULT === 'WASM') ? [0] : undefined,
    },
  ),
)

describe(
  'Tensor.get.tolist',
  compare<[Tensor]>(
    [
      [new Tensor([4, 11, 255, 2, 65, 1, 24, 3, 1, 5])],
      [new Tensor([4.2, 11.7, 255.1, 2.9, 65.3, 1.4, 24.8, 3.6, 1.1, 5.5])],
    ],
    async (t) => {
      return [
        await t.get(undefined).tolist(),
        await t.get('...').tolist(),
        await t.reshape(5, 2).tolist(),
        await t.get(0).tolist(),
        await t.get(9).tolist(),
        await t.get({ from: 2, to: 2 }).tolist(),
        await t.reshape(2, 5).get(0, 4).tolist(),
        await t.reshape(2, 5).get(1).tolist(),
        await t.get({ from: 0, to: 2 }).tolist(),
        await t.reshape(5, 2).get({ from: 1, to: 2 }).tolist(),
      ]
    },
    [
      't = data[0]',
      'out([',
      '   t[None].tolist(),',
      '   t[...].tolist(),',
      '   t.reshape((5,2)).tolist(),',
      '   t[0].tolist(),',
      '   t[9].tolist(),',
      '   t[2:2].tolist(),',
      '   t.reshape((2,5))[0, 4].tolist(),',
      // '   t[2:6].tolist(),',
      '   t.reshape((2,5))[1].tolist(),',
      '   t[0:2].tolist(),',
      '   t.reshape((5,2))[1:2].tolist(),',
      // '   t.reshape((5,2))[1:3].tolist(),',
      '])',
    ],
  ),
)

describe(
  'Tensor.add',
  compare<[Tensor, Tensor | number]>(
    [
      [new Tensor([4, 4, 4, 2, 6]), new Tensor([4, 4, 3, 3, 3])],
      [
        new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(1, 1, 6),
        new Tensor([4, 4, 3, 3, 3, 6]),
      ],
      [
        new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(2, 3),
        new Tensor([4, 4, 3, 3, 3, 6]).reshape(2, 3),
      ],
      [new Tensor([4, 4, 4, 2, 6, 5]), 3.4],
    ],
    (t1, t2) => t1.add(t2),
    'out(data[0] + data[1])',
  ),
)

describe(
  'Tensor.mul',
  compare<[Tensor, Tensor | number]>(
    [
      [new Tensor([4, 4, 4, 2, 6]), new Tensor([4, 4, 3, 3, 3])],
      [
        new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(1, 1, 6),
        new Tensor([4, 4, 3, 3, 3, 6]),
      ],
      [
        new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(2, 3),
        new Tensor([4, 4, 3, 3, 3, 6]).reshape(2, 3),
      ],
      [new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(2, 3), 1],
      [new Tensor([4, 4, 4, 2, 6, 5]).reshape(2, 3), 1.2],
    ],
    (t1, t2) => t1.mul(t2),
    'out(data[0] * data[1])',
  ),
)

describe(
  'Tensor.div',
  compare<[Tensor, Tensor]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6]), new Tensor([4, 4, 3, 3, 3])],
      [
        new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(1, 1, 6),
        new Tensor([4, 4, 3, 3, 3, 6]),
      ],
      [
        new Tensor([4, 4, 4, 2, 6.5, 5]).reshape(2, 3),
        new Tensor([4, 4, 3, 3, 3, 6]).reshape(2, 3),
      ],
    ],
    (t1, t2) => t1.div(t2),
    'out(data[0] / data[1])',
  ),
)
describe(
  'Tensor.idiv',
  compare<[Tensor, Tensor]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6]), new Tensor([4, 4, 3, 3, 3])],
      [
        new Tensor([4, 4, 4, 2, 6, 5]).reshape(1, 1, 6),
        new Tensor([4, 4, 3, 3, 3, 6]),
      ],
      [
        new Tensor([4, 4, 4, 2, 6, 5]).reshape(2, 3),
        new Tensor([4, 4, 3, 3, 3, 6]).reshape(2, 3),
      ],
    ],
    (t1, t2) => t1.idiv(t2),
    'out(data[0] // data[1])',
  ),
)
describe(
  'Tensor.cast',
  compare<[Tensor, DType]>(
    () => [
      // [new Tensor([4, 4, 4, 2, 6]), dtypes.bool],
      [new Tensor([4, 4, 4, 2, 6, 5.5]).reshape(1, 1, 6), dtypes.float],
      [new Tensor([4, 4, 4, 2, 6, 5.5]).reshape(1, 1, 6), dtypes.int],
      // [new Tensor([4, 4, 4, 2, 6, 5.5]).reshape([2, 3]), dtypes.bool],
    ],
    (t1, dtype) => t1.cast(dtype),
    'out(data[0].cast(data[1]))',
  ),
)
describe(
  'Tensor.maximum',
  compare<[Tensor, Tensor]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6]), new Tensor([4, 4, 3, 3, 3])],
      [
        new Tensor([4, 4, 4, 2, 6, 5]).reshape(1, 1, 6),
        new Tensor([4, 4, 3, 3, 3, 6]),
      ],
      [
        new Tensor([4, 4, 4, 2, 6, 5]).reshape(2, 3),
        new Tensor([4, 4, 3, 3, 3, 6]).reshape(2, 3),
      ],
    ],
    (t1: Tensor, t2: Tensor) => t1.maximum(t2),
    'out(data[0].maximum(data[1]))',
  ),
)
describe(
  'Tensor.minimum',
  compare<[Tensor, Tensor]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6]), new Tensor([4, 4, 3, 3, 3])],
      [
        new Tensor([4, 4, 4, 2, 6, 5]).reshape(1, 1, 6),
        new Tensor([4, 3, 3, 3, 3, 6]),
      ],
      [
        new Tensor([4, 4, 4, 2, 6, 5]).reshape(2, 3),
        new Tensor([1, 2, 3, 3, 3, 6]).reshape(2, 3),
      ],
    ],
    (t1, t2) => t1.minimum(t2),
    'out(data[0].minimum(data[1]))',
  ),
)

describe(
  'Tensor.matmul',
  compare<[Tensor, Tensor]>(
    () => [
      [new Tensor([4, 4, 4, 2, 6.5]), new Tensor([4, 4, 3, 3, 3])],
    ],
    (t1: Tensor, t2: Tensor) => t1.matmul(t2),
    'out(data[0] @ data[1])',
    { skip: true },
  ),
)

const ops = (): [Tensor, keyof Tensor, boolean?][] => [
  [new Tensor([[-2, -1, 0], [1, 2, 3]]), 'max'],
  [new Tensor([[-2, -1, 0], [1, 2, 3]]), 'min'],
  [new Tensor([[-2, -1, 0], [1, 2, 3]]), 'relu'],
  [
    new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]),
    'max_pool2d',
  ],
  [new Tensor([[1, 2], [3, 4], [5, 6]]), 'flatten'],
  [new Tensor([2.4, 5.5, 7.7]), 'round'],
  [new Tensor([-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5]), 'round'],
  [new Tensor([1.4, 1.5, 1.6, 2.4, 2.5, 2.6]), 'round'],
  [new Tensor([-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5]), 'floor'],
  [new Tensor([1.1, 1.9, 2.1, 2.9]), 'floor'],
  [new Tensor([-1.9, -1.1, -0.9, -0.1]), 'floor'],
  [new Tensor([-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5]), 'ceil'],
  [new Tensor([1.1, 1.9, 2.1, 2.9]), 'ceil'],
  [new Tensor([-1.9, -1.1, -0.9, -0.1]), 'ceil'],
  [new Tensor([-34.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5]), 'trunc'],
  [new Tensor([1.1, 1.9, 2.1, 2.9]), 'trunc'],
  [new Tensor([-1.9, -1.1, -9.9, -4.1]), 'trunc'],
  // [new Tensor([1, Infinity, 2, -Infinity, NaN]), 'isinf'],
  [new Tensor([1, 2, 3, 4, NaN, 5]), 'isnan', Device.DEFAULT === 'WEBGPU'],
  [new Tensor([1, 2, 3]), 'square'],
  [new Tensor([-3, -2, -1, 0, 1, 2, 3]), 'square'],
  [new Tensor([-3, -2, -1, 0, 1, 2, 3]), 'sign'],
  [new Tensor([0.1, -0.5, 1.2, -2.4]), 'sign'],
  [new Tensor([-3, -2, -1, 0, 1, 2, 3]), 'abs'],
  [new Tensor([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]), 'abs'],
  [new Tensor([1, 2, 4, 8]), 'reciprocal'],
  [new Tensor([0.5, 2, 4, 10]), 'reciprocal'],
  [new Tensor([true, false, true]), 'logical_not', Device.DEFAULT === 'WEBGPU'],
  [new Tensor([-2, -1, 0, 1, 2]), 'neg'],
  [new Tensor([[1, 2], [3, 4]]), 'contiguous'],
  [new Tensor([[1, 2], [3, 4]]), 'contiguous_backward'],
  [new Tensor([0.1, 1.0, 10.0]), 'log'],
  [new Tensor([0.1, 1.0, 10.0]), 'log2'],
  [new Tensor([-2, -1, 0, 1, 2]), 'exp'],
  [new Tensor([-2, -1, 0, 1, 2]), 'exp2'],
  [new Tensor([-2, -1, 0, 1, 2]), 'relu'],
  [new Tensor([-2, -1, 0, 1, 2]), 'sigmoid'],
  [new Tensor([-2, -1, 0, 1, 2]), 'hardsigmoid'],
  [new Tensor([0, 1, 4, 9, 16]), 'sqrt'],
  [new Tensor([1, 4, 9, 16]), 'rsqrt'],
  // [new Tensor([-1, -0.5, 0, 0.5, 1]), 'sin'],
  // [new Tensor([-1, -0.5, 0, 0.5, 1]), 'cos'],
  // [new Tensor([-1, -0.5, 0, 0.5, 1]), 'tan'],
  [new Tensor([-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]), 'asin'],
  [new Tensor([-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]), 'acos'],
  [new Tensor([-3, -2, -1, 0, 1, 2, 3]), 'atan'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'elu'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'celu'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'selu'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'swish'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'silu'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'relu6'],
  [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'hardswish'],
  [new Tensor([-2, -1, 0, 1, 2]), 'tanh'],
  [new Tensor([-2, -1, 0, 1, 2]), 'sinh'],
  [new Tensor([-2, -1, 0, 1, 2]), 'cosh'],
  // [new Tensor([-0.9, -0.5, 0, 0.5, 0.9]), 'atanh'],
  // [new Tensor([-2, -1, 0, 1, 2]), 'asinh'],
  // [new Tensor([1.5, 2, 2.5, 3, 3.5]), 'acosh'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'hardtanh'],
  // [new Tensor([-2, -1, 0, 1, 2]), 'erf'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'gelu'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'quick_gelu'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'leakyrelu'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'mish'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'softplus'],
  // [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 'softsign'],
]

for (const [i, [tensor, op, skip]] of ops().entries()) {
  describe(
    `Tensor.ops.${op}.${i}`,
    compare(
      [[tensor, op]],
      (t: Tensor, op: keyof Tensor) => (t[op] as any)(),
      'out(getattr(data[0],data[1])())',
      { skip },
    ),
  )
}

describe(
  'Tensor._pool',
  compare<[Tensor, number[], (number | number[])?, (number | number[])?]>(
    () => [
      // Basic 2D pooling
      [new Tensor([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), [2, 2]],

      // Test stride > kernel case
      [
        new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [
          13,
          14,
          15,
          16,
        ]]),
        [2, 2],
        3,
      ],

      // Test dilation
      [
        new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [
          13,
          14,
          15,
          16,
        ]]),
        [2, 2],
        1,
        2,
      ],

      // Test kernel > stride case
      [new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]), [3, 3], 2],

      // Test 1D pooling
      [new Tensor([1, 2, 3, 4, 5, 6]), [2]],

      // Test 3D pooling
      [new Tensor([[[1, 2], [3, 4]], [[5, 6], [7, 8]]]), [2, 2, 2]],

      // Test different strides per dimension
      [
        new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [
          13,
          14,
          15,
          16,
        ]]),
        [2, 2],
        [2, 1],
      ],

      // Test different dilations per dimension
      [
        new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [
          13,
          14,
          15,
          16,
        ]]),
        [2, 2],
        1,
        [2, 1],
      ],

      [
        new Tensor([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]).reshape(15),
        [8],
      ],
      [
        new Tensor([[0, 0, 1, 1, 1], [0, 0, 1, 1, 1], [0, 0, 1, 1, 1]]),
        [3],
        1,
        1,
      ],
    ],
    (t, k_, stride = 1, dilation = 1) => t._pool(k_, stride, dilation),
    'out(data[0]._pool(*data[1:]))',
  ),
)

describe(
  'Tensor.repeat',
  compare<[Tensor, sint[]]>(
    () => [
      [
        new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [
          13,
          14,
          15,
          16,
        ]]),
        [3, 3],
      ],
    ],
    (t, repeats) => t.repeat(...repeats),
    'out(data[0].repeat(data[1]))',
  ),
)

describe(
  'Tensor.reshape',
  compare<[Tensor, number[]]>(
    () => [
      [
        new Tensor([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [
          13,
          14,
          15,
          16,
        ]]),
        [1, 4, 1, 4],
      ],
      [
        new Tensor([[[[1, 2, 3, 4]], [[5, 6, 7, 8]], [[9, 10, 11, 12]], [[
          13,
          14,
          15,
          16,
        ]]]]),
        [1, 4, 1, 4],
      ],
      [
        new Tensor([[
          [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]],
          [[5, 6, 7, 8], [5, 6, 7, 8], [5, 6, 7, 8]],
          [[9, 10, 11, 12], [9, 10, 11, 12], [9, 10, 11, 12]],
          [[13, 14, 15, 16], [13, 14, 15, 16], [13, 14, 15, 16]],
        ], [
          [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]],
          [[5, 6, 7, 8], [5, 6, 7, 8], [5, 6, 7, 8]],
          [[9, 10, 11, 12], [9, 10, 11, 12], [9, 10, 11, 12]],
          [[13, 14, 15, 16], [13, 14, 15, 16], [13, 14, 15, 16]],
        ], [
          [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]],
          [[5, 6, 7, 8], [5, 6, 7, 8], [5, 6, 7, 8]],
          [[9, 10, 11, 12], [9, 10, 11, 12], [9, 10, 11, 12]],
          [[13, 14, 15, 16], [13, 14, 15, 16], [13, 14, 15, 16]],
        ]]),
        [12, 12],
      ],
    ],
    (t, shape) => t.reshape(...shape),
    'out(data[0].reshape(*data[1]))',
  ),
)

describe(
  'Tensor.shrink',
  compare<[Tensor, [sint, sint][]]>(
    () => [
      [
        new Tensor([[
          [[1, 2, 3, 4, 1], [2, 3, 4, 1, 2]],
          [[5, 6, 7, 8, 5], [6, 7, 8, 5, 6]],
          [[9, 10, 11, 12, 9], [10, 11, 12, 9, 10]],
          [[13, 14, 15, 16, 13], [14, 15, 16, 13, 14]],
          [[1, 2, 3, 4, 1], [2, 3, 4, 1, 2]],
          [[5, 6, 7, 8, 5], [6, 7, 8, 5, 6]],
        ], [
          [[9, 10, 11, 12, 9], [10, 11, 12, 9, 10]],
          [[13, 14, 15, 16, 13], [14, 15, 16, 13, 14]],
          [[1, 2, 3, 4, 1], [2, 3, 4, 1, 2]],
          [[5, 6, 7, 8, 5], [6, 7, 8, 5, 6]],
          [[9, 10, 11, 12, 9], [10, 11, 12, 9, 10]],
          [[13, 14, 15, 16, 13], [14, 15, 16, 13, 14]],
        ]]),
        [[0, 2], [0, 2], [0, 2], [0, 3]],
      ],
      [
        new Tensor([
          [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
          [5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8],
          [9, 10, 11, 12, 9, 10, 11, 12, 9, 10, 11, 12],
          [13, 14, 15, 16, 13, 14, 15, 16, 13, 14, 15, 16],
          [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
          [5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8],
          [9, 10, 11, 12, 9, 10, 11, 12, 9, 10, 11, 12],
          [13, 14, 15, 16, 13, 14, 15, 16, 13, 14, 15, 16],
          [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
          [5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8],
          [9, 10, 11, 12, 9, 10, 11, 12, 9, 10, 11, 12],
          [13, 14, 15, 16, 13, 14, 15, 16, 13, 14, 15, 16],
        ]),
        [[0, 12], [0, 10]],
      ],
      [
        new Tensor([[
          [[1, 2, 3, 4, 1], [2, 3, 4, 1, 2]],
          [[5, 6, 7, 8, 5], [6, 7, 8, 5, 6]],
          [[9, 10, 11, 12, 9], [10, 11, 12, 9, 10]],
          [[13, 14, 15, 16, 13], [14, 15, 16, 13, 14]],
          [[1, 2, 3, 4, 1], [2, 3, 4, 1, 2]],
        ], [
          [[5, 6, 7, 8, 5], [6, 7, 8, 5, 6]],
          [[9, 10, 11, 12, 9], [10, 11, 12, 9, 10]],
          [[13, 14, 15, 16, 13], [14, 15, 16, 13, 14]],
          [[1, 2, 3, 4, 1], [2, 3, 4, 1, 2]],
          [[5, 6, 7, 8, 5], [6, 7, 8, 5, 6]],
        ]]),
        [[0, 2], [0, 4], [0, 2], [0, 3]],
      ],
      [
        new Tensor([
          [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
          [5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8],
          [9, 10, 11, 12, 9, 10, 11, 12, 9, 10, 11, 12],
          [13, 14, 15, 16, 13, 14, 15, 16, 13, 14, 15, 16],
          [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
          [5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8],
          [9, 10, 11, 12, 9, 10, 11, 12, 9, 10, 11, 12],
          [13, 14, 15, 16, 13, 14, 15, 16, 13, 14, 15, 16],
          [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
          [5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8],
          [9, 10, 11, 12, 9, 10, 11, 12, 9, 10, 11, 12],
          [13, 14, 15, 16, 13, 14, 15, 16, 13, 14, 15, 16],
        ]),
        [[0, 10], [0, 10]],
      ],
    ],
    (t, args) => t.shrink(...args),
    'out(data[0].shrink(data[1]))',
  ),
)

describe(
  'Tensor.eq',
  compare<[Tensor, Tensor | number | boolean]>(
    () => [
      // [new Tensor(NaN), Infinity],
      // [new Tensor([Infinity]), Infinity],
      [new Tensor([NaN, NaN]), NaN],
      [new Tensor([5.5]), 5.5],
      [new Tensor([3.1, 2.3, 1.3, 4.4]), true],
      [new Tensor([3, 2, 1, 4]), 4],
      [new Tensor([3, 2, 3, 3]), Infinity],
      [new Tensor([3, 2, 3, 3.3]), Infinity],
      // [new Tensor([3, 2, 3, Infinity]), Infinity],
      [new Tensor([3, 2, 3, NaN]), Infinity],
      [new Tensor([3, 2, 3, true]), Infinity],
      [new Tensor(4), 4],
      // [new Tensor(Infinity), Infinity], // TODO: there is some problem with caching I guess, running one by one is ok
      [new Tensor(NaN), NaN],
      [new Tensor(Infinity), NaN],
      [new Tensor(Infinity), NaN],
      [new Tensor([-2.7, -1.5, -0.2, 0, 0.2, 1.5, 2.7]), 0],
    ],
    (t1, t2) => t1.eq(t2),
    'out((data[0] == data[1]))',
    { skip: Device.DEFAULT === 'WEBGPU' ? [0, 1, 6, 12] : undefined },
  ),
)
describe(
  'Tensor.full',
  compare(
    [
      [[3, 3], 1],
      [[2, 4], 2],
      [[4, 2], 3],
    ],
    (shape: number[], fill: number) => Tensor.full(shape, fill),
    'out(tiny.Tensor.full(*data))',
  ),
)
describe(
  'Tensor.ones',
  compare(
    [
      [[1, 1, 4, 4]],
      [[1]],
    ],
    Tensor.ones,
    'out(tiny.Tensor.ones(*data))',
  ),
)

describe(
  'Tensor.zeros',
  compare(
    [
      [[1, 1, 4, 4]],
      [[1]],
    ],
    Tensor.zeros,
    'out(tiny.Tensor.zeros(*data))',
  ),
)

describe(
  'Tensor.rand',
  compare(
    [
      [[1, 1, 4, 4]],
      [[1, 1, 3, 3]],
    ],
    (shape: number[]) => {
      Tensor.manual_seed(3)
      return Tensor.rand(shape)
    },
    [
      'tiny.Tensor.manual_seed(3)',
      'out(tiny.Tensor.rand(*data))',
    ],
    { skip: Device.DEFAULT === 'WASM' },
  ),
)

describe(
  'Tensor.arange',
  compare(
    [
      [8], // basic case
      [5, 10], // start and stop
      [5, 10, 2], // start, stop, step
      [5.5, 10, 2], // float values
      [0, 5], // zero start
      [-5, 5], // negative start
      [5, -5, -1], // negative step
      [5, 5], // empty range
      [0, 10, 3], // step > 1
    ],
    Tensor.arange,
    'out(tiny.Tensor.arange(*data))',
  ),
)

describe(
  'Tensor._cumalu',
  compare<[Tensor, number, Ops]>(
    [
      [Tensor.full([8], 1), 0, Ops.ADD], // Basic cumulative sum
      [Tensor.arange(5), 0, Ops.ADD], // Cumsum on sequence
      [Tensor.full([3, 3], 1), 0, Ops.ADD], // 2D cumsum along axis 0
      [Tensor.full([3, 3], 1), 1, Ops.ADD], // 2D cumsum along axis 1
      [Tensor.arange(5), 0, Ops.MAX], // Cumulative max
      [Tensor.full([2, 4], 2), 1, Ops.MAX], // 2D cummax along axis 1
      [Tensor.full([4, 2], 3), 0, Ops.MAX], // 2D cummax along axis 0
      // TODO: These throw error in python also, you can try with: Tensor.arange(1, 5).reshape(2, 2).clone().tolist(). but seems that it's fixed on master
      // [Tensor.arange(1, 5).reshape([2, 2]), 0, Ops.ADD], // Reshaped cumsum
      // [Tensor.arange(1, 5).reshape([2, 2]), 1, Ops.MAX], // Reshaped cummax
    ],
    (t, axis, op) => t._cumalu(axis, op),
    'out(data[0]._cumalu(*data[1:]))',
  ),
)

describe(
  'Tensor.transpose',
  compare<[Tensor, number, number]>(
    [
      [Tensor.full([8], 1), 0, -1],
      [new Tensor([[3, 3, 3, 3], [3, 3, 3, 3]]), 0, -1],
    ],
    (t, dim0, dim1) => t.transpose(dim0, dim1),
    'out(data[0].transpose(*data[1:]))',
  ),
)

describe(
  'Tensor._threefry_random_bits',
  compare<[Tensor, Tensor, Tensor]>(
    [
      [
        new Tensor([347607321, 1735991813]),
        new Tensor([0, 1, 2, 3, 4, 5, 6, 7]),
        new Tensor([8, 9, 10, 11, 12, 13, 14, 15]),
      ],
    ],
    Tensor._threefry_random_bits,
    'out(tiny.Tensor._threefry_random_bits(*data))',
    { skip: Device.DEFAULT === 'WEBGPU' },
  ),
)

describe(
  'webgpu_failing',
  compare(
    [[]],
    async () => {
      return await new Tensor([true, true, false]).tolist()
    },
    'out(tiny.Tensor([True,True,False]).tolist())',
    { skip: Device.DEFAULT === 'WEBGPU' },
  ),
)

describe(
  'arange.sin',
  compare(
    [
      [0, 1, 2, 28, 29, 30, 32, 64, 128, 256],
    ],
    async (...nums: number[]) => new Tensor(nums).sin(),
    'out(tiny.Tensor(data).sin())',
  ),
)

describe(
  'Tensor.log',
  compare(
    [[1.3]],
    async (val: number) => new Tensor(val).log(),
    'out(tiny.Tensor(data[0]).log())',
  ),
)

import { get_index, IndexContext, lower_load_store, lower_reduce_axis, rewrite_shapetracker_with_index } from '../../jsgrad/codegen/lowerer.ts'
import { dtypes } from '../../jsgrad/dtype.ts'
import { KernelInfo, Ops, UOp } from '../../jsgrad/ops.ts'
import { ClangRenderer } from '../../jsgrad/renderer/cstyle.ts'
import { ShapeTracker } from '../../jsgrad/shape/shapetracker.ts'
import { View } from '../../jsgrad/shape/view.ts'
import { compare } from '../helpers.ts'
import { describe } from 'vitest'

describe(
  'get_index',
  compare(
    [
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([16, 4], [4, 1], 0, undefined, true)]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([16, 4], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([
                new View([200, 4], [4, 1], 0, undefined, true),
              ]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([200, 4], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([
                new View([20000, 1, 3, 1], [3, 0, 1, 0], 0, undefined, true),
              ]),
            ),
            new UOp(Ops.ADD, dtypes.int, [
              new UOp(Ops.REDUCE_AXIS, dtypes.int, [
                new UOp(Ops.WHERE, dtypes.int, [
                  new UOp(Ops.VALID, dtypes.bool, [
                    new UOp(
                      Ops.VIEW,
                      dtypes.void,
                      [],
                      new ShapeTracker([
                        new View([60001, 119999], [0, 0], 0, [[0, 60001], [
                          59999,
                          119999,
                        ]], false),
                        new View(
                          [20000, 15000, 3, 4],
                          [3, 480000, 1, 120000],
                          0,
                          undefined,
                          false,
                        ),
                      ]),
                    ),
                  ], undefined),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                  new UOp(Ops.CONST, dtypes.int, [], 0),
                ], undefined),
              ], [Ops.ADD, [1, 3]]),
              new UOp(Ops.WHERE, dtypes.int, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([
                      new View(
                        [20000, 1, 3, 1],
                        [0, 0, 0, 0],
                        0,
                        undefined,
                        false,
                      ),
                    ]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.int, [], -1),
                new UOp(Ops.CONST, dtypes.int, [], 0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 2, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([], [], 0, undefined, true)]),
            ),
            new UOp(Ops.ADD, dtypes.uint, [
              new UOp(Ops.LOAD, dtypes.uint, [
                new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 1),
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([new View([], [], 0, undefined, true)]),
                ),
              ], undefined),
              new UOp(Ops.WHERE, dtypes.uint, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([new View([], [], 0, undefined, true)]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.uint, [], 32),
                new UOp(Ops.CONST, dtypes.uint, [], 0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([], [], 0, undefined, true)]),
            ),
            new UOp(Ops.ADD, dtypes.float, [
              new UOp(Ops.WHERE, dtypes.float, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([new View([], [], 0, undefined, true)]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.float, [], 1.0),
                new UOp(Ops.CONST, dtypes.float, [], 0.0),
              ], undefined),
              new UOp(Ops.MUL, dtypes.float, [
                new UOp(Ops.LOAD, dtypes.float, [
                  new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 1),
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([new View([], [], 0, undefined, true)]),
                  ),
                ], undefined),
                new UOp(Ops.WHERE, dtypes.float, [
                  new UOp(Ops.VALID, dtypes.bool, [
                    new UOp(
                      Ops.VIEW,
                      dtypes.void,
                      [],
                      new ShapeTracker([new View([], [], 0, undefined, true)]),
                    ),
                  ], undefined),
                  new UOp(Ops.CONST, dtypes.float, [], -1.0),
                  new UOp(Ops.CONST, dtypes.float, [], 0.0),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([10, 1], [1, 0], 0, undefined, true)]),
            ),
            new UOp(Ops.ADD, dtypes.int, [
              new UOp(Ops.REDUCE_AXIS, dtypes.int, [
                new UOp(Ops.WHERE, dtypes.int, [
                  new UOp(Ops.VALID, dtypes.bool, [
                    new UOp(
                      Ops.VIEW,
                      dtypes.void,
                      [],
                      new ShapeTracker([
                        new View(
                          [11, 19],
                          [0, 0],
                          0,
                          [[0, 11], [9, 19]],
                          false,
                        ),
                        new View([10, 10], [1, 20], 0, undefined, false),
                      ]),
                    ),
                  ], undefined),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                  new UOp(Ops.CONST, dtypes.int, [], 0),
                ], undefined),
              ], [Ops.ADD, [1]]),
              new UOp(Ops.WHERE, dtypes.int, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([
                      new View([10, 1], [0, 0], 0, undefined, false),
                    ]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.int, [], -1),
                new UOp(Ops.CONST, dtypes.int, [], 0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([10], [1], 0, undefined, true)]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([new View([10], [0], 0, undefined, false)]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([], [], 0, undefined, true)]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([new View([], [], 0, undefined, true)]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 1.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([
                new View([2, 3, 2, 2], [12, 4, 2, 1], 0, undefined, true),
              ]),
            ),
            new UOp(Ops.LOAD, dtypes.int, [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(), [], 1),
              new UOp(
                Ops.VIEW,
                dtypes.void,
                [],
                new ShapeTracker([
                  new View([2, 3, 2, 2], [4, 1, 8, 1], 0, undefined, false),
                ]),
              ),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
    ],
    get_index,
    'out(tiny.codegen.lowerer.get_index(*data))',
  ),
)

describe(
  'lower_reduce_axis',
  compare(
    [
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 250),
          ], 1),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 250),
          ], 1),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.uchar, [
          new UOp(Ops.LOAD, dtypes.uchar, [
            new UOp(Ops.INDEX, dtypes.uchar.ptr(128000), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.uchar.ptr(128000), [], 1),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.CONST, dtypes.int, [], 0),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 512),
                    ], 0),
                    new UOp(Ops.CONST, dtypes.int, [], 250),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.RANGE, dtypes.int, [
                    new UOp(Ops.CONST, dtypes.int, [], 0),
                    new UOp(Ops.CONST, dtypes.int, [], 250),
                  ], 1),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(5120), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(5120), [], 1),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.CONST, dtypes.int, [], 0),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 512),
                    ], 0),
                    new UOp(Ops.CONST, dtypes.int, [], 10),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
                      0,
                      1,
                      2,
                      3,
                      4,
                      5,
                      6,
                      7,
                      8,
                      9,
                    ]),
                  ], [[1, 10]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.MAX, [1]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 401408),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 401408),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.uchar, [
          new UOp(Ops.LOAD, dtypes.uchar, [
            new UOp(Ops.INDEX, dtypes.uchar.ptr(4014080), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.uchar.ptr(4014080), [], 1),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.CONST, dtypes.int, [], 0),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 401408),
                    ], 0),
                    new UOp(Ops.CONST, dtypes.int, [], 10),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
                      0,
                      1,
                      2,
                      3,
                      4,
                      5,
                      6,
                      7,
                      8,
                      9,
                    ]),
                  ], [[1, 10]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 10),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 10),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.int, [
          new UOp(Ops.WHERE, dtypes.int, [
            new UOp(Ops.MUL, dtypes.bool, [
              new UOp(Ops.CONST, dtypes.bool, [], true),
              new UOp(Ops.CMPNE, dtypes.bool, [
                new UOp(Ops.CMPLT, dtypes.bool, [
                  new UOp(Ops.MOD, dtypes.int, [
                    new UOp(Ops.IDIV, dtypes.int, [
                      new UOp(Ops.ADD, dtypes.int, [
                        new UOp(Ops.ADD, dtypes.int, [
                          new UOp(Ops.CONST, dtypes.int, [], 0),
                          new UOp(Ops.MUL, dtypes.int, [
                            new UOp(Ops.RANGE, dtypes.int, [
                              new UOp(Ops.CONST, dtypes.int, [], 0),
                              new UOp(Ops.CONST, dtypes.int, [], 10),
                            ], 0),
                            new UOp(Ops.CONST, dtypes.int, [], 1),
                          ], undefined),
                        ], undefined),
                        new UOp(Ops.MUL, dtypes.int, [
                          new UOp(Ops.UNROLL, dtypes.int, [
                            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
                              0,
                              1,
                              2,
                              3,
                              4,
                              5,
                              6,
                              7,
                              8,
                              9,
                            ]),
                          ], [[1, 10]]),
                          new UOp(Ops.CONST, dtypes.int, [], 20),
                        ], undefined),
                      ], undefined),
                      new UOp(Ops.CONST, dtypes.int, [], 1),
                    ], undefined),
                    new UOp(Ops.CONST, dtypes.int, [], 19),
                  ], undefined),
                  new UOp(Ops.CONST, dtypes.int, [], 9),
                ], undefined),
                new UOp(Ops.CONST, dtypes.bool, [], true),
              ], undefined),
            ], undefined),
            new UOp(Ops.CONST, dtypes.int, [], 1),
            new UOp(Ops.CONST, dtypes.int, [], 0),
          ], undefined),
        ], [Ops.ADD, [1]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 32),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 32),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(8192), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(8192), [], 1),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.ADD, dtypes.int, [
                    new UOp(Ops.CONST, dtypes.int, [], 0),
                    new UOp(Ops.MUL, dtypes.int, [
                      new UOp(Ops.RANGE, dtypes.int, [
                        new UOp(Ops.CONST, dtypes.int, [], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 32),
                      ], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 256),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 64),
                    ], 1),
                    new UOp(Ops.CONST, dtypes.int, [], 4),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
                  ], [[2, 4]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1, 2]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 32),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 32),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(8192), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(8192), [], 3),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.ADD, dtypes.int, [
                    new UOp(Ops.CONST, dtypes.int, [], 0),
                    new UOp(Ops.MUL, dtypes.int, [
                      new UOp(Ops.RANGE, dtypes.int, [
                        new UOp(Ops.CONST, dtypes.int, [], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 32),
                      ], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 256),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 64),
                    ], 1),
                    new UOp(Ops.CONST, dtypes.int, [], 4),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
                  ], [[2, 4]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1, 2]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(16384), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(16384), [], 3),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.ADD, dtypes.int, [
                    new UOp(Ops.CONST, dtypes.int, [], 0),
                    new UOp(Ops.MUL, dtypes.int, [
                      new UOp(Ops.RANGE, dtypes.int, [
                        new UOp(Ops.CONST, dtypes.int, [], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 64),
                      ], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 256),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 64),
                    ], 1),
                    new UOp(Ops.CONST, dtypes.int, [], 4),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
                  ], [[2, 4]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1, 2]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 10),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 128),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 10),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 128),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(5120), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(5120), [], 3),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.ADD, dtypes.int, [
                    new UOp(Ops.CONST, dtypes.int, [], 0),
                    new UOp(Ops.MUL, dtypes.int, [
                      new UOp(Ops.RANGE, dtypes.int, [
                        new UOp(Ops.CONST, dtypes.int, [], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 10),
                      ], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 1),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 128),
                    ], 1),
                    new UOp(Ops.CONST, dtypes.int, [], 40),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
                  ], [[2, 4]]),
                  new UOp(Ops.CONST, dtypes.int, [], 10),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1, 2]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 256),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 256),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.uint, [
          new UOp(Ops.WHERE, dtypes.uint, [
            new UOp(Ops.MUL, dtypes.bool, [
              new UOp(Ops.CONST, dtypes.bool, [], true),
              new UOp(Ops.CMPNE, dtypes.bool, [
                new UOp(Ops.CMPLT, dtypes.bool, [
                  new UOp(Ops.MOD, dtypes.int, [
                    new UOp(Ops.IDIV, dtypes.int, [
                      new UOp(Ops.ADD, dtypes.int, [
                        new UOp(Ops.ADD, dtypes.int, [
                          new UOp(Ops.ADD, dtypes.int, [
                            new UOp(Ops.CONST, dtypes.int, [], 0),
                            new UOp(Ops.MUL, dtypes.int, [
                              new UOp(Ops.RANGE, dtypes.int, [
                                new UOp(Ops.CONST, dtypes.int, [], 0),
                                new UOp(Ops.CONST, dtypes.int, [], 256),
                              ], 0),
                              new UOp(Ops.CONST, dtypes.int, [], 1),
                            ], undefined),
                          ], undefined),
                          new UOp(Ops.MUL, dtypes.int, [
                            new UOp(Ops.RANGE, dtypes.int, [
                              new UOp(Ops.CONST, dtypes.int, [], 0),
                              new UOp(Ops.CONST, dtypes.int, [], 64),
                            ], 1),
                            new UOp(Ops.CONST, dtypes.int, [], 2048),
                          ], undefined),
                        ], undefined),
                        new UOp(Ops.MUL, dtypes.int, [
                          new UOp(Ops.UNROLL, dtypes.int, [
                            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [
                              0,
                              1,
                              2,
                              3,
                            ]),
                          ], [[2, 4]]),
                          new UOp(Ops.CONST, dtypes.int, [], 512),
                        ], undefined),
                      ], undefined),
                      new UOp(Ops.CONST, dtypes.int, [], 1),
                    ], undefined),
                    new UOp(Ops.CONST, dtypes.int, [], 511),
                  ], undefined),
                  new UOp(Ops.CONST, dtypes.int, [], 255),
                ], undefined),
                new UOp(Ops.CONST, dtypes.bool, [], true),
              ], undefined),
            ], undefined),
            new UOp(Ops.CONST, dtypes.uint, [], 1),
            new UOp(Ops.CONST, dtypes.uint, [], 0),
          ], undefined),
        ], [Ops.ADD, [1, 2]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 6144),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 32),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
          ], [[2, 3]]),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[3, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 6144),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 32),
          ], 1),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
          ], [[2, 3]]),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[3, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(2359296), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(2359296), [], 3),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.ADD, dtypes.int, [
                    new UOp(Ops.ADD, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.MUL, dtypes.int, [
                        new UOp(Ops.RANGE, dtypes.int, [
                          new UOp(Ops.CONST, dtypes.int, [], 0),
                          new UOp(Ops.CONST, dtypes.int, [], 6144),
                        ], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 384),
                      ], undefined),
                    ], undefined),
                    new UOp(Ops.MUL, dtypes.int, [
                      new UOp(Ops.RANGE, dtypes.int, [
                        new UOp(Ops.CONST, dtypes.int, [], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 32),
                      ], 1),
                      new UOp(Ops.CONST, dtypes.int, [], 4),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.UNROLL, dtypes.int, [
                      new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
                    ], [[2, 3]]),
                    new UOp(Ops.CONST, dtypes.int, [], 128),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
                  ], [[3, 4]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1, 3]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 1),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 9),
          ], 2),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[3, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 64),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 1),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 9),
          ], 2),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[3, 4]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.LOAD, dtypes.float, [
            new UOp(Ops.INDEX, dtypes.float.ptr(1179648), [
              new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(1179648), [], 3),
              new UOp(Ops.ADD, dtypes.int, [
                new UOp(Ops.ADD, dtypes.int, [
                  new UOp(Ops.ADD, dtypes.int, [
                    new UOp(Ops.ADD, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.MUL, dtypes.int, [
                        new UOp(Ops.RANGE, dtypes.int, [
                          new UOp(Ops.CONST, dtypes.int, [], 0),
                          new UOp(Ops.CONST, dtypes.int, [], 64),
                        ], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 36),
                      ], undefined),
                    ], undefined),
                    new UOp(Ops.MUL, dtypes.int, [
                      new UOp(Ops.RANGE, dtypes.int, [
                        new UOp(Ops.CONST, dtypes.int, [], 0),
                        new UOp(Ops.CONST, dtypes.int, [], 512),
                      ], 1),
                      new UOp(Ops.CONST, dtypes.int, [], 2304),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.MUL, dtypes.int, [
                    new UOp(Ops.RANGE, dtypes.int, [
                      new UOp(Ops.CONST, dtypes.int, [], 0),
                      new UOp(Ops.CONST, dtypes.int, [], 9),
                    ], 2),
                    new UOp(Ops.CONST, dtypes.int, [], 4),
                  ], undefined),
                ], undefined),
                new UOp(Ops.MUL, dtypes.int, [
                  new UOp(Ops.UNROLL, dtypes.int, [
                    new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
                  ], [[3, 4]]),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                ], undefined),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1, 2, 3]]),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 512),
          ], 0),
          new UOp(Ops.UNROLL, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
            ]),
          ], [[1, 10]]),
        ], 0),
        new UOp(Ops.REDUCE_AXIS, dtypes.float, [
          new UOp(Ops.MUL, dtypes.float, [
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.CONST, dtypes.bool, [], true),
              new UOp(Ops.CONST, dtypes.float, [], -1.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
            new UOp(Ops.MUL, dtypes.float, [
              new UOp(Ops.CAST, dtypes.float, [
                new UOp(Ops.CMPNE, dtypes.bool, [
                  new UOp(Ops.CMPNE, dtypes.bool, [
                    new UOp(Ops.LOAD, dtypes.int, [
                      new UOp(Ops.INDEX, dtypes.int.ptr(512), [
                        new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(512), [], 1),
                        new UOp(Ops.ADD, dtypes.int, [
                          new UOp(Ops.CONST, dtypes.int, [], 0),
                          new UOp(Ops.MUL, dtypes.int, [
                            new UOp(Ops.RANGE, dtypes.int, [
                              new UOp(Ops.CONST, dtypes.int, [], 0),
                              new UOp(Ops.CONST, dtypes.int, [], 512),
                            ], 0),
                            new UOp(Ops.CONST, dtypes.int, [], 1),
                          ], undefined),
                        ], undefined),
                      ], undefined),
                    ], undefined),
                    new UOp(Ops.LOAD, dtypes.int, [
                      new UOp(Ops.INDEX, dtypes.int.ptr(10), [
                        new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(10), [], 2),
                        new UOp(Ops.ADD, dtypes.int, [
                          new UOp(Ops.CONST, dtypes.int, [], 0),
                          new UOp(Ops.MUL, dtypes.int, [
                            new UOp(Ops.UNROLL, dtypes.int, [
                              new UOp(Ops.VCONST, dtypes.int.vec(10), [], [
                                0,
                                1,
                                2,
                                3,
                                4,
                                5,
                                6,
                                7,
                                8,
                                9,
                              ]),
                            ], [[1, 10]]),
                            new UOp(Ops.CONST, dtypes.int, [], 1),
                          ], undefined),
                        ], undefined),
                      ], undefined),
                    ], undefined),
                  ], undefined),
                  new UOp(Ops.WHERE, dtypes.bool, [
                    new UOp(Ops.CONST, dtypes.bool, [], true),
                    new UOp(Ops.CONST, dtypes.bool, [], true),
                    new UOp(Ops.CONST, dtypes.bool, [], false),
                  ], undefined),
                ], undefined),
              ], undefined),
              new UOp(Ops.WHERE, dtypes.float, [
                new UOp(Ops.CONST, dtypes.bool, [], true),
                new UOp(Ops.CONST, dtypes.float, [], -0.001953125),
                new UOp(Ops.CONST, dtypes.float, [], 0.0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], [Ops.ADD, [1]]),
      ],
    ],
    lower_reduce_axis,
    'out(tiny.codegen.lowerer.lower_reduce_axis(*data))',
  ),
)

describe(
  'lower_load_store',
  compare(
    [
      [
        new IndexContext([], [], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([], [], 0, undefined, true)]),
          ),
          new UOp(Ops.BITCAST, dtypes.uint, [
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.CONST, dtypes.bool, [], true),
              new UOp(Ops.CONST, dtypes.float, [], 1.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], undefined),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 1920),
          ], 0),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
          ], [[1, 3]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 1920),
          ], 0),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
          ], [[1, 3]]),
        ], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([1920, 3], [3, 1], 0, undefined, true)]),
          ),
          new UOp(Ops.WHERE, dtypes.float, [
            new UOp(Ops.CONST, dtypes.bool, [], true),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
          ], undefined),
        ], undefined),
      ],
      [
        new IndexContext([], [], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([], [], 0, undefined, true)]),
          ),
          new UOp(Ops.ADD, dtypes.uint, [
            new UOp(Ops.LOAD, dtypes.uint, [
              new UOp(Ops.INDEX, dtypes.uint.ptr(), [
                new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 1),
                new UOp(Ops.CONST, dtypes.int, [], 0),
              ], undefined),
            ], undefined),
            new UOp(Ops.WHERE, dtypes.uint, [
              new UOp(Ops.CONST, dtypes.bool, [], true),
              new UOp(Ops.CONST, dtypes.uint, [], 32),
              new UOp(Ops.CONST, dtypes.uint, [], 0),
            ], undefined),
          ], undefined),
        ], undefined),
      ],
      [
        new IndexContext([], [], 0),
        new UOp(Ops.LOAD, dtypes.uint, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 1),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([], [], 0, undefined, true)]),
          ),
        ], undefined),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 6144),
          ], 0),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
          ], [[1, 3]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 6144),
          ], 0),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(3), [], [0, 1, 2]),
          ], [[1, 3]]),
        ], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([6144, 3], [3, 1], 0, undefined, true)]),
          ),
          new UOp(Ops.WHERE, dtypes.float, [
            new UOp(Ops.CONST, dtypes.bool, [], true),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
          ], undefined),
        ], undefined),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 16),
          ], 0),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[1, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 16),
          ], 0),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[1, 4]]),
        ], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([16, 4], [4, 1], 0, undefined, true)]),
          ),
          new UOp(Ops.WHERE, dtypes.float, [
            new UOp(Ops.CONST, dtypes.bool, [], true),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
          ], undefined),
        ], undefined),
      ],
      [
        new IndexContext([], [], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([], [], 0, undefined, true)]),
          ),
          new UOp(Ops.MUL, dtypes.float, [
            new UOp(Ops.LOAD, dtypes.float, [
              new UOp(Ops.INDEX, dtypes.float.ptr(), [
                new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 1),
                new UOp(Ops.CONST, dtypes.int, [], 0),
              ], undefined),
            ], undefined),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.CONST, dtypes.bool, [], true),
              new UOp(Ops.CONST, dtypes.float, [], 0.9),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], undefined),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 400),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 100),
          ], 1),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 400),
          ], 0),
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 100),
          ], 1),
          new UOp(Ops.EXPAND, dtypes.int, [
            new UOp(Ops.VCONST, dtypes.int.vec(4), [], [0, 1, 2, 3]),
          ], [[2, 4]]),
        ], 1),
        new UOp(Ops.LOAD, dtypes.uint, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 1),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([
              new View([400, 1, 1], [0, 0, 0], 0, undefined, false),
            ]),
          ),
        ], undefined),
      ],
      [
        new IndexContext([
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 10),
          ], 0),
        ], [
          new UOp(Ops.RANGE, dtypes.int, [
            new UOp(Ops.CONST, dtypes.int, [], 0),
            new UOp(Ops.CONST, dtypes.int, [], 10),
          ], 0),
        ], 0),
        new UOp(Ops.STORE, dtypes.void, [
          new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
          new UOp(
            Ops.VIEW,
            dtypes.void,
            [],
            new ShapeTracker([new View([10], [1], 0, undefined, true)]),
          ),
          new UOp(Ops.WHERE, dtypes.float, [
            new UOp(Ops.CONST, dtypes.bool, [], true),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
            new UOp(Ops.CONST, dtypes.float, [], 0.0),
          ], undefined),
        ], undefined),
      ],
    ],
    lower_load_store,
    'out(tiny.codegen.lowerer.lower_load_store(*data))',
  ),
)

describe(
  'rewrite_shapetracker_with_index',
  compare(
    [
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([8, 4], [4, 1], 0, undefined, true)]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([8, 4], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([
                new View([12288, 3], [3, 1], 0, undefined, true),
              ]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([12288, 3], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([], [], 0, undefined, true)]),
            ),
            new UOp(Ops.MUL, dtypes.float, [
              new UOp(Ops.LOAD, dtypes.float, [
                new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 1),
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([new View([], [], 0, undefined, true)]),
                ),
              ], undefined),
              new UOp(Ops.WHERE, dtypes.float, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([new View([], [], 0, undefined, true)]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.float, [], 0.999),
                new UOp(Ops.CONST, dtypes.float, [], 0.0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([], [], 0, undefined, true)]),
            ),
            new UOp(Ops.ADD, dtypes.uint, [
              new UOp(Ops.LOAD, dtypes.uint, [
                new UOp(Ops.DEFINE_GLOBAL, dtypes.uint.ptr(), [], 1),
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([new View([], [], 0, undefined, true)]),
                ),
              ], undefined),
              new UOp(Ops.WHERE, dtypes.uint, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([new View([], [], 0, undefined, true)]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.uint, [], 25600),
                new UOp(Ops.CONST, dtypes.uint, [], 0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([
                new View([6400, 4], [4, 1], 0, undefined, true),
              ]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([6400, 4], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([16, 4], [4, 1], 0, undefined, true)]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([16, 4], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([
                new View([1920, 3], [3, 1], 0, undefined, true),
              ]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([
                    new View([1920, 3], [0, 0], 0, undefined, false),
                  ]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.int.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([10, 1], [1, 0], 0, undefined, true)]),
            ),
            new UOp(Ops.ADD, dtypes.int, [
              new UOp(Ops.REDUCE_AXIS, dtypes.int, [
                new UOp(Ops.WHERE, dtypes.int, [
                  new UOp(Ops.VALID, dtypes.bool, [
                    new UOp(
                      Ops.VIEW,
                      dtypes.void,
                      [],
                      new ShapeTracker([
                        new View(
                          [11, 19],
                          [0, 0],
                          0,
                          [[0, 11], [9, 19]],
                          false,
                        ),
                        new View([10, 10], [1, 20], 0, undefined, false),
                      ]),
                    ),
                  ], undefined),
                  new UOp(Ops.CONST, dtypes.int, [], 1),
                  new UOp(Ops.CONST, dtypes.int, [], 0),
                ], undefined),
              ], [Ops.ADD, [1]]),
              new UOp(Ops.WHERE, dtypes.int, [
                new UOp(Ops.VALID, dtypes.bool, [
                  new UOp(
                    Ops.VIEW,
                    dtypes.void,
                    [],
                    new ShapeTracker([
                      new View([10, 1], [0, 0], 0, undefined, false),
                    ]),
                  ),
                ], undefined),
                new UOp(Ops.CONST, dtypes.int, [], -1),
                new UOp(Ops.CONST, dtypes.int, [], 0),
              ], undefined),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 1, false)),
        new ClangRenderer(),
      ],
      [
        new UOp(Ops.SINK, dtypes.void, [
          new UOp(Ops.STORE, dtypes.void, [
            new UOp(Ops.DEFINE_GLOBAL, dtypes.float.ptr(), [], 0),
            new UOp(
              Ops.VIEW,
              dtypes.void,
              [],
              new ShapeTracker([new View([], [], 0, undefined, true)]),
            ),
            new UOp(Ops.WHERE, dtypes.float, [
              new UOp(Ops.VALID, dtypes.bool, [
                new UOp(
                  Ops.VIEW,
                  dtypes.void,
                  [],
                  new ShapeTracker([new View([], [], 0, undefined, true)]),
                ),
              ], undefined),
              new UOp(Ops.CONST, dtypes.float, [], 1.0),
              new UOp(Ops.CONST, dtypes.float, [], 0.0),
            ], undefined),
          ], undefined),
        ], new KernelInfo(0, 0, false)),
        new ClangRenderer(),
      ],
    ],
    rewrite_shapetracker_with_index,
    'out(tiny.codegen.lowerer.rewrite_shapetracker_with_index(*data))',
  ),
)

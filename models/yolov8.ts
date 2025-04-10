import { BatchNorm2d, Conv2d, env, idiv, type Layer, mul, num, range, Tensor, zip } from '@jsgrad/jsgrad'

// utility functions for forward pass.
const dist2bbox = (distance: Tensor, anchor_points: Tensor, xywh = true, dim = -1) => {
  const [lt, rb] = distance.chunk(2, dim)
  const x1y1 = anchor_points.sub(lt)
  const x2y2 = anchor_points.add(rb)
  if (xywh) {
    const c_xy = x1y1.add(x2y2).div(2)
    const wh = x2y2.sub(x1y1)
    return c_xy.cat([wh], 1)
  }
  return x1y1.cat([x2y2], 1)
}

const make_anchors = (feats: Tensor[], strides: number[], grid_cell_offset = 0.5) => {
  let anchor_points: Tensor[] = [], stride_tensor: Tensor[] = []
  if (feats === undefined) throw new Error()
  for (const [i, stride] of strides.entries()) {
    const [_, __, h, w] = feats[i].shape
    let sx = Tensor.arange(num(w)).add(grid_cell_offset)
    let sy = Tensor.arange(num(h)).add(grid_cell_offset)

    // this is np.meshgrid but in tinygrad
    sx = sx.reshape(1, -1).repeat(h, 1).reshape(-1)
    sy = sy.reshape(-1, 1).repeat(1, w).reshape(-1)

    anchor_points.push(Tensor.stack([sx, sy], -1).reshape(-1, 2))
    stride_tensor.push(Tensor.full([mul(h, w)], stride))
  }
  return [
    anchor_points[0].cat([anchor_points[1], anchor_points[2]]),
    stride_tensor[0].cat([stride_tensor[1], stride_tensor[2]]).unsqueeze(1),
  ]
}

// this function is from the original implementation
const autopad = (k: number | number[], p?: number | number[], d = 1) => { // kernel, padding, dilation
  if (d > 1) {
    k = typeof k === 'number' ? d * (k - 1) + 1 : k.map((x) => d * (x - 1) + 1) // actual kernel-size
  }
  if (p === undefined) {
    p = typeof k === 'number' ? idiv(k, 2) : k.map((x) => idiv(x, 2)) // auto-pad
  }
  return p
}

export const get_variant_multiples = (variant: string) => {
  return { 'n': [0.33, 0.25, 2.0], 's': [0.33, 0.50, 2.0], 'm': [0.67, 0.75, 1.5], 'l': [1.0, 1.0, 1.0], 'x': [1, 1.25, 1.0] }[variant]
}

//this is taken from https://github.com/tinygrad/tinygrad/pull/784/files by dc-dc-dc (Now 2 models use upsampling)
class Upsample {
  constructor(public scale_factor: number, public mode: 'nearest' = 'nearest') {
  }
  call = (x: Tensor) => {
    if (!(x.shape.length > 2 && x.shape.length <= 5)) throw new Error()
    const [b, c] = x.shape.slice(0, 2), _lens = x.shape.slice(2).length
    const tmp = x.reshape(b, c, -1, ...range(_lens).map(() => 1)).mul(Tensor.ones([1, 1, 1, ...range(_lens).map(() => this.scale_factor)]))
    return tmp.reshape(...x.shape, ...range(_lens).map(() => this.scale_factor)).permute(0, 1, ...([] as number[]).concat(...range(_lens).map((y) => [y + 2, y + 2 + _lens]))).reshape(b, c, ...x.shape.slice(2).map((x) => num(x) * this.scale_factor))
  }
}
class Conv_Block {
  conv: Conv2d
  bn: BatchNorm2d
  constructor(c1: number, c2: number, kernel_size: number | number[] = 1, stride = 1, groups = 1, dilation = 1, padding?: number) {
    this.conv = new Conv2d(c1, c2, kernel_size, stride, autopad(kernel_size, padding, dilation), dilation, groups, false)
    this.bn = new BatchNorm2d(c2, 0.001)
  }
  call = (x: Tensor) => this.bn.call(this.conv.call(x)).silu()
}
class Bottleneck {
  cv1: Conv_Block
  cv2: Conv_Block
  residual: boolean
  constructor(c1: number, c2: number, shortcut: boolean, g = 1, kernels: number[] | number[][] = [3, 3], channel_factor = 0.5) {
    const c_ = Math.trunc(c2 * channel_factor)
    this.cv1 = new Conv_Block(c1, c_, kernels[0], 1)
    this.cv2 = new Conv_Block(c_, c2, kernels[1], 1, g)
    this.residual = c1 === c2 && shortcut
  }
  call = (x: Tensor) => this.residual ? x.add(this.cv2.call(this.cv1.call(x))) : this.cv2.call(this.cv1.call(x))
}
class C2f {
  c: number
  cv1: Conv_Block
  cv2: Conv_Block
  bottleneck: Bottleneck[]
  constructor(c1: number, c2: number, n = 1, shortcut = false, g = 1, e = 0.5) {
    this.c = Math.trunc(c2 * e)
    this.cv1 = new Conv_Block(c1, 2 * this.c, 1)
    this.cv2 = new Conv_Block((2 + n) * this.c, c2, 1)
    this.bottleneck = range(n).map(() => new Bottleneck(this.c, this.c, shortcut, g, [[3, 3], [3, 3]], 1.0))
  }

  call = (x: Tensor) => {
    let y = this.cv1.call(x).chunk(2, 1)
    y.push(...this.bottleneck.map((m) => m.call(y.at(-1)!)))
    let z = y[0]
    for (const i of y.slice(1)) z = z.cat([i], 1)
    return this.cv2.call(z)
  }
}
class SPPF {
  cv1: Conv_Block
  cv2: Conv_Block
  maxpool: (x: Tensor) => Tensor
  constructor(c1: number, c2: number, k = 5) {
    const c_ = idiv(c1, 2) // hidden channels
    this.cv1 = new Conv_Block(c1, c_, 1, 1)
    this.cv2 = new Conv_Block(c_ * 4, c2, 1, 1)

    // TODO: this pads with 0s, whereas torch function pads with -infinity. This results in a < 2% difference in prediction which does not make a difference visually.
    this.maxpool = (x: Tensor) => x.pad([idiv(k, 2), idiv(k, 2), idiv(k, 2), idiv(k, 2)]).max_pool2d(k, 1)
  }
  call = (x: Tensor) => {
    x = this.cv1.call(x)
    const x2 = this.maxpool(x)
    const x3 = this.maxpool(x2)
    const x4 = this.maxpool(x3)
    return this.cv2.call(x.cat([x2, x3, x4], 1))
  }
}
class DFL {
  conv: Conv2d
  constructor(public c1 = 16) {
    this.conv = new Conv2d(c1, 1, 1, undefined, undefined, undefined, undefined, false)
    const x = Tensor.arange(c1)
    this.conv.weight.replace(x.reshape(1, c1, 1, 1))
  }

  call = (x: Tensor) => {
    const [b, c, a] = x.shape // batch, channels, anchors
    return this.conv.call(x.reshape(b, 4, this.c1, a).transpose(2, 1).softmax(1)).reshape(b, 4, a)
  }
}
//backbone
class Darknet {
  b1: Layer[]
  b2: Layer[]
  b3: Layer[]
  b4: Layer[]
  b5: Layer[]
  constructor(w: number, r: number, d: number) {
    this.b1 = [new Conv_Block(3, Math.trunc(64 * w), 3, 2, undefined, undefined, 1), new Conv_Block(Math.trunc(64 * w), Math.trunc(128 * w), 3, 2, undefined, undefined, 1)]
    this.b2 = [new C2f(Math.trunc(128 * w), Math.trunc(128 * w), Math.round(3 * d), true), new Conv_Block(Math.trunc(128 * w), Math.trunc(256 * w), 3, 2, 1), new C2f(Math.trunc(256 * w), Math.trunc(256 * w), Math.round(6 * d), true)]
    this.b3 = [new Conv_Block(Math.trunc(256 * w), Math.trunc(512 * w), 3, 2, undefined, undefined, 1), new C2f(Math.trunc(512 * w), Math.trunc(512 * w), Math.round(6 * d), true)]
    this.b4 = [new Conv_Block(Math.trunc(512 * w), Math.trunc(512 * w * r), 3, 2, undefined, undefined, 1), new C2f(Math.trunc(512 * w * r), Math.trunc(512 * w * r), Math.round(3 * d), true)]
    this.b5 = [new SPPF(Math.trunc(512 * w * r), Math.trunc(512 * w * r), 5)]
  }

  return_modules = () => [...this.b1, ...this.b2, ...this.b3, ...this.b4, ...this.b5]

  call = (x: Tensor): [Tensor, Tensor, Tensor] => {
    const x1 = x.sequential(this.b1)
    const x2 = x1.sequential(this.b2)
    const x3 = x2.sequential(this.b3)
    const x4 = x3.sequential(this.b4)
    const x5 = x4.sequential(this.b5)
    return [x2, x3, x5]
  }
}
//yolo fpn (neck)
class Yolov8NECK {
  up: Upsample
  n1: C2f
  n2: C2f
  n3: Conv_Block
  n4: C2f
  n5: Conv_Block
  n6: C2f
  constructor(w: number, r: number, d: number) { //width_multiple, ratio_multiple, depth_multiple
    this.up = new Upsample(2, 'nearest')
    this.n1 = new C2f(Math.trunc(512 * w * (1 + r)), Math.trunc(512 * w), Math.round(3 * d), false)
    this.n2 = new C2f(Math.trunc(768 * w), Math.trunc(256 * w), Math.round(3 * d), false)
    this.n3 = new Conv_Block(Math.trunc(256 * w), Math.trunc(256 * w), 3, 2, undefined, undefined, 1)
    this.n4 = new C2f(Math.trunc(768 * w), Math.trunc(512 * w), Math.round(3 * d), false)
    this.n5 = new Conv_Block(Math.trunc(512 * w), Math.trunc(512 * w), 3, 2, undefined, undefined, 1)
    this.n6 = new C2f(Math.trunc(512 * w * (1 + r)), Math.trunc(512 * w * r), Math.round(3 * d), false)
  }

  return_modules = () => [this.n1, this.n2, this.n3, this.n4, this.n5, this.n6]

  call = (p3: Tensor, p4: Tensor, p5: Tensor): [Tensor, Tensor, Tensor] => {
    const x = this.n1.call(this.up.call(p5).cat([p4], 1))
    const head_1 = this.n2.call(this.up.call(x).cat([p3], 1))
    const head_2 = this.n4.call(this.n3.call(head_1).cat([x], 1))
    const head_3 = this.n6.call(this.n5.call(head_2).cat([p5], 1))
    return [head_1, head_2, head_3]
  }
}
//task specific head.
class DetectionHead {
  ch: number
  nl: number
  no: number
  stride: number[]
  dfl: DFL
  cv3: Layer[][]
  cv2: Layer[][]
  constructor(public nc = 80, filters: number[] = []) {
    this.ch = 16
    this.nl = filters.length
    this.no = nc + this.ch * 4
    this.stride = [8, 16, 32]
    const c1 = Math.max(filters[0], this.nc)
    const c2 = Math.max((idiv(filters[0], 4), this.ch * 4))
    this.dfl = new DFL(this.ch)
    this.cv3 = filters.map((x) => [new Conv_Block(x, c1, 3), new Conv_Block(c1, c1, 3), new Conv2d(c1, this.nc, 1)])
    this.cv2 = filters.map((x) => [new Conv_Block(x, c2, 3), new Conv_Block(c2, c2, 3), new Conv2d(c2, 4 * this.ch, 1)])
  }

  call = (x: Tensor[]) => {
    for (const i of range(this.nl)) {
      x[i] = x[i].sequential(this.cv2[i]).cat([x[i].sequential(this.cv3[i])], 1)
    }
    const [anchors, strides] = make_anchors(x, this.stride, 0.5).map((x) => x.transpose(0, 1))
    let y = x.map((i) => i.reshape(x[0].shape[0], this.no, -1))
    const x_cat = y[0].cat([y[1], y[2]], 2)
    const box = x_cat.get({}, { to: this.ch * 4 }), cls = x_cat.get({}, { from: this.ch * 4 })
    const dbox = dist2bbox(this.dfl.call(box), anchors.unsqueeze(0), true, 1).mul(strides)
    const z = dbox.cat([cls.sigmoid()], 1)
    return z
  }
}
export class YOLOv8 {
  net: Darknet
  fpn: Yolov8NECK
  head: DetectionHead
  constructor(w: number, r: number, d: number, num_classes: number) { //width_multiple, ratio_multiple, depth_multiple
    this.net = new Darknet(w, r, d)
    this.fpn = new Yolov8NECK(w, r, d)
    this.head = new DetectionHead(num_classes, [Math.trunc(256 * w), Math.trunc(512 * w), Math.trunc(512 * w * r)])
  }
  call = (x: Tensor) => {
    let y = this.net.call(x)
    y = this.fpn.call(...y)
    return this.head.call(y)
  }
  return_all_trainable_modules = () => {
    const backbone_modules = range(10)
    const yolov8neck_modules = [12, 15, 16, 18, 19, 21]
    const yolov8_head_weights = [[22, this.head]]
    return [...zip(backbone_modules, this.net.return_modules()), ...zip(yolov8neck_modules, this.fpn.return_modules()), ...yolov8_head_weights]
  }
}

export const get_weights_location = async (yolo_variant: string) => {
  let weights_location = `weights/yolov8${yolo_variant}.safetensors`
  await env.fetchSave(`https://huggingface.co/lmz/candle-yolo-v8/resolve/main/yolov8${yolo_variant}.safetensors`, weights_location)
  return weights_location
}

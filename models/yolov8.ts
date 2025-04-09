import { BatchNorm2d, Conv2d, idiv, type Layer, mul, num, range, Tensor, zip } from '../jsgrad/base.ts'

//Model architecture from https://github.com/ultralytics/ultralytics/issues/189
//The upsampling class has been taken from this pull request https://github.com/tinygrad/tinygrad/pull/784 by dc-dc-dc. Now 2(?) models use upsampling. (retinet and this)

//Pre processing image functions.
// def compute_transform(image, new_shape=(640, 640), auto=False, scaleFill=False, scaleup=True, stride=32) -> Tensor:
//   shape = image.shape[:2]  # current shape [height, width]
//   new_shape = (new_shape, new_shape) if isinstance(new_shape, int) else new_shape
//   r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
//   r = min(r, 1.0) if not scaleup else r
//   new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))
//   dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
//   dw, dh = (np.mod(dw, stride), np.mod(dh, stride)) if auto else (0.0, 0.0)
//   new_unpad = (new_shape[1], new_shape[0]) if scaleFill else new_unpad
//   dw /= 2
//   dh /= 2
//   image = cv2.resize(image, new_unpad, interpolation=cv2.INTER_LINEAR) if shape[::-1] != new_unpad else image
//   top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
//   left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
//   image = cv2.copyMakeBorder(image, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))
//   return Tensor(image)

// def preprocess(im, imgsz=640, model_stride=32, model_pt=True):
//   same_shapes = all(x.shape == im[0].shape for x in im)
//   auto = same_shapes and model_pt
//   im = [compute_transform(x, new_shape=imgsz, auto=auto, stride=model_stride) for x in im]
//   im = Tensor.stack(*im) if len(im) > 1 else im[0].unsqueeze(0)
//   im = im[..., ::-1].permute(0, 3, 1, 2)  # BGR to RGB, BHWC to BCHW, (n, 3, h, w)
//   im = im / 255.0  # 0 - 255 to 0.0 - 1.0
//   return im

// Post Processing functions
// def box_area(box):
//   return (box[:, 2] - box[:, 0]) * (box[:, 3] - box[:, 1])

// def box_iou(box1, box2):
//   lt = np.maximum(box1[:, None, :2], box2[:, :2])
//   rb = np.minimum(box1[:, None, 2:], box2[:, 2:])
//   wh = np.clip(rb - lt, 0, None)
//   inter = wh[:, :, 0] * wh[:, :, 1]
//   area1 = box_area(box1)[:, None]
//   area2 = box_area(box2)[None, :]
//   iou = inter / (area1 + area2 - inter)
//   return iou

// def compute_nms(boxes, scores, iou_threshold):
//   order, keep = scores.argsort()[::-1], []
//   while order.size > 0:
//     i = order[0]
//     keep.append(i)
//     if order.size == 1:
//       break
//     iou = box_iou(boxes[i][None, :], boxes[order[1:]])
//     inds = np.where(np.atleast_1d(iou.squeeze()) <= iou_threshold)[0]
//     order = order[inds + 1]
//   return np.array(keep)

// def non_max_suppression(prediction, conf_thres=0.25, iou_thres=0.45, agnostic=False, max_det=300, nc=0, max_wh=7680):
//   prediction = prediction[0] if isinstance(prediction, (list, tuple)) else prediction
//   bs, nc = prediction.shape[0], nc or (prediction.shape[1] - 4)
//   xc = np.amax(prediction[:, 4:4 + nc], axis=1) > conf_thres
//   nm = prediction.shape[1] - nc - 4
//   output = [np.zeros((0, 6 + nm))] * bs

//   for xi, x in enumerate(prediction):
//     x = x.swapaxes(0, -1)[xc[xi]]
//     if not x.shape[0]: continue
//     box, cls, mask = np.split(x, [4, 4 + nc], axis=1)
//     conf, j = np.max(cls, axis=1, keepdims=True), np.argmax(cls, axis=1, keepdims=True)
//     x = np.concatenate((xywh2xyxy(box), conf, j.astype(np.float32), mask), axis=1)
//     x = x[conf.ravel() > conf_thres]
//     if not x.shape[0]: continue
//     x = x[np.argsort(-x[:, 4])]
//     c = x[:, 5:6] * (0 if agnostic else max_wh)
//     boxes, scores = x[:, :4] + c, x[:, 4]
//     i = compute_nms(boxes, scores, iou_thres)[:max_det]
//     output[xi] = x[i]
//   return output

// def postprocess(preds, img, orig_imgs):
//   print('copying to CPU now for post processing')
//   #if you are on CPU, this causes an overflow runtime error. doesn't "seem" to make any difference in the predictions though.
//   # TODO: make non_max_suppression in tinygrad - to make this faster
//   preds = preds.numpy() if isinstance(preds, Tensor) else preds
//   preds = non_max_suppression(prediction=preds, conf_thres=0.25, iou_thres=0.7, agnostic=False, max_det=300)
//   all_preds = []
//   for i, pred in enumerate(preds):
//     orig_img = orig_imgs[i] if isinstance(orig_imgs, list) else orig_imgs
//     if not isinstance(orig_imgs, Tensor):
//       pred[:, :4] = scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
//       all_preds.append(pred)
//   return all_preds

// def draw_bounding_boxes_and_save(orig_img_paths, output_img_paths, all_predictions, class_labels, iou_threshold=0.5):
//   color_dict = {label: tuple((((i+1) * 50) % 256, ((i+1) * 100) % 256, ((i+1) * 150) % 256)) for i, label in enumerate(class_labels)}
//   font = cv2.FONT_HERSHEY_SIMPLEX

//   def is_bright_color(color):
//     r, g, b = color
//     brightness = (r * 299 + g * 587 + b * 114) / 1000
//     return brightness > 127

//   for img_idx, (orig_img_path, output_img_path, predictions) in enumerate(zip(orig_img_paths, output_img_paths, all_predictions)):
//     predictions = np.array(predictions)
//     orig_img = cv2.imread(orig_img_path) if not isinstance(orig_img_path, np.ndarray) else cv2.imdecode(orig_img_path, 1)
//     height, width, _ = orig_img.shape
//     box_thickness = int((height + width) / 400)
//     font_scale = (height + width) / 2500

//     grouped_preds = defaultdict(list)
//     object_count = defaultdict(int)

//     for pred_np in predictions:
//       grouped_preds[int(pred_np[-1])].append(pred_np)

//     def draw_box_and_label(pred, color):
//       x1, y1, x2, y2, conf, _ = pred
//       x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
//       cv2.rectangle(orig_img, (x1, y1), (x2, y2), color, box_thickness)
//       label = f"{class_labels[class_id]} {conf:.2f}"
//       text_size, _ = cv2.getTextSize(label, font, font_scale, 1)
//       label_y, bg_y = (y1 - 4, y1 - text_size[1] - 4) if y1 - text_size[1] - 4 > 0 else (y1 + text_size[1], y1)
//       cv2.rectangle(orig_img, (x1, bg_y), (x1 + text_size[0], bg_y + text_size[1]), color, -1)
//       font_color = (0, 0, 0) if is_bright_color(color) else (255, 255, 255)
//       cv2.putText(orig_img, label, (x1, label_y), font, font_scale, font_color, 1, cv2.LINE_AA)

//     for class_id, pred_list in grouped_preds.items():
//       pred_list = np.array(pred_list)
//       while len(pred_list) > 0:
//         max_conf_idx = np.argmax(pred_list[:, 4])
//         max_conf_pred = pred_list[max_conf_idx]
//         pred_list = np.delete(pred_list, max_conf_idx, axis=0)
//         color = color_dict[class_labels[class_id]]
//         draw_box_and_label(max_conf_pred, color)
//         object_count[class_labels[class_id]] += 1
//         iou_scores = box_iou(np.array([max_conf_pred[:4]]), pred_list[:, :4])
//         low_iou_indices = np.where(iou_scores[0] < iou_threshold)[0]
//         pred_list = pred_list[low_iou_indices]
//         for low_conf_pred in pred_list:
//           draw_box_and_label(low_conf_pred, color)

//     print(f"Image {img_idx + 1}:")
//     print("Objects detected:")
//     for obj, count in object_count.items():
//       print(f"- {obj}: {count}")

//     cv2.imwrite(output_img_path, orig_img)
//     print(f'saved detections at {output_img_path}')

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
    sx = sx.reshape(1, -1).repeat([h, 1]).reshape(-1)
    sy = sy.reshape(-1, 1).repeat([1, w]).reshape(-1)

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

// def clip_boxes(boxes, shape):
//   boxes[..., [0, 2]] = np.clip(boxes[..., [0, 2]], 0, shape[1])  # x1, x2
//   boxes[..., [1, 3]] = np.clip(boxes[..., [1, 3]], 0, shape[0])  # y1, y2
//   return boxes

// def scale_boxes(img1_shape, boxes, img0_shape, ratio_pad=None):
//   gain = ratio_pad if ratio_pad else min(img1_shape[0] / img0_shape[0], img1_shape[1] / img0_shape[1])
//   pad = ((img1_shape[1] - img0_shape[1] * gain) / 2, (img1_shape[0] - img0_shape[0] * gain) / 2)
//   boxes_np = boxes.numpy() if isinstance(boxes, Tensor) else boxes
//   boxes_np[..., [0, 2]] -= pad[0]
//   boxes_np[..., [1, 3]] -= pad[1]
//   boxes_np[..., :4] /= gain
//   boxes_np = clip_boxes(boxes_np, img0_shape)
//   return boxes_np

// def xywh2xyxy(x):
//   xy = x[..., :2]  # center x, y
//   wh = x[..., 2:4]  # width, height
//   xy1 = xy - wh / 2  # top left x, y
//   xy2 = xy + wh / 2  # bottom right x, y
//   result = np.concatenate((xy1, xy2), axis=-1)
//   return Tensor(result) if isinstance(x, Tensor) else result

// def get_variant_multiples(variant):
//   return {'n':(0.33, 0.25, 2.0), 's':(0.33, 0.50, 2.0), 'm':(0.67, 0.75, 1.5), 'l':(1.0, 1.0, 1.0), 'x':(1, 1.25, 1.0) }.get(variant, None)

// def label_predictions(all_predictions):
//   class_index_count = defaultdict(int)
//   for predictions in all_predictions:
//     predictions = np.array(predictions)
//     for pred_np in predictions:
//       class_id = int(pred_np[-1])
//       class_index_count[class_id] += 1

//   return dict(class_index_count)

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
class YOLOv8 {
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
// def convert_f16_safetensor_to_f32(input_file: Path, output_file: Path):
//   with open(input_file, 'rb') as f:
//     metadata_length = int.from_bytes(f.read(8), 'little')
//     metadata = json.loads(f.read(metadata_length).decode())
//     float32_values = np.fromfile(f, dtype=np.float16).astype(np.float32)

//   for v in metadata.values():
//     if v["dtype"] == "F16": v.update({"dtype": "F32", "data_offsets": [offset * 2 for offset in v["data_offsets"]]})

//   with open(output_file, 'wb') as f:
//     new_metadata_bytes = json.dumps(metadata).encode()
//     f.write(len(new_metadata_bytes).to_bytes(8, 'little'))
//     f.write(new_metadata_bytes)
//     float32_values.tofile(f)

// def get_weights_location(yolo_variant: str) -> Path:
//   weights_location = Path(__file__).parents[1] / "weights" / f'yolov8{yolo_variant}.safetensors'
//   fetch(f'https://gitlab.com/r3sist/yolov8_weights/-/raw/master/yolov8{yolo_variant}.safetensors', weights_location)

//   if not is_dtype_supported(dtypes.half):
//     f32_weights = weights_location.with_name(f"{weights_location.stem}_f32.safetensors")
//     if not f32_weights.exists(): convert_f16_safetensor_to_f32(weights_location, f32_weights)
//     weights_location = f32_weights

//   return weights_location

// if __name__ == '__main__':

//   # usage : python3 yolov8.py "image_URL OR image_path" "v8 variant" (optional, n is default)
//   if len(sys.argv) < 2:
//     print("Error: Image URL or path not provided.")
//     sys.exit(1)

//   img_path = sys.argv[1]
//   yolo_variant = sys.argv[2] if len(sys.argv) >= 3 else (print("No variant given, so choosing 'n' as the default. Yolov8 has different variants, you can choose from ['n', 's', 'm', 'l', 'x']") or 'n')
//   print(f'running inference for YOLO version {yolo_variant}')

//   output_folder_path = Path('./outputs_yolov8')
//   output_folder_path.mkdir(parents=True, exist_ok=True)
//   #absolute image path or URL
//   image_location = [np.frombuffer(fetch(img_path).read_bytes(), np.uint8)]
//   image = [cv2.imdecode(image_location[0], 1)]
//   out_paths = [(output_folder_path / f"{Path(img_path).stem}_output{Path(img_path).suffix or '.png'}").as_posix()]
//   if not isinstance(image[0], np.ndarray):
//     print('Error in image loading. Check your image file.')
//     sys.exit(1)
//   pre_processed_image = preprocess(image)

//   # Different YOLOv8 variants use different w , r, and d multiples. For a list , refer to this yaml file (the scales section) https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/models/v8/yolov8.yaml
//   depth, width, ratio = get_variant_multiples(yolo_variant)
//   yolo_infer = YOLOv8(w=width, r=ratio, d=depth, num_classes=80)
//   state_dict = safe_load(get_weights_location(yolo_variant))
//   load_state_dict(yolo_infer, state_dict)

//   st = time.time()
//   predictions = yolo_infer(pre_processed_image)
//   print(f'did inference in {int(round(((time.time() - st) * 1000)))}ms')

//   post_predictions = postprocess(preds=predictions, img=pre_processed_image, orig_imgs=image)

//   #v8 and v3 have same 80 class names for Object Detection
//   class_labels = fetch('https://raw.githubusercontent.com/pjreddie/darknet/master/data/coco.names').read_text().split("\n")

//   draw_bounding_boxes_and_save(orig_img_paths=image_location, output_img_paths=out_paths, all_predictions=post_predictions, class_labels=class_labels)

// TODO for later:
//  1. Fix SPPF minor difference due to maxpool
//  2. AST exp overflow warning while on cpu
//  3. Make NMS faster
//  4. Add video inference and webcam support

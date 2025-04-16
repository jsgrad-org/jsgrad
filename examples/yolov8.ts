/** [](type:markdown) */
/**
# YoloV8
*/
/** [](type:code) */
import { get_weights_location, YOLOv8 } from "@jsgrad/models/yolov8";
import { safe_load, load_state_dict, Tensor, TinyJit, env as jsgradEnv } from "@jsgrad/jsgrad";
import { Image } from "image-js"
import { parseArgs, z } from "@jsgrad/jsgrad/args";

const args = parseArgs({
  image: z.string().default("https://lh7-us.googleusercontent.com/GNVsVvVmCDLtFtqburTWaTQOjXn3N0wLBKXt6BhXO2GG037S9o7xZ7HyPjFcJoWgds1PFKvbHgCCEWTqiB-MR0VFIo7UC7jVEX6t10LD6zPg61YoEAR-NGbA2RJj7dVdYwMH2nsOJY648uXmMlpNiZw"),
  inputSize: z.number().default(416),
  out: z.string().default("out.png")
})

/** [](type:markdown) */
/**
## Helpers
*/
/** [](type:code) */
type Box = [number, number, number, number, string, number];
const iou = (box1: Box, box2: Box) => intersection(box1, box2) / union(box1, box2);

function union(box1: Box, box2: Box) {
  const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
  const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
  const box1_area = (box1_x2 - box1_x1) * (box1_y2 - box1_y1);
  const box2_area = (box2_x2 - box2_x1) * (box2_y2 - box2_y1);
  return box1_area + box2_area - intersection(box1, box2);
}

function intersection(box1: Box, box2: Box) {
  const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
  const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
  const x1 = Math.max(box1_x1, box2_x1);
  const y1 = Math.max(box1_y1, box2_y1);
  const x2 = Math.min(box1_x2, box2_x2);
  const y2 = Math.min(box1_y2, box2_y2);
  return (x2 - x1) * (y2 - y1);
}

const yolo_classes = ["person","bicycle","car","motorcycle","airplane","bus","train","truck","boat","traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat","dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack","umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball","kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket","bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple","sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair","couch","potted plant","bed","dining table","toilet","tv","laptop","mouse","remote","keyboard","cell phone","microwave","oven","toaster","sink","refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush"];

/** [](type:markdown) */
/**
## Loading and inference
*/
/** [](type:code) */
const yolo = new YOLOv8(0.25, 2.0, 0.33, 80);
const state_dict = await safe_load(await get_weights_location("n"));
await load_state_dict(yolo, state_dict);
const net = new TinyJit(async (x: Tensor) => {
  x = x.reshape(1, 3, 416, 416);
  return await yolo.call(x).reshape(-1).realize();
});

const img_width = args.inputSize
const img_height = args.inputSize
const path = await jsgradEnv.fetchSave(args.image)
let img = await Image.load(await jsgradEnv.readFile(path))
img = img.resize({ width: img_width, height: img_height })
const red = []
const green = []
const blue = [];

for (let index = 0; index < img.data.length; index += 4) {
  red.push(img.data[index] / 255.0);
  green.push(img.data[index + 1] / 255.0);
  blue.push(img.data[index + 2] / 255.0);
}
const input = [...red, ...green, ...blue];

const output = await (await net.call(new Tensor(input))).tolist();

/** [](type:markdown) */
/**
## Processing output and saving image
*/
/** [](type:code) */
// Process
let _boxes: Box[] = [];
const numPredictions = Math.pow(args.inputSize / 32, 2) * 21;
for (let index = 0; index < numPredictions; index++) {
  const [class_id, prob] = [...Array(80).keys()].map((col) => [col, output[numPredictions * (col + 4) + index]]).reduce((accum, item) => (item[1] > accum[1] ? item : accum), [0, 0]);

  if (prob < 0.25) continue;
  const label = yolo_classes[class_id];
  const xc = output[index];
  const yc = output[numPredictions + index];
  const w = output[2 * numPredictions + index];
  const h = output[3 * numPredictions + index];
  const x1 = ((xc - w / 2) / args.inputSize) * img_width;
  const y1 = ((yc - h / 2) / args.inputSize) * img_height;
  const x2 = ((xc + w / 2) / args.inputSize) * img_width;
  const y2 = ((yc + h / 2) / args.inputSize) * img_height;
  _boxes.push([x1, y1, x2, y2, label, prob]);
}

_boxes = _boxes.sort((box1, box2) => box2[5] - box1[5]);
const boxes = [];
while (_boxes.length > 0) {
  boxes.push(_boxes[0]);
  _boxes = _boxes.filter((box) => iou(_boxes[0], box) < 0.7);
}

for (const x of boxes){
  img = img.paintPolygon([[x[0],x[1]],[x[0],x[3]],[x[2],x[3]],[x[2],x[1]]])
  img = img.paintLabels([x[4]],[[x[0],x[1]]])
}

if (jsgradEnv.NAME === "web") nb.image(await img.toDataURL())
else await img.save(args.out)


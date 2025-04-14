/** [](type:markdown) */
/**
# jsgrad - Fast and Simple ML for JS

Based on [tinygrad](https://github.com/tinygrad/tinygrad), 0 dependencies, runs in web, Node, Deno and Bun. 

[GitHub](https://github.com/jsgrad-org/jsgrad) (100% open source with MIT licence), [Discord](https://discord.gg/scGGBNe9Ag), [X](https://x.com/jsgrad_org)

*/
/** [](type:markdown) */
/**
## Basic usage

You can install the package with `npm install @jsgrad/jsgrad` or use directly from esm.sh `https://esm.sh/@jsgrad/jsgrad`

...and then use it like this:
*/
/** [](type:code,runOnLoad:true) */
import { Tensor } from '@jsgrad/jsgrad'

const a = new Tensor([1, 2, 3, 4, 5])
const b = new Tensor([6, 7, 8, 9, 10])

console.log(await a.add(b).tolist())

/** [](type:markdown) */
/**
## Runtimes

We are prioritizing supporting web runtimes like WebGPU and WASM at first, but you can still use any tinygrad runtime with CLOUD device.

To change the device to WEBGPU for example, you can run the program with `DEVICE=WEBGPU` flag or set `Device.DEFAULT = "WEBGPU"`.
*/
/** [](type:code) */
import { env } from '@jsgrad/jsgrad'

console.log(`Your current device/browser supports: ${Object.keys(env.DEVICES).join(", ")}`)

/** [](type:code) */
const runtimes = {
  WEBGPU: { chrome: 1, firefox: "with a flag", safari: "with a flag", deno: 1, node:"planned", bun:"planned", tinygrad: 1, },
  CLANG: { deno: 1, node: 1, bun: 1, tinygrad: 1 },
  JS: { chrome: 1, firefox: 1, safari: 1, deno: 1, node: 1, bun: 1, tinygrad: 1 },
  WASM: { chrome: 1, firefox: 1, safari: 1, deno: 1, bun: 1 },
  CLOUD: { chrome: 1, firefox: 1, safari: 1, deno: 1, node: 1, bun: 1, tinygrad: 1 },
  AMD: { tinygrad: 1 },
  METAL: { tinygrad: 1 },
  CUDA: { tinygrad: 1 },
  GPU: { tinygrad: 1 },
  DSP: { tinygrad: 1 },
  HIP: { tinygrad: 1 },
  LLVM: { tinygrad: 1 },
  NV: { tinygrad: 1 },
  QCOM: { tinygrad: 1 },
};
console.log("All supported runtimes:")
console.table(runtimes)

/** [](type:markdown) */
/**
## Inference

With jsgrad you can use the latest AI models everywhere you can run JS.

See our online [Llama 3 1B chat example](/chat), [yolov8 example](/yolo) or Llama 3 code example here:
*/
/** [](type:code) */
import { Llama3 } from "@jsgrad/models/llama3"

const llama3 = await Llama3.load({ size: "1B", quantize: "float16" })

/** [](type:code) */
const res = await llama3.chat({ messages: [{ role: 'user', content: 'Hi!' }] })

console.log(res.message.content, res.usage)

/** [](type:markdown) */
/**
## Training

You can also easily train with jsgrad.

See our [mnist training example](/examples/mnist), [gpt2 training example](/examples/train-gpt2) or see the mnist training example here:
*/
/** [](type:code) */
import { Adam, get_parameters, mnist, TinyJit, Tqdm } from '@jsgrad/jsgrad'
import { MNIST } from '@jsgrad/models/mnist'

const [X_train, Y_train, X_test, Y_test] = await mnist()

const model = new MNIST()
const opt = new Adam(get_parameters(model))

const train_step = new TinyJit(() => Tensor.train(async () => {
  opt.zero_grad()
  const samples = Tensor.randint([512], undefined, X_train.shape_num[0])
  // TODO: fix this on WEBGPU, tracking issue https://github.com/jsgrad-org/jsgrad/issues/66
  const loss = model.call(X_train.get(samples)).sparse_categorical_crossentropy(Y_train.get(samples)).backward()
  await opt.step()
  return loss
}))

const get_test_acc = new TinyJit(() => model.call(X_test).argmax(1).eq(Y_test).mean().mul(100))

let test_acc = NaN
const t = new Tqdm<number>(70)
for (const i of t) {
  const loss = await train_step.call()
  if (i % 10 === 9) test_acc = await get_test_acc.call().then((x) => x.item())
  t.set_description(`loss: ${await loss.item().then((x: any) => x.toFixed(2))}, test_accuracy: ${test_acc.toFixed(2)}`)
}
/** [](type:markdown) */
/**
## CLOUD

Our CLOUD device is compatible with tinygrad CLOUD, 
so you can start a tinygrad CLOUD server, 
set the jsgrad device to CLOUD:https://url-to-your-gpu.com and now the computation runs on any tinygrad runtime on your server.

With CLOUD device you could publish your models as a website and users could bring their own GPU (or buy GPU time) to your site.

*/
/** [](type:code) */
import { vars } from '@jsgrad/jsgrad'

// TODO: update this with demo CLOUD:https://cloud.jsgrad.org device 
await vars.withAsync({ DEVICE: "WEBGPU" }, async () => {
  const a = Tensor.rand([10])
  const b = Tensor.rand([10])
  console.log(a.device, a.shape, await a.matmul(b).tolist())
})
/** [](type:markdown) */
/**
## Notebooks

This page is written in our own web notebook, you can create, share and get more info [here](/notebook). 

*/
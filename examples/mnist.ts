/** [](type:markdown) */
/**
# MNIST training
*/
/** [](type:code) */
import { Adam, get_parameters, GlobalCounters, mnist, Tensor, TinyJit, Tqdm, type Layer,BatchNorm, Conv2d, Linear  } from '@jsgrad/jsgrad'
import { parseArgs, z } from '@jsgrad/jsgrad/args'

const args = parseArgs({
  steps: z.number().default(70).describe('Steps'),
  bs: z.number().default(512).describe('Batch size'),
})

/** [](type:markdown) */
/**
## Loading training data and initializing model
*/
/** [](type:code) */
const [X_train, Y_train, X_test, Y_test] = await mnist(undefined)

class MNIST { 
  layers: Layer[] = [
    new Conv2d(1, 32, 5), Tensor.relu,
    new Conv2d(32, 32, 5), Tensor.relu,
    new BatchNorm(32), Tensor.max_pool2d,
    new Conv2d(32, 64, 3), Tensor.relu,
    new Conv2d(64, 64, 3), Tensor.relu,
    new BatchNorm(64), Tensor.max_pool2d,
    (x) => x.flatten(1), new Linear(576, 10),
  ]
  call = (x: Tensor) => x.sequential(this.layers)
}

const model = new MNIST()

const opt = new Adam(get_parameters(model))

const train_step = new TinyJit(async () => {
  Tensor.training = true
  opt.zero_grad()
  const samples = Tensor.randint([args.bs], undefined, X_train.shape_num[0])
  const loss = model.call(X_train.get(samples)).sparse_categorical_crossentropy(Y_train.get(samples)).backward()
  await opt.step()
  Tensor.training = false
  return loss
})

const get_test_acc = new TinyJit(() => model.call(X_test).argmax(1).eq(Y_test).mean().mul(100))

/** [](type:markdown) */
/**
## Training
*/
/** [](type:code) */
let test_acc = NaN
const t = new Tqdm<number>(args.steps)
for (const i of t) {
  GlobalCounters.reset()
  const loss = await train_step.call()
  if (i % 10 === 9) test_acc = await get_test_acc.call().then((x) => x.item())
  t.set_description(`loss: ${await loss.item().then((x) => x.toFixed(2))}, test_accuracy: ${test_acc.toFixed(2)}`)
}

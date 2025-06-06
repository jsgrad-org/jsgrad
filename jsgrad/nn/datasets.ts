import { range } from '../helpers/helpers.ts'
import { Tensor } from '../tensor.ts'
import { tar_extract } from './state.ts'

export const mnist = async (device = undefined, baseUrl?: string): Promise<[Tensor, Tensor, Tensor, Tensor]> => {
  const base_url = baseUrl || 'https://huggingface.co/datasets/chuuy/greait/resolve/main/'
  const _mnist = (file: string) => Tensor.from_url(base_url + file)
  return await Promise.all([
    _mnist('train-images-idx3-ubyte.gz').then((x) => x.get({ from: 0x10 }).reshape(-1, 1, 28, 28).to(device)),
    _mnist('train-labels-idx1-ubyte.gz').then((x) => x.get({ from: 8 }).to(device)),
    _mnist('t10k-images-idx3-ubyte.gz').then((x) => x.get({ from: 0x10 }).reshape(-1, 1, 28, 28).to(device)),
    _mnist('t10k-labels-idx1-ubyte.gz').then((x) => x.get({ from: 8 }).to(device)),
  ])
}

export const cifar = async (device = undefined) => {
  const tt = tar_extract(await Tensor.from_url('https://www.cs.toronto.edu/~kriz/cifar-10-binary.tar.gz'))
  const train = Tensor.cat(range(1, 6).map((i) => tt[`cifar-10-batches-bin/data_batch_${i}.bin`].reshape(-1, 3073).to(device)))
  const test = tt['cifar-10-batches-bin/test_batch.bin'].reshape(-1, 3073).to(device)
  return [train.get({}, { from: 1 }).reshape(-1, 3, 32, 32), train.get({}, 0), test.get({}, { from: 1 }).reshape(-1, 3, 32, 32), test.get({}, { from: 0 })] as const
}

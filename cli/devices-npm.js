import { env, is_eq, Tensor } from '@jsgrad/jsgrad/node'

for (const device in env.DEVICES) {
  if (['DISK', 'CLOUD', 'NULL'].includes(device)) continue
  await new env.DEVICES[device](device).init()

  const test = await new Tensor([1, 2, 3], { device }).mul(2).tolist()
  if (!is_eq(test, [2, 4, 6])) throw new Error(`Got ${test} instead of [2, 4, 6] with ${device} device`)
  console.log(`Device ${device} success!`)
}

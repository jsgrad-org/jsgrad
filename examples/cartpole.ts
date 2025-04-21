/** [](type:markdown) */
/**
# CartPole

*/
/** [](type:code) */
import { Tensor, Linear, Adam, get_parameters, TinyJit, num, Tqdm, range, zip, sum } from "@jsgrad/jsgrad"

class CartPole {
  gravity = 9.8;
  massCart = 1.0;
  massPole = 0.1;
  length = 0.5;
  forceMag = 10.0;
  tau = 0.02;
  state = [0, 0, 0, 0];
  steps = 0;

  reset = () => {
    this.state = [0, 0, 0, 0];
    this.steps = 0;
    return { observation: this.state, info: {} }; 
  };

  step = (action: number) => {
    let [x, x_dot, theta, theta_dot] = this.state;
    const force = action === 1 ? this.forceMag : -this.forceMag;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    const temp = (force + this.massPole * this.length * theta_dot ** 2 * sinTheta) / (this.massCart + this.massPole);
    const thetaAcc = (this.gravity * sinTheta - cosTheta * temp) / (this.length * (4 / 3 - this.massPole * cosTheta ** 2 / (this.massCart + this.massPole)));
    const xAcc = temp - this.massPole * this.length * thetaAcc * cosTheta / (this.massCart + this.massPole);

    x += this.tau * x_dot;
    x_dot += this.tau * xAcc;
    theta += this.tau * theta_dot;
    theta_dot += this.tau * thetaAcc;

    this.state = [x, x_dot, theta, theta_dot];
    this.steps++;

    const terminated = x < -2.4 || x > 2.4 || theta < -0.209 || theta > 0.209;
    const truncated = this.steps >= 500; 
    const reward = 1.0; 

    return [this.state, reward, terminated, truncated, {} ] as const
  };
}

/** [](type:code) */
const BATCH_SIZE = 256
const ENTROPY_SCALE = 0.0005
const REPLAY_BUFFER_SIZE = 2000
const PPO_EPSILON = 0.2
const HIDDEN_UNITS = 32
const LEARNING_RATE = 1e-2
const TRAIN_STEPS = 5
const EPISODES = 100
const DISCOUNT_FACTOR = 0.99

class ActorCritic{
  l1: Linear
  l2: Linear
  c1: Linear
  c2: Linear
  constructor(in_features:number, out_features:number, hidden_state=HIDDEN_UNITS){
    this.l1 = new Linear(in_features, hidden_state)
    this.l2 = new Linear(hidden_state, out_features)

    this.c1 = new Linear(in_features, hidden_state)
    this.c2 = new Linear(hidden_state, 1)
  }

  call = (obs:Tensor) =>{
    let x = this.l1.call(obs).tanh()
    const act = this.l2.call(x).log_softmax()
    x = this.c1.call(obs).relu()
    return [act, this.c2.call(x)]
  }
  evaluate = async (test_env:CartPole) => {
    let obs = test_env.reset().observation, terminated = false, truncated = false
    let total_rew = 0.0, rew = 0
    while (!terminated && !truncated){
      const act = await model.call(new Tensor(obs))[0].argmax().item();
      [obs, rew, terminated, truncated] = test_env.step(act)
      total_rew += rew
    }
    return total_rew
  }
}

/** [](type:code) */
const env = new CartPole()

const model = new ActorCritic(4,2)
const opt =new Adam(get_parameters(model), LEARNING_RATE)

const train_step = new TinyJit(async (x:Tensor, selected_action:Tensor, reward:Tensor, old_log_dist:Tensor) => {
  Tensor.training = true
  const [log_dist, value] = model.call(x)
  const action_mask = selected_action.reshape(-1, 1).eq(Tensor.arange(num(log_dist.shape[1])).reshape(1, -1).expand(selected_action.shape[0], -1)).float()
  // get real advantage using the value function
  const advantage = reward.reshape(-1, 1).sub(value)
  const masked_advantage = action_mask.mul(advantage.detach())

  // PPO
  const ratios = log_dist.sub(old_log_dist).exp()
  const unclipped_ratio = masked_advantage.mul(ratios)
  const clipped_ratio = masked_advantage.mul(ratios.clip(1-PPO_EPSILON, 1+PPO_EPSILON))
  const action_loss = unclipped_ratio.minimum(clipped_ratio).sum(-1).mean().neg()

  const entropy_loss = log_dist.exp().mul(log_dist).sum(-1).mean()   // this encourages diversity
  const critic_loss = advantage.square().mean()
  opt.zero_grad()
  action_loss.add(entropy_loss.mul(ENTROPY_SCALE)).add(critic_loss).backward()
  opt.step()
  const res = [await action_loss.realize(), await entropy_loss.realize(), await critic_loss.realize()]
  Tensor.training = false
  return res
})

const get_action = new TinyJit(async (obs:Tensor)=>{
  Tensor.no_grad = true
  const ret = await model.call(obs)[0].exp().multinomial().realize()
  Tensor.no_grad = false
  return ret
})

nb.display(`<canvas id="cartpole" width="600" height="400" style="border: 1px solid black;"></canvas>`)
nb.eval(`
window.render = (x, theta) => {
  const canvas = document.getElementById('cartpole');
  const ctx = canvas.getContext('2d');  

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw track
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.lineTo(600, 300);
  ctx.stroke();

  // Draw cart
  const cartX = x * 100 + 300;
  ctx.fillStyle = 'blue';
  ctx.fillRect(cartX - 20, 280, 40, 20);

  // Draw pole
  const poleX = cartX;
  const poleY = 280;
  const poleLength = 100;
  ctx.beginPath();
  ctx.moveTo(poleX, poleY);
  ctx.lineTo(poleX + poleLength * Math.sin(theta), poleY - poleLength * Math.cos(theta));
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 5;
  ctx.stroke();
}
`)

/** [](type:code) */
let st = performance.now(), steps =  0
let Xn:number[][] = [], An:number[] = [], Rn:number[] = []
const t = new Tqdm(EPISODES)
for (const _ of t){
  get_action.reset() // NOTE: if you don't reset the jit here it captures the wrong model on the first run through

  let obs = env.reset().observation
  let rews=[], terminated=false, truncated=false, rew=0
  // NOTE: we don't want to early stop since then the rewards are wrong for the last episode
  while (!terminated && !truncated){
    // pick actions
    // TODO: what's the temperature here?
    const act = await (await get_action.call(new Tensor(obs))).item()

    // save this state action pair
    // TODO: don't use np.copy here on the CPU, what's the tinygrad way to do this and keep on device? need __setitem__ assignment
    Xn.push([...obs])
    An.push(act);

    [obs, rew, terminated, truncated] = env.step(act)
    rews.push(rew)
    nb.eval(`window.render(${env.state[0]}, ${env.state[2]})`)
  }
  steps += rews.length

  // reward to go
  // TODO: move this into tinygrad
  const discounts = range(rews.length).map(i => Math.pow(DISCOUNT_FACTOR, i));
  const mul = (arr1:number[], arr2:number[])=>zip(arr1,arr2).map(([x,y])=>x*y)
  Rn.push(...range(rews.length).map(i=>sum(mul(rews.slice(i), discounts.slice(0, rews.length-i)))))

  Xn = Xn.slice(-REPLAY_BUFFER_SIZE), An = An.slice(-REPLAY_BUFFER_SIZE), Rn = Rn.slice(-REPLAY_BUFFER_SIZE)
  const X= new Tensor(Xn), A = new Tensor(An), R = new  Tensor(Rn)

  // TODO: make this work
  // vsz = Variable("sz", 1, REPLAY_BUFFER_SIZE-1).bind(len(Xn))
  // X, A, R = Tensor(Xn).reshape(vsz, None), Tensor(An).reshape(vsz), Tensor(Rn).reshape(vsz)

  const old_log_dist = model.call(X)[0].detach()   // TODO: could save these instead of recomputing
  let action_loss, entropy_loss, critic_loss
  for (const _ of range(TRAIN_STEPS)){
    const samples = await Tensor.randint([BATCH_SIZE],undefined,num(X.shape[0])).realize();  // TODO: remove the need for this
    // TODO: is this recompiling based on the shape?
    [action_loss, entropy_loss, critic_loss] = await train_step.call(X.get(samples), A.get(samples), R.get(samples), old_log_dist.get(samples))
  }
  t.set_description(`sz: ${Xn.length.toString().padEnd(5)} steps/s: ${(steps/(performance.now()-st)).toFixed(2).padEnd(7)} action_loss: ${(await action_loss!.item()).toFixed(3).padEnd(7)} entropy_loss: ${(await entropy_loss!.item()).toFixed(3).padEnd(7)} critic_loss: ${(await critic_loss!.item()).toFixed(3).padEnd(8)} reward: ${sum(rews).toFixed(2).padEnd(6)}`)
}
const test_rew = await model.evaluate(new CartPole())
console.log(`test reward: ${test_rew}`)

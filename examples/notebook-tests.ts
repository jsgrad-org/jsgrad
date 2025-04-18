/** [](type:markdown) */
/**
# Notebook tests
*/
/** [](type:code,runOnLoad:true) */
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
const a = 5
const b = 55
console.log({a})
console.log({a,b},a,b)
console.error("error",4)
console.table(runtimes)
nb.image("https://picsum.photos/300")
nb.display("<a href='/hi'>click here</a>")
a+b

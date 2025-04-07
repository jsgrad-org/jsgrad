# jsgrad - Fast and Simple ML library for JS

[website](https://jsgrad.org) [docs](https://jsgrad.org/docs) [discord](https://discord.gg/scGGBNe9Ag)

jsgrad is a ML library based on tinygrad, has 0 dependencies and it runs in web, Node, Deno and Bun.

More info and examples: [jsgrad.org](https://jsgrad.org)

# Getting Started

## With hosted esm script ([minimal Llama HTLM example](/llama.html))

```html
<script type="module">
  import { Tensor } from 'https://esm.sh/@jsgrad/jsgrad'

  console.log(await new Tensor([2, 2, 2]).add(5).tolist())
</script>
```

## Install package from npm

Install with:

```bash
# with npm
npm install @jsgrad/jsgrad
# with deno
deno install npm:@jsgrad/jsgrad
# with bun
bun install @jsgrad/jsgrad
```

Use:

```ts
import { Tensor } from '@jsgrad/jsgrad'

console.log(await new Tensor([2, 2, 2]).add(5).tolist())
```

import { setEnv } from './env/index.ts'
import type { WebEnv } from './env/web.ts'

if (typeof Deno !== 'undefined') setEnv(await import('./env/deno.ts').then((x) => new x.DenoEnv()) as WebEnv)
// @ts-ignore Bun
else if (typeof Bun !== 'undefined') setEnv(await import('./env/bun.ts').then((x) => new x.BunEnv()))
else if (typeof window === 'undefined') setEnv(await import('./env/node.ts').then((x) => new x.NodeEnv()) as WebEnv)
else setEnv(await import('./env/web.ts').then((x) => new x.WebEnv()))

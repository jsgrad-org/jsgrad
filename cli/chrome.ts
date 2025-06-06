#!/usr/bin/env -S deno run -A
import { chromium } from 'playwright'
import esbuild from 'esbuild'
import process from 'node:process'
import { string_to_bytes, env } from '@jsgrad/jsgrad'

const FORWARD_ENVS = ['DEBUG', 'D', 'DEVICE', 'JIT', 'BEAM', 'CACHELEVEL', 'TQDM', "HALF"]

const [entry, ...args] = Deno.args
const build = await esbuild.build({
  entryPoints: [entry],
  format: 'esm',
  bundle: true,
  platform: 'browser',
  write: false,
  logLevel: 'error',
  target: ['chrome100'],
  external: ['./jsgrad/env/deno.ts', './jsgrad/env/bun.ts', './jsgrad/env/node.ts'],
  define: {
    'window.cli_args': JSON.stringify(args),
    process: JSON.stringify({
      env: Object.fromEntries(FORWARD_ENVS.map((k) => [k, process.env[k]])),
    }),
  },
})

const code = [`window.nb={display:console.log,image:console.log}`,build.outputFiles[0].text ,'console.log("ASYNC_CODE_COMPLETE")'].join(";\n")

console.log(env.PLATFORM)
const browser = await chromium.launchPersistentContext(`${env.CACHE_DIR}/.playwright`, {
  headless: !process.env.SHOW,
  args: ['--disable-web-security', env.PLATFORM==="linux" ? '--use-angle=vulkan' : undefined, '--enable-unsafe-webgpu', '--enable-features=Vulkan'].filter(Boolean) as string[],
})
const page = await browser.newPage()
await page.goto('https://jsgrad.org') // needed cause indexedDB won't work in about:blank
await page.setContent('<html><body></body></html>')

page.on('pageerror', (e) => {
  console.error(e.stack)
  throw e
})
page.on('dialog', (x) => {
  if (x.type() === 'prompt') x.accept(prompt(x.message())!)
  else throw new Error(`Unhandled dialog: ${x.type()}`)
})
const promise = new Promise<void>((res) => {
  page.on('console', (msg) => {
    const text = msg.text()
    if (text === 'ASYNC_CODE_COMPLETE') return res()
    if (text.includes('\u200B')) {
      Deno.stdout.writeSync(string_to_bytes(text.replace('\u200B', '')))
    } else console.log(text)
  })
})

await page.addScriptTag({ content: code, type: 'module' })

await promise

await browser.close()

import esbuild from 'npm:esbuild'
import ts from 'npm:typescript'

const PATH = './jsgrad/mod.ts'
const MODELS = [...Deno.readDirSync('./models')].filter((x) => x.isFile && x.name !== 'deno.json').map((x) => `./models/${x.name}`)

await Deno.remove('./dist', { recursive: true }).catch(() => {})

// Build node
await esbuild.build({
  entryPoints: [PATH, ...MODELS],
  format: 'esm',
  outdir: 'dist/node',
  bundle: true,
  platform: 'node',
  logLevel: 'error',
  minify: false,
  splitting: true,
  sourcemap: true,
  target: ['esnext'],
  inject: ['./jsgrad/env-node.ts'],
  external: ['bun:ffi', 'bun:sqlite', 'ffi-rs'],
})

// Build web
await esbuild.build({
  entryPoints: [PATH, ...MODELS],
  format: 'esm',
  outdir: 'dist/web',
  bundle: true,
  platform: 'browser',
  logLevel: 'error',
  minify: false,
  splitting: true,
  sourcemap: true,
  target: ['chrome100'],
  inject: ['./jsgrad/env-web.ts'],
})

// tsc
const program = ts.createProgram({
  rootNames: [PATH, ...MODELS],
  options: {
    declaration: true,
    emitDeclarationOnly: true,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    allowImportingTsExtensions: true,
    isolatedModules: true,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    outDir: 'dist/types',
    skipLibCheck: true,
  },
})
const emitResult = program.emit()
if (emitResult.emitSkipped || emitResult.diagnostics.length > 0) throw new Error(`Type declaration generation failed: ${JSON.stringify(emitResult.diagnostics.map((x) => x.messageText))}`)

// if deno.json version is updated then push new version otherwise beta
let version = JSON.parse(await Deno.readTextFile('deno.json')).version
const npmVersion = (await fetch('https://registry.npmjs.org/@jsgrad/jsgrad').then((x) => x.json()))['dist-tags'].latest
const beta = version === npmVersion
if (beta) version = `${version}-beta-${new Date().getTime()}`

// package.json
const jsFile = (entry: string, type: 'web' | 'node') => entry.replace('./', `./${type}/`).replace('.ts', '.js')
const typesFile = (entry: string) => entry.replace('./', './types/').replace('.ts', '.d.ts')
const packageJson = {
  name: '@jsgrad/jsgrad',
  version,
  type: 'module',
  publishConfig: { access: 'public', tag: beta ? 'beta' : 'latest' },
  main: jsFile(PATH, 'node'),
  types: typesFile(PATH),
  exports: {
    '.': {
      default: jsFile(PATH, 'node'),
      node: jsFile(PATH, 'node'),
      browser: jsFile(PATH, 'web'),
      types: typesFile(PATH),
    },
    './node': { default: jsFile(PATH, 'node'), types: typesFile(PATH) },
    './web': { default: jsFile(PATH, 'web'), types: typesFile(PATH) },
    ...Object.fromEntries(MODELS.map((x) => [x.replace('./models/', './').replace('.ts', ''), {
      default: jsFile(x, 'node'),
      node: jsFile(x, 'node'),
      browser: jsFile(x, 'web'),
      types: typesFile(x),
    }])),
  },
}
await Deno.writeTextFile('dist/package.json', JSON.stringify(packageJson, null, 2))
await Deno.copyFile('README.md', 'dist/README.md')

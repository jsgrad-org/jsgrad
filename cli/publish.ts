import { execSync } from 'node:child_process'

await Deno.remove('./dist', { recursive: true }).catch(() => {})

const out = await new Deno.Command(Deno.execPath(), { args: ['npx', 'tsc'] }).output()
if (!out.success) throw new Error(`Failed: ${new TextDecoder().decode(out.stderr)}, out: ${new TextDecoder().decode(out.stdout)}`)

// if deno.json version is updated then push new version otherwise beta
let version = JSON.parse(await Deno.readTextFile('package.json')).version
const npmVersion = (await fetch('https://registry.npmjs.org/@jsgrad/jsgrad').then((x) => x.json()))['dist-tags'].latest
const beta = version === npmVersion
if (beta) version = `${version}-beta-${new Date().getTime()}`

const PACKAGES = ['jsgrad', 'models']
for (const path of PACKAGES) {
  console.log(`Publishing ${path}`)
  // package.json
  const json = JSON.parse(await Deno.readTextFile(`./${path}/package.json`))
  const pack = {
    name: json.name,
    version,
    type: 'module',
  }
  await Deno.writeTextFile(`./dist/${path}/package.json`, JSON.stringify(pack, null, 2))

  // README
  const readme = await Deno.readTextFile(`./README.md`)
  await Deno.writeTextFile(`./dist/${path}/README.md`, readme)

  // Publish
  const res = execSync(`cd dist/${path} && npm publish --tag=${beta ? 'beta' : 'latest'} --access=public`)
  console.log(res)
  console.log(`Published ${path}`)
}

import { describe, expect, test } from "vitest";
import { runCell, transformCode, transformTypescript } from "./runner.ts"

const check = (input: string, output: string) => test(input, () => expect(transformTypescript(input).trim()).toBe(output))
const same = (input:string)=>check(input, input)

const ctx = "globalThis"
const esm = `https://esm.sh`

describe("declaration", () => {

  check(
    'const a = 5', 
    `const a = 5;\n${ctx} = { ...${ctx}, a };`)
  check(
    'const a = 5, b = 77',
    `const a = 5, b = 77;\n${ctx} = { ...${ctx}, a, b };`
  )
  check(
    'const { a, b } = { a: 3, b: 66 }',
    `const { a, b } = { a: 3, b: 66 };\n${ctx} = { ...${ctx}, a, b };`
  )
  check(
    'var [x, y] = [4, 99]',
    `var [x, y] = [4, 99];\n${ctx} = { ...${ctx}, x, y };`
  )
  check(
    'const [c, ...d] = [1, 2, 3, 4, 5]',
    `const [c, ...d] = [1, 2, 3, 4, 5];\n${ctx} = { ...${ctx}, c, d };`
  )
  check(
    'let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 }',
    `let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 };\n${ctx} = { ...${ctx}, e, a, f };`
  )
  check(
    'let { e: x } = { e: 44, a: 1, b: 2, c: 3 }',
    `let { e: x } = { e: 44, a: 1, b: 2, c: 3 };\n${ctx} = { ...${ctx}, x };`
  )
  check(
    'let { e: { a } } = { e: { a: 34 } }',
    `let { e: { a } } = { e: { a: 34 } };\n${ctx} = { ...${ctx}, a };`
  )
  check(
    'let { e = 0 } = {}',
    `let { e = 0 } = {};\n${ctx} = { ...${ctx}, e };`
  )
  check(
    'class Person { a = 4 }',
    `class Person {\n    a = 4;\n}\n${ctx} = { ...${ctx}, Person };`
  )
  check(
    'const add = (x, y) => x + y',
    `const add = (x, y) => x + y;\n${ctx} = { ...${ctx}, add };`
  )
  check(
    'function add(x, y) { let x = 4; }',
    `function add(x, y) { let x = 4; }\n${ctx} = { ...${ctx}, add };`
  )
  check(
    'async function add(x, y) { const b = 4; }',
    `async function add(x, y) { const b = 4; }\n${ctx} = { ...${ctx}, add };`
  )
  check(
    `const User = class {constructor(name) { this.name = name }}`,
    `const User = class {\n    constructor(name) { this.name = name; }\n};\n${ctx} = { ...${ctx}, User };`
  )

  // Should remain the same
  same(`for (const i of [3, 3, 3]) {\n    const a = 5;\n}`)
})

describe("last line console.log",async ()=>{
  check(`(() => { const a = 4; })();`,"console.log((() => { const a = 4; })());")
  check(`const a = 5;\na + b;`,`const a = 5;\n${ctx} = { ...${ctx}, a };\nconsole.log(a + b);`)
  check(`a + (b \n?1\n: 0);`,`console.log(a + (b\n    ? 1\n    : 0));`)
})

describe("imports",async () => {
  check(`import { a, b } from 'package'`, `const { a, b } = await import("${esm}/package");\n${ctx} = { ...${ctx}, a, b };`)
  check(`import * as a from 'package'`, `const a = await import("${esm}/package");\n${ctx} = { ...${ctx}, a };`)

  check(`import a from 'package'`, `const a = await import("${esm}/package").then(x => x.default);\n${ctx} = { ...${ctx}, a };`)
  check(`import { a as b } from 'package'`, `const { a: b } = await import("${esm}/package");\n${ctx} = { ...${ctx}, b };`)
  check(`import { a, type b } from 'package'`, `const { a } = await import("${esm}/package");\n${ctx} = { ...${ctx}, a };`)
  // check(`import type { a, b } from 'package'`, ``)
})

describe("transpiler", async () => {
  const check = (input: string, output: string) => test(input, () => expect(transformCode(input).trim()).toBe(output))
  check(`const a: string = "a"`, `"use strict";\nconst a = "a";\n${ctx} = { ...${ctx}, a };`)
  check(`let a: undefined`, `"use strict";\nlet a;\n${ctx} = { ...${ctx}, a };`)
})

describe("runCell", async () => {
  test("runCell", async () => {
    await runCell(`const a = 7\nconst b = 6`)
    let res = await runCell(`return globalThis.a`)
    expect(res).toBe(7)
  })
})
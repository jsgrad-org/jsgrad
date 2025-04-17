import { describe, expect, test, vi } from "vitest";
import { runCell, transformCode, transformTypescript } from "./runner.ts"

const check = (input: string, output: string) => test(input, () => expect(transformTypescript(input).trim()).toBe(output))
const same = (input:string)=>check(input, input)

const esm = `https://esm.sh`

describe("declaration", () => {

  check(
    'const a = 5', 
    `const a = 5;\nsetGlobal({ a });`)
  check(
    'const a = 5, b = 77',
    `const a = 5, b = 77;\nsetGlobal({ a, b });`
  )
  check(
    'const { a, b } = { a: 3, b: 66 }',
    `const { a, b } = { a: 3, b: 66 };\nsetGlobal({ a, b });`
  )
  check(
    'var [x, y] = [4, 99]',
    `var [x, y] = [4, 99];\nsetGlobal({ x, y });`
  )
  check(
    'const [c, ...d] = [1, 2, 3, 4, 5]',
    `const [c, ...d] = [1, 2, 3, 4, 5];\nsetGlobal({ c, d });`
  )
  check(
    'let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 }',
    `let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 };\nsetGlobal({ e, a, f });`
  )
  check(
    'let { e: x } = { e: 44, a: 1, b: 2, c: 3 }',
    `let { e: x } = { e: 44, a: 1, b: 2, c: 3 };\nsetGlobal({ x });`
  )
  check(
    'let { e: { a } } = { e: { a: 34 } }',
    `let { e: { a } } = { e: { a: 34 } };\nsetGlobal({ a });`
  )
  check(
    'let { e = 0 } = {}',
    `let { e = 0 } = {};\nsetGlobal({ e });`
  )
  check(
    'class Person { a = 4 }',
    `class Person {\n    a = 4;\n}\nsetGlobal({ Person });`
  )
  check(
    'const add = (x, y) => x + y',
    `const add = (x, y) => x + y;\nsetGlobal({ add });`
  )
  check(
    'function add(x, y) { let x = 4; }',
    `function add(x, y) { let x = 4; }\nsetGlobal({ add });`
  )
  check(
    'async function add(x, y) { const b = 4; }',
    `async function add(x, y) { const b = 4; }\nsetGlobal({ add });`
  )
  check(
    `const User = class {constructor(name) { this.name = name }}`,
    `const User = class {\n    constructor(name) { this.name = name; }\n};\nsetGlobal({ User });`
  )

  // Should remain the same
  same(`for (const i of [3, 3, 3]) {\n    const a = 5;\n}`)
})

describe("last line console.log",async ()=>{
  check(`(() => { const a = 4; })();`,"console.log((() => { const a = 4; })());")
  check(`const a = 5;\na + b;`,`const a = 5;\nsetGlobal({ a });\nconsole.log(a + b);`)
  check(`a + (b \n?1\n: 0);`,`console.log(a + (b\n    ? 1\n    : 0));`)
})

describe("imports",async () => {
  check(`import { a, b } from 'package'`, `const { a, b } = await import("${esm}/package");\nsetGlobal({ a, b });`)
  check(`import * as a from 'package'`, `const a = await import("${esm}/package");\nsetGlobal({ a });`)

  check(`import a from 'package'`, `const a = await import("${esm}/package").then(x => x.default);\nsetGlobal({ a });`)
  check(`import { a as b } from 'package'`, `const { a: b } = await import("${esm}/package");\nsetGlobal({ b });`)
  check(`import { a, type b } from 'package'`, `const { a } = await import("${esm}/package");\nsetGlobal({ a });`)
  // check(`import type { a, b } from 'package'`, ``)
})

describe("transpiler", async () => {
  const check = (input: string, output: string) => test(input, () => expect(transformCode(input).trim()).toBe(output))
  check(`const a: string = "a"`, `"use strict";\nconst a = "a";\nsetGlobal({ a });`)
  check(`let a: undefined`, `"use strict";\nlet a;\nsetGlobal({ a });`)
})

describe("runCell", async () => {
  test("runCell", async () => {
    vi.spyOn(console, "log")
    
    let res = await runCell(`const a = 7\nconst b = 6`)

    res = await runCell(`const c = 55;a + c`)
    expect(console.log).lastCalledWith(62)

    res = await runCell(`import { z } from "zod"\nconst schema = z.string()`)

    res = await runCell(`let res = schema.safeParse("hi");res`)
    expect(console.log).lastCalledWith({ success: true, data: "hi" })

    res = await runCell(`return res.data`)
    expect(res).toBe("hi")

    await runCell(`const fn = (a:number, b:number)=> a / b`)

    res = await runCell(`fn(100, 2)`)
    expect(console.log).lastCalledWith(50)

    res = await runCell(`[fn(100, 10), 5]`)
    expect(console.log).lastCalledWith([10,5])

    res = await runCell(`let var1 = 0; var1+=69`)

    res = await runCell(`return var1`)
    expect(res).toBe(69) // TODO: this is wrong it should be 69

    res = await runCell(`var1+=55`)
    expect(console.log).lastCalledWith(55)

    res = await runCell(`var1`)
    expect(console.log).lastCalledWith(55)
  })
})
import { describe, expect, test, vi } from "vitest";
import { runCell, transformCode, transformTypescript } from "./runner.ts"

const check = (input: string, output: string) => test(input, () => expect(transformTypescript(input).trim()).toBe(output))
const same = (input:string)=>check(input, input)

const esm = `https://esm.sh`
const block = (...lines: string[])=>["{",...lines.map(x=>`    ${x}`),"}"].join("\n")
describe("declaration", () => {
  check(
    'const a = 5', 
    block(`const a = 5;`, `setGlobal({ a });`)
  )
  check(
    'const a = 5, b = 77',
    block(`const a = 5, b = 77;`,`setGlobal({ a, b });`)
  )
  check(
    'const { a, b } = { a: 3, b: 66 }',
    block(`const { a, b } = { a: 3, b: 66 };`, `setGlobal({ a, b });`)
  )
  check(
    'var [x, y] = [4, 99]',
    block(`var [x, y] = [4, 99];`, `setGlobal({ x, y });`)
  )
  check(
    'const [c, ...d] = [1, 2, 3, 4, 5]',
    block(`const [c, ...d] = [1, 2, 3, 4, 5];`, `setGlobal({ c, d });`)
  )
  check(
    'let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 }',
    block(`let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 };`, `setGlobal({ e, a, f });`)
  )
  check(
    'let { e: x } = { e: 44, a: 1, b: 2, c: 3 }',
    block(`let { e: x } = { e: 44, a: 1, b: 2, c: 3 };`, `setGlobal({ x });`)
  )
  check(
    'let { e: { a } } = { e: { a: 34 } }',
    block(`let { e: { a } } = { e: { a: 34 } };`, `setGlobal({ a });`)
  )
  check(
    'let { e = 0 } = {}',
    block(`let { e = 0 } = {};`, `setGlobal({ e });`)
  )
  check(
    'class Person { a = 4 }',
    block(`class Person {`, `    a = 4;`, `}`, `setGlobal({ Person });`)
  )
  check(
    'const add = (x, y) => x + y',
    block(`const add = (x, y) => x + y;`, `setGlobal({ add });`)
  )
  check(
    'function add(x, y) { let x = 4; }',
    block(`function add(x, y) { let x = 4; }`, `setGlobal({ add });`)
  )
  check(
    'async function add(x, y) { const b = 4; }',
    block(`async function add(x, y) { const b = 4; }`, `setGlobal({ add });`)
  )
  check(
    `const User = class {constructor(name) { this.name = name }}`,
    block(`const User = class {`, `    constructor(name) { this.name = name; }`, `};`, `setGlobal({ User });`)
  )

  // Should remain the same
  same(`for (const i of [3, 3, 3]) {\n    const a = 5;\n}`)
})

describe("last line console.log",async ()=>{
  check(`(() => { const a = 4; })();`,"console.log((() => { const a = 4; })());")
  check(`const a = 5;\na + b;`,`${block("const a = 5;","setGlobal({ a });")}\nconsole.log(a + b);`)
  check(`a + (b \n?1\n: 0);`,`console.log(a + (b\n    ? 1\n    : 0));`)
})

describe("imports",async () => {
  check(`import { a, b } from 'package'`, block(`const { a, b } = await import("${esm}/package");`,`setGlobal({ a, b });`))
  check(`import * as a from 'package'`, block(`const a = await import("${esm}/package");`,`setGlobal({ a });`))

  check(`import a from 'package'`, block(`const a = await import("${esm}/package").then(x => x.default);`,`setGlobal({ a });`))
  check(`import { a as b } from 'package'`, block(`const { a: b } = await import("${esm}/package");`,`setGlobal({ b });`))
  check(`import { a, type b } from 'package'`, block(`const { a } = await import("${esm}/package");`,`setGlobal({ a });`))
  // check(`import type { a, b } from 'package'`, ``)
})

describe("transpiler", async () => {
  const check = (input: string, output: string) => test(input, () => expect(transformCode(input).trim()).toBe(output))
  check(`const a: string = "a"`, `"use strict";\n${block('const a = "a";','setGlobal({ a });')}`)
  check(`let a: undefined`, `"use strict";\n${block('let a;','setGlobal({ a });')}`)
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
    expect(res).toBe(69)

    res = await runCell(`var1+=55`)
    expect(console.log).lastCalledWith(124)

    res = await runCell(`var1`)
    expect(console.log).lastCalledWith(124)
  })
})
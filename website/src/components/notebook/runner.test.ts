import { describe, expect, test, vi } from "vitest";
import { runCell, transformCode, transformTypescript, type CellOutput } from "./runner.ts"

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
  const ending = "if (__out__ !== undefined)\n        console.log(__out__);"
  check(`(() => { const a = 4; })();`,block("const __out__ = (() => { const a = 4; })();",ending))
  check(`const a = 5;\na + b;`,`${block("const a = 5;","setGlobal({ a });")}\n${block("const __out__ = a + b;",ending)}`)
  check(`a + (b \n?1\n: 0);`,block("const __out__ = a + (b\n        ? 1\n        : 0);", ending))
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
    const onOutput = vi.fn((data:CellOutput) => {})
    const log = (...args:any[]) => ({ type: "console.log", args: JSON.stringify(args) })
    
    let res = await runCell(`const a = 7\nconst b = 6`, onOutput)

    res = await runCell(`const c = 55;\na + c`, onOutput)
    expect(onOutput).lastCalledWith(log(62))

    res = await runCell(`import { z } from "zod"\nconst schema = z.string()`, onOutput)

    res = await runCell(`let res = schema.safeParse("hi");res`, onOutput)
    expect(onOutput).lastCalledWith(log({ success: true, data: "hi" }))

    res = await runCell(`return res.data`, onOutput)
    expect(res).toBe("hi")

    await runCell(`const fn = (a:number, b:number)=> a / b`, onOutput)

    res = await runCell(`fn(100, 2)`, onOutput)
    expect(onOutput).lastCalledWith(log(50))

    res = await runCell(`[fn(100, 10), 5]`, onOutput)
    expect(onOutput).lastCalledWith(log([10,5]))

    res = await runCell(`let var1 = 0; var1+=69`, onOutput)
    expect(onOutput).lastCalledWith(log(69))

    res = await runCell(`return var1`, onOutput)
    expect(res).toBe(69)

    res = await runCell(`var1+=55`, onOutput)
    expect(onOutput).lastCalledWith(log(124))

    res = await runCell(`var1`, onOutput)
    expect(onOutput).lastCalledWith(log(124))
    
    res = await runCell("const idk = 5", onOutput)
    expect(onOutput).lastCalledWith(log(124))

    res = await runCell("nb.display('<p>hi</p>')", onOutput)
    expect(onOutput).lastCalledWith({ type: "display", html: "<p>hi</p>" })

    res = await runCell("nb.image('/img.png')", onOutput)
    expect(onOutput).lastCalledWith({ type: "image", src: "/img.png" })

    res = await runCell("asdfsfdgdfg", onOutput)
    expect(onOutput).lastCalledWith({ type: "error", error: "asdfsfdgdfg is not defined" })

    res = await runCell("console.error('hi')", onOutput)
    expect(onOutput).lastCalledWith({ type: "console.error", args:JSON.stringify(["hi"]) })
  })
})
import { describe, expect, test } from "vitest";
import { transformCode } from "./runner.ts"

describe("declaration", () => {
  const check = (input: string, output: string) => test(input, () => expect(transformCode(input).trim()).toBe(output))

  check(
    'const a = 5', 
    'const a = 5;\nglobalThis.__nb__ = { ...globalThis.__nb__, a };')
  check(
    'const a = 5, b = 77',
    'const a = 5, b = 77;\nglobalThis.__nb__ = { ...globalThis.__nb__, a, b };'
  )
  check(
    'const { a, b } = { a: 3, b: 66 }',
    'const { a, b } = { a: 3, b: 66 };\nglobalThis.__nb__ = { ...globalThis.__nb__, a, b };'
  )
  check(
    'var [x, y] = [4, 99]',
    'var [x, y] = [4, 99];\nglobalThis.__nb__ = { ...globalThis.__nb__, x, y };'
  )
  check(
    'const [c, ...d] = [1, 2, 3, 4, 5]',
    'const [c, ...d] = [1, 2, 3, 4, 5];\nglobalThis.__nb__ = { ...globalThis.__nb__, c, d };'
  )
  check(
    'let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 }',
    'let { e, a, ...f } = { e: 44, a: 1, b: 2, c: 3 };\nglobalThis.__nb__ = { ...globalThis.__nb__, e, a, f };'
  )
  check(
    'let { e: x } = { e: 44, a: 1, b: 2, c: 3 }',
    'let { e: x } = { e: 44, a: 1, b: 2, c: 3 };\nglobalThis.__nb__ = { ...globalThis.__nb__, x };'
  )
  check(
    'let { e: { a } } = { e: { a: 34 } }',
    'let { e: { a } } = { e: { a: 34 } };\nglobalThis.__nb__ = { ...globalThis.__nb__, a };'
  )
  check(
    'let { e = 0 } = {}',
    'let { e = 0 } = {};\nglobalThis.__nb__ = { ...globalThis.__nb__, e };'
  )
  check(
    'class Person { a = 4 }',
    'class Person {\n    a = 4;\n}\nglobalThis.__nb__ = { ...globalThis.__nb__, Person };'
  )
  check(
    'const add = (x, y) => x + y',
    'const add = (x, y) => x + y;\nglobalThis.__nb__ = { ...globalThis.__nb__, add };'
  )
  check(
    'function add(x, y) { let x = 4; }',
    'function add(x, y) { let x = 4; }\nglobalThis.__nb__ = { ...globalThis.__nb__, add };'
  )
  check(
    'async function add(x, y) { const b = 4; }',
    'async function add(x, y) { const b = 4; }\nglobalThis.__nb__ = { ...globalThis.__nb__, add };'
  )
  check(
    `const User = class {constructor(name) { this.name = name }}`,
    'const User = class {\n    constructor(name) { this.name = name; }\n};\nglobalThis.__nb__ = { ...globalThis.__nb__, User };'
  )

  // Should remain the same
  const same = (input:string)=>check(input, input)

  same(`for (const i of [3, 3, 3]) {\n    const a = 5;\n}`)
  same(`() => { const a = 4; };`)
  same(``)

})
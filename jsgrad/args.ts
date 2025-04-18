import { colored } from './helpers/helpers.ts'
import { env } from './env/index.ts'

export abstract class Type<TsType> {
  required = true
  description: string | undefined
  defaultValue: TsType | undefined
  abstract name: string
  abstract _parse: (value: any) => void
  parse = (value: any): TsType => {
    if (typeof value === 'undefined') {
      if (this.defaultValue) value = this.defaultValue
      else if (this.required) throw new Error(`Value is undefined`)
      return value
    }
    this._parse(value)
    return value
  }
  optional = (): Type<TsType | undefined> => {
    this.required = false
    return this as Type<TsType | undefined>
  }
  describe = (str: string) => {
    this.description = str
    return this
  }
  default = (val: TsType) => {
    this.defaultValue = val
    return this
  }
}
export class ZodNumber extends Type<number> {
  name = 'number'
  _parse = (value: any) => {
    if (typeof value !== 'number') throw new Error(`${value} is not number`)
  }
}
export class ZodEnum<T extends string> extends Type<T> {
  name = ''
  constructor(public options: T[]) {
    super()
    this.name = options.join(' | ')
  }
  _parse = (value: any) => {
    if (!this.options.includes(value)) {
      throw new Error(`Invalid enum, received: ${value}, options: ${this.options}`)
    }
  }
}
export class ZodString extends Type<string> {
  name = 'string'
  _parse = (value: any) => {
    if (typeof value !== 'string') throw new Error(`${value} is not string`)
  }
}
export class ZodBoolean extends Type<boolean> {
  name = 'boolean'
  _parse = (value: any) => {
    if (typeof value !== 'boolean') throw new Error(`${value} is not boolean`)
  }
}
export const z = {
  number: () => new ZodNumber(),
  enum: <T extends string>(options: T[]) => new ZodEnum(options),
  string: () => new ZodString(),
  boolean: () => new ZodBoolean(),
}

export type Schema = Record<string, Type<any>>
export type ExtractType<T> = T extends Type<infer U> ? U : never
export type ParsedSchema<T extends Schema> = { [K in keyof T]: ExtractType<T[K]> }
export type ParsingError = { message: string; path: string[] }
export const parse = <T extends Schema>(
  value: any,
  schema: T,
):
  | { success: true; data: ParsedSchema<T> }
  | {
      success: false
      errors: ParsingError[]
    } => {
  const errors: ParsingError[] = []
  if (value === undefined) {
    errors.push({ message: `Can't parse, value is undefined`, path: [] })
  }
  const data: any = {}
  for (const [k, v] of Object.entries(schema)) {
    try {
      data[k] = v.parse(value[k])
      delete value[k]
    } catch (e) {
      if (e instanceof Error) errors.push({ path: [k], message: e.message })
    }
  }
  if (Object.keys(value).length) {
    errors.push({ message: `Unknown args: ${Object.keys(value)}`, path: [] })
  }
  if (errors.length) return { success: false, errors }
  return { success: true, data }
}

const help = (schema: Schema): string => {
  let res = `${schema.description || 'help:'}\n\noptions:\n`
  const lines: string[][] = []
  for (const [k, v] of Object.entries(schema)) {
    lines.push([colored(`--${k}`, 'blue'), colored(v.name, 'green'), `${v.description || ''}${v.defaultValue ? colored(` (default: ${v.defaultValue})`, 'yellow') : v.required ? colored(` (required)`, 'red') : ''}`])
  }
  const maxLengths = lines[0].map((_, i) => Math.max(...lines.map((line) => line[i].length)))
  res += lines.map((line) => line.map((line, i) => line.padEnd(maxLengths[i] + 2)).join('')).join('\n') + '\n'
  return res
}
export const parseArgs = <T extends Schema>(schema: T): ParsedSchema<T> => {
  const args = env.args().join(' ').split('--').filter(Boolean)
  const obj: Record<string, unknown> = {}
  for (const arg of args) {
    const [key, ...values] = arg.split(/[ |=]/),
      value = values.join(' ')

    if (value === 'true' || value === '' || value === undefined) {
      obj[key] = true
    } else if (value === 'false') obj[key] = false
    else if (!isNaN(Number(value))) obj[key] = Number(value)
    else obj[key] = value
  }
  if (obj.help) {
    console.log(help(schema))
    env.exit(1)
  }
  const res = parse(obj, schema)
  if (!res.success) {
    console.log(res.errors.map((x) => colored(`Error with '${x.path.join('.')}': ${x.message}`, 'red')).join('\n') + '\n\n' + help(schema))
    return env.exit(1) as any
  }

  return res.data
}

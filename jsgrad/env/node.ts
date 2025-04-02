import process from 'node:process'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { type Dlopen, type FFICallback, WebEnv } from './web.ts'
import { JS } from '../runtime/ops_js.ts'
import { CLOUD } from '../runtime/ops_cloud.ts'
import { memsize_to_str, random_id, string_to_bytes } from '../helpers/helpers.ts'
import fs from 'node:fs/promises'
import { statSync } from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { CLANG } from '../runtime/ops_clang.ts'
import { exec } from 'node:child_process'
import readline from 'node:readline'
import { DISK } from '../runtime/ops_disk.ts'
import { Tqdm, type TqdmOnProgress } from '../helpers/tqdm.ts'
import { NULL } from '../runtime/ops_null.ts'

export class NodeEnv extends WebEnv {
  override NAME = 'node'
  override CPU_DEVICE = 'JS'
  override PLATFORM = process.platform
  override DEVICES = { CLANG, JS, CLOUD, DISK, NULL }
  override readFile = async (path: string) => new Uint8Array(await fs.readFile(path))
  override writeFile = fs.writeFile
  override remove = fs.unlink
  override realPath = (...paths: string[]) => paths[0].startsWith('/') ? path.resolve(process.cwd(), ...paths) : path.resolve(...paths)
  override stat = fs.stat
  override statSync = statSync
  override writeStdout = (p: string) => process.stdout.write(string_to_bytes(p))
  override tempFile = async () => `/tmp/dg_tmp_${random_id()}`
  override homedir = os.homedir
  override mkdir = async (path: string) => void await fs.mkdir(path, { recursive: true })
  override args = () => process.argv.slice(2)
  override machine = () => os.machine()
  override exit = (code: number) => process.exit(code)
  override exec = async (cmd: string) => {
    return await new Promise<string>((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) reject(stderr)
        else resolve(stdout)
      })
    })
  }
  override dlopen: Dlopen = async (file, args) => {
    const { open, load, DataType, close } = await import('ffi-rs')
    const library = random_id()
    open({ path: file as string, library })

    const ffiType = (type: Deno.NativeType) => {
      if (type === 'pointer') return DataType.U8Array
      if (type === 'i32') return DataType.I32
      throw new Error(`Invalid type ${type}`)
    }
    return {
      symbols: Object.fromEntries(
        Object.entries(args).map(([name, args]: any) => [name, (...inputs: any[]) => {
          load({
            library,
            funcName: name,
            retType: DataType.Void,
            paramsType: args.parameters.map((x: any) => ffiType(x)),
            paramsValue: inputs,
          })
        }]),
      ),
      close: () => close(library),
    }
  }
  override ptr = (buffer: ArrayBuffer): any => new Uint8Array(buffer)
  override ptrToU64 = (ptr: any): bigint => this.notImplemented()
  override u64ToPtr = (u64: bigint): any => this.notImplemented()
  override getCString = (ptr: any): string => this.notImplemented()
  override getArrayBuffer = (ptr: any, byteLength: number, offset?: number): ArrayBuffer => this.notImplemented()
  override callback: FFICallback = () => this.notImplemented()

  override prompt = async (msg: string) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return await new Promise<string>((resolve) =>
      rl.question(msg, (answer) => {
        resolve(answer)
        rl.close()
      })
    )
  }

  override sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest() as Uint8Array

  private db?: DatabaseSync
  private tables: string[] = []
  private db_name = (table: string) => `${table}_${this.DB_VERSION}`
  private get_db = async (): Promise<DatabaseSync> => {
    if (this.db) return this.db
    await this.mkdir(this.CACHE_DIR)
    const { DatabaseSync } = await import('node:sqlite')
    this.db = new DatabaseSync(this.CACHE_DB)
    return this.db
  }
  override disk_get = async (table: string, key: string) => {
    const db = await this.get_db()
    try {
      const row = db.prepare(`SELECT * FROM "${this.db_name(table)}" WHERE key = ?`).get(key) as { value: any | undefined }
      return row?.value
    } catch (e) {
      return undefined
    }
  }
  override disk_put = async (table: string, key: string, value: any) => {
    const valueType = typeof value === 'string' ? 'TEXT' : value instanceof Uint8Array ? 'BLOB' : undefined
    if (!valueType) throw new Error(`Invalid value type ${valueType}`)
    try {
      const db = await this.get_db()
      if (!this.tables.includes(this.db_name(table))) {
        db.exec(`CREATE TABLE IF NOT EXISTS "${this.db_name(table)}"  (key TEXT PRIMARY KEY, value ${valueType});`)
        this.tables.push(this.db_name(table))
      }

      db.prepare(`INSERT INTO "${this.db_name(table)}" (key, value) VALUES (?, ?);`).run(key, value)
    } catch (e) {
      console.error(e)
    }
  }
  // TODO: stream to fs
  override fetchSave = async (url: string, path: string, dir?: string, onProgress?: TqdmOnProgress) => {
    if (dir) {
      path = this.realPath(dir, path)
      await this.mkdir(dir)
    } else path = this.realPath(path)
    if (await this.stat(path).then((x) => x.isFile()).catch(() => undefined)) {
      return path
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    let size = Number(res.headers.get('content-length')), i = 0
    let data: Uint8Array
    if (size) {
      const reader = res.body?.getReader()
      if (!reader) throw new Error('Response body not readable!')
      data = new Uint8Array(size)
      const t = new Tqdm(size, { onProgress, label: `Downloading ${path}`, format: memsize_to_str })
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          data.set(value, i)
          i += value.length
          t.render(i)
        }
      }
      this.writeStdout('\n')
    } else data = new Uint8Array(await res.arrayBuffer())
    await this.writeFile(path, data)
    return path
  }
}

import type { Stats as NodeStats } from 'node:fs'
import { memsize_to_str, vars } from '../helpers/helpers.ts'
import type { Compiled } from '../runtime/allocator.ts'
import { Sha256 } from '../helpers/sha256.js'
import { Tqdm, type TqdmOnProgress } from '../helpers/tqdm.ts'
import { CLOUD } from '../runtime/ops_cloud.ts'
import { JS } from '../runtime/ops_js.ts'
import { WEBGPU } from '../runtime/ops_webgpu.ts'
import { WASM } from '../runtime/ops_wasm.ts'
import { NULL } from '../runtime/ops_null.ts'

export type Stats = Pick<NodeStats, 'isFile' | 'size'>
export type Dlopen = <const S extends Deno.ForeignLibraryInterface>(
  filename: string | URL,
  symbols: S,
) => Deno.DynamicLibrary<S> | Promise<Deno.DynamicLibrary<S>>
export type FFICallback = (
  x: { parameters: Deno.NativeType[]; result: Deno.NativeResultType },
  cb: (...a: any[]) => any,
) => any

// deno-fmt-ignore
export class WebEnv {
  NAME = 'web'
  PLATFORM = 'web'
  CPU_DEVICE: string = 'JS'
  DB_VERSION = 1
  DEVICES:Record<string,typeof Compiled> = { WEBGPU, JS, WASM, CLOUD, NULL }
  get OSX(){ return this.PLATFORM === 'darwin'}
  get WINDOWS(){ return this.PLATFORM === 'win32'}
  get CACHE_DIR (){ return `${vars.get('CACHE_DIR') || vars.get('XDG_CACHE_HOME') || (this.OSX ? `${this.homedir()}/Library/Caches` : `${this.homedir()}/.cache`)}/jsgrad` }
  get CACHE_DB (){return vars.get('CACHE_DB') || `${this.CACHE_DIR}/jsgrad.db` }

  notImplemented = () => {
    throw new Error(`This feature is not available in ${this.NAME} environment`)
  }

  // FS
  readTextFile = async (path: string): Promise<string> => new TextDecoder().decode(await this.readFile(path))
  writeTextFile = async (path: string, data: string) => await this.writeFile(path, new TextEncoder().encode(data))

  private _cache = async () => await caches.open("jsgrad")
  readFile = async (path: string): Promise<Uint8Array> => {
    const cache = await this._cache()
    const res = await cache.match(path)
    return new Uint8Array(await res!.arrayBuffer())
  }
  writeFile = async (path: string, data: Uint8Array): Promise<void> => {
    const cache = await this._cache()
    await cache.put(path, new Response(data))
  }
  remove = async (path: string): Promise<void> => {
    const cache = await this._cache()
    await cache.delete(path)
  }
  realPath =  (...paths: string[]): string =>paths.filter(Boolean).join("/")
  stat = async (path: string): Promise<Stats> => {
    const res = await this.readFile(path)
    return { isFile: ()=>!!res, size:res.length }
  }
  statSync = (path: string): Stats => this.notImplemented()
  tempFile = async (): Promise<string> => `/tmp/${(Math.random() * 100000000).toFixed(0)}`
  mkdir = async (path:string): Promise<void> => {}
  fetchSave = async (url: string, path: string, dir?: string, onProgress?: TqdmOnProgress) => {
    path = this.realPath(dir || '', path)
    const cache = await this._cache()
    const cached = await cache.match(path)
    if (cached) {
      if (vars.DEBUG >= 2) console.log(`Cache hit for ${path}`)
      onProgress?.({ label: `Loading ${path} from cache`, i: 1, size: 1 });
      return path
    }
     if (vars.DEBUG >= 1) console.log(`Cache miss for ${path}, fetching ${url}`)

    const t = new Tqdm(1, { onProgress, label: `Downloading ${path}`, format: (v) => '' });
    t.render(0); // Indicate start

    const res = await fetch(url)
    if (!res.ok) {
        t.render(1); // Ensure progress visually completes on error
        this.writeStdout("\n");
        throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`)
    }

    // --- Read the entire response into an ArrayBuffer ---
    // This is more reliable in browsers where Content-Length might be inaccurate (e.g., for gzipped content)
    let data: Uint8Array;
    try {
        const buffer = await res.arrayBuffer();
        data = new Uint8Array(buffer);
    } catch (e) {
        t.render(1); // Ensure progress visually completes on error
        this.writeStdout("\n");
        console.error(`Error reading arrayBuffer for ${url}:`, e);
        throw new Error(`Failed to read response body for ${url}`);
    }
    // --- End of modification ---

    t.render(1); // Mark progress as complete
    this.writeStdout("\n");

    // Write the complete data to cache
    try {
        await this.writeFile(path, data);
        if (vars.DEBUG >= 1) console.log(`Successfully fetched and saved ${path}`);
    } catch(e) {
         console.error(`Error writing file ${path} to cache:`, e);
         // Decide if you want to re-throw or just warn
         // throw new Error(`Failed to write downloaded file to cache: ${path}`);
    }

    return path
  }

  // SYSTEM
  writeStdout = (p:string) => console.log(p+'\u200B')
  homedir = () => '/home'
  gunzip = async (res:Response):Promise<ArrayBuffer> => await new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  args = (): string[] => (window as any).args || []
  machine = () => "browser"
  exit = (code: number):never => {
    throw new Error(`Exited with status code ${code}`)
  }
  exec = (cmd:string): Promise<string> => this.notImplemented()
  prompt = async (msg:string, def?: string) => prompt(msg, def)
  sha256 = (data: Uint8Array): Uint8Array => new Uint8Array(new Sha256().update(data)!.arrayBuffer())

  // FFI
  dlopen: Dlopen = () => this.notImplemented()
  ptr = (buffer: ArrayBuffer, offset?:number): any => this.notImplemented()
  ptrToU64 = (ptr:any): bigint => this.notImplemented()
  u64ToPtr = (u64:bigint):any =>this.notImplemented()
  getCString = (ptr:any):string => this.notImplemented()
  getArrayBuffer = (ptr: any, byteLength: number, offset?: number):ArrayBuffer => this.notImplemented()
  callback: FFICallback = (x, cb): any => this.notImplemented()

  // STORAGE
  private _db: IDBDatabase | undefined = undefined
  private _open_db = async (): Promise<IDBDatabase> => {
    if (this._db) return this._db
    this._db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('jsgrad', this.DB_VERSION)
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        db.createObjectStore('jsgrad', { keyPath: 'key' })
      }
      req.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result)
      req.onerror = () => reject(req.error)
    })
    return this._db
  }
  disk_get = async (table: string, key: string): Promise<any | undefined> => {
    const db = await this._open_db()
    const transaction = db.transaction(['jsgrad'], 'readonly')
    const store = transaction.objectStore('jsgrad')
    const request = store.get(`${table}_${key}`)

    return await new Promise<any | undefined>((resolve, reject) => {
      request.onsuccess = () => {
        const data = request.result
        resolve(data ? data.value : undefined)
      }
      request.onerror = () => reject(request.error)
    })
  }
  disk_put = async (table: string, key: string, value: string | Uint8Array) => {
    const db = await this._open_db()
    const transaction = db.transaction(['jsgrad'], 'readwrite')
    const store = transaction.objectStore('jsgrad')
    const request = store.put({ key: `${table}_${key}`, value })

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

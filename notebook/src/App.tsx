import { createContext, type ReactNode, useContext, useRef, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri, Range, KeyMod, KeyCode } from 'monaco-editor'
import { useEffect } from 'react'
import { CodeIcon, Loader2Icon, PlayIcon, TextIcon, type LucideIcon } from 'lucide-react'
import { Console, Hook, Unhook } from 'console-feed'
import { marked } from 'marked'
import ts from 'typescript'

const CELL_TYPES = ['code', 'markdown']
const NOTEBOOK = Uri.file('notebook.ts')
type PackageFile = { type: 'directory'; name: string; files: PackageFile[] } | { type: 'file'; name: string; hash: string; size: number }
type PackageInfo = {
  name: string
  version: string
  files: PackageFile[]
}

const pattern = /\/\*\*\s*\[\]\((.*?)\)\s*\*\//

const codeToCells = (lines: string[]): Cell[] => {
  const out: Cell[] = []
  let cell: Cell | undefined
  let currentLines: string[] = []
  const push = () => {
    if (cell!.type === 'markdown') currentLines = currentLines.join('\n').trim().split('\n').slice(1, -1)
    out.push({ ...cell!, content: currentLines.join('\n') })
  }

  for (const line of lines) {
    const match = line.match(pattern)
    if (match) {
      if (cell) push()
      currentLines = []
      cell = Object.fromEntries(match[1].split(',').map((x) => x.split(':').map((x) => x.trim()))) as Cell
      if (!CELL_TYPES.includes(cell.type)) throw new Error(`Invalid cell type ${cell.type}`)
    } else {
      currentLines.push(line)
    }
  }
  if (cell) push()
  return out
}

type CellType = 'code' | 'markdown'
type Cell = {
  type: CellType
  runOnLoad?: 'true'
  content: string
}
type Notebook = {
  cells: Cell[]
  setCells: React.Dispatch<React.SetStateAction<Cell[]>>
  queue: number[]
  setQueue: React.Dispatch<React.SetStateAction<number[]>>
  isRunning: boolean
  cellIsRunning: Record<number, boolean>
  cellLogs: Record<number, any[]>
}

const NotebookContext = createContext<Notebook | undefined>(undefined)

export const NotebookProvider = ({ code, children }: { children: ReactNode; code: string }) => {
  const [cells, setCells] = useState(() => codeToCells(code.split('\n')))
  const [queue, setQueue] = useState<number[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [cellLogs, setCellLogs] = useState<Record<number, any[]>>({})
  const [cellIsRunning, setCellIsRunning] = useState<Record<number, boolean>>({})
  useEffect(() => {
    setQueue([...cells.entries()].filter(([_, x]) => x.runOnLoad).map(([i]) => i))
  }, [])
  useEffect(() => {
    if (isRunning || !queue.length) return

    const next = queue.shift()!
    run(next)
  }, [queue, isRunning])

  const run = async (index: number) => {
    if (isRunning) return

    const cell = cells[index]
    if (!cell || cell.type !== 'code') return

    setIsRunning(true)
    setCellIsRunning((x) => ({ ...x, [index]: true }))
    setCellLogs((x) => ({ ...x, [index]: [] }))

    const hookedConsole = Hook(window.console, (log) => setCellLogs((x) => ({ ...x, [index]: [...(x[index] || []), log] })), false)

    await runJS(cell.content)

    setIsRunning(false)
    setCellIsRunning((x) => ({ ...x, [index]: false }))

    void Unhook(hookedConsole)
  }
  return <NotebookContext.Provider value={{ cells, setCells, queue, setQueue, cellIsRunning, cellLogs, isRunning }}>{children}</NotebookContext.Provider>
}
const useNotebook = () => {
  const res = useContext(NotebookContext)
  if (!res) throw new Error(`You can access NotebookContext only in the provider`)
  return res
}

export const App = ({ code }: { code: string }) => {
  return (
    <NotebookProvider code={code}>
      <Cells />
    </NotebookProvider>
  )
}
type StartEnd = { start: number; end: number }
const getStartEnd = (cells: Cell[]) => {
  let line = 1
  const startEnd: StartEnd[] = []
  for (const cell of cells) {
    let len = cell.content.split('\n').length
    if (cell.type === 'code') {
      startEnd.push({ start: line + 1, end: line + 1 + len })
      line += len + 1
    } else if (cell.type === 'markdown') {
      len += 2
      startEnd.push({ start: line + 2, end: line + len })
      line += len + 1
    }
  }
  return startEnd
}

const cellsToString = (cells: Cell[]) => {
  let chunks: string[] = []
  for (const cell of cells) {
    const args = [`type:${cell.type}`, cell.runOnLoad ? `runOnLoad:true` : '']
    let chunk = `/** [](${args.filter(Boolean).join(',')}) */\n`
    if (cell.type === 'markdown') chunk += `/**\n${cell.content}\n*/`
    if (cell.type === 'code') chunk += `${cell.content}`
    chunks.push(chunk)
  }
  return chunks.join('\n')
}

const Cells = () => {
  const { cells, setQueue } = useNotebook()
  const startEnd = getStartEnd(cells)
  return (
    <div className="flex flex-col h-full min-h-screen pt-10">
      <div className="flex gap-2">
        <button className="cursor-pointer" onClick={() => setQueue(() => [...cells.entries()].filter(([i, x]) => x.type === 'code').map(([i]) => i))}>
          Run all
        </button>
        <button className="cursor-pointer" onClick={() => navigator.clipboard.writeText(cellsToString(cells))}>
          Copy notebook
        </button>
        <button className="cursor-pointer" onClick={() => {}}>
          Share
        </button>
        <button className="cursor-pointer" onClick={() => {}}>
          Share with minimized URL
        </button>
        <a href="https://notebook.jsgrad.org/new">New</a>
        <button className="cursor-pointer" onClick={() => {}}>
          Open
        </button>
        <button className="cursor-pointer" onClick={() => {}}>
          Reload
        </button>
        <button className="cursor-pointer" onClick={() => {}}>
          Raw
        </button>
      </div>

      <CodeInit type="typescript" />
      {cells.map((cell, i) => {
        return (
          <div key={i} className="hover:bg-white/2 duration-200 py-2 px-10">
            {cell.type === 'markdown' && <MarkdownBlock index={i} content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
            {cell.type === 'code' && <CodeBlock index={i} content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
          </div>
        )
      })}
    </div>
  )
}

type CodeType = 'typescript' | 'javascript'
export const CodeInit = ({ type }: { type: CodeType }) => {
  const monaco = useMonaco()
  const { cells, setCells } = useNotebook()
  const code = cellsToString(cells)

  useEffect(() => {
    if (!monaco) return

    let model = monaco.editor.getModel(NOTEBOOK)
    if (model) return

    model = monaco.editor.createModel(code, type, NOTEBOOK)
    model.onDidChangeContent((e) => {
      const cells = codeToCells(model.getLinesContent())
      setCells(cells)
    })
  }, [monaco])

  useEffect(() => {
    if (!monaco) return

    monaco.languages.typescript[`${type}Defaults`].setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
    })
  }, [monaco])
  const [imported, setImported] = useState<string[]>([])
  useEffect(() => {
    if (!monaco) return
    const loadPackage = async (name: string) => {
      name = name.split('/').slice(0, 2).join('/')
      const version = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}`)
        .then((x) => x.json())
        .then((x) => x.tags.latest)
      const info: PackageInfo = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}@${version}`).then((x) => x.json())

      const types: string[] = []
      const getTypes = (files: PackageFile[], path = '') => {
        for (const file of files) {
          if (file.type === 'file' && file.name.endsWith('.d.ts')) types.push(`${path}/${file.name}`)
          else if (file.type === 'directory') getTypes(file.files, `${path}/${file.name}`)
        }
      }
      getTypes(info.files)

      const promises = types.map(async (x) => {
        const content = await fetch(`https://cdn.jsdelivr.net/npm/${info.name}@${info.version}${x}`).then((x) => x.text())
        monaco.languages.typescript[`${type}Defaults`].addExtraLib(content, `file:///node_modules/${name}${x}`)
      })
      await Promise.all(promises)
    }
    const packages = [...code.matchAll(/import\s*{[^}]+}\s*from\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    Promise.all(
      packages
        .filter((x) => !imported.includes(x))
        .map(async (x) => {
          await loadPackage(x)
          setImported((i) => [...i, x])
        }),
    )
  }, [code, monaco])

  return null
}

const runJS = async (code: string) => {
  code = code.trim()
  code = ts.transpile(code, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  })

  if (/^\s*\{/.test(code) && /\}\s*$/.test(code)) code = `(${code})`

  code = code.replace(/(?:const|let)\s+(\[([^\]]+)\]|\{([^}]+)\})\s*=\s*([^;\n]+)(;?)/g, (match, fullDestructure, arrayVars, objectVars, value, semi) => {
    const vars = (objectVars || arrayVars)
      .split(',')
      .map((v: string) => v.trim().split('=')[0].trim())
      .filter(Boolean)
      .join(', ')

    return `${match}\nObject.assign(window, {${vars}})${semi}`
  })

  // Handle regular const/let assignments
  code = code.replaceAll(/(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g, 'window.$1 =')

  code = code.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g, (_, imports, pkg) => {
    const cleanedImports = imports.trim().replace(/\s+/g, ' ')
    const imp = !import.meta.env.VITE_LOCAL_PACKAGES ? `const {${cleanedImports}} = await import("https://esm.sh/${pkg}")` : `const {${cleanedImports}} = await import("http://localhost:5173/${pkg}/index.js")`
    return [imp, `Object.assign(window,{${cleanedImports}})`].join('\n')
  })

  try {
    const lines = code.split('\n').filter((line) => line.trim() !== '')
    if (lines.length === 0) return

    const result = await eval(`
(async () => {
  ${code}
})()`)

    if (result !== undefined && result !== null) console.log(result)
  } catch (e) {
    console.error(e)
  }
}

const Block = ({ index, children, onClick, Icon }: { index: number; Icon: LucideIcon; onClick: () => void; children: ReactNode }) => {
  const { cells, setCells } = useNotebook()
  const cell = cells[index]
  const monaco = useMonaco()
  const set = (cells: Cell[]) => {
    setCells(cells)
    monaco!.editor.getModel(NOTEBOOK)!.setValue(cellsToString(cells))
  }
  return (
    <div className="flex gap-4 relative min-h-14">
      <div className="absolute bottom-2 right-2 z-10 md:relative md:bottom-0 md:right-0 bg-[#1e1e1e] min-h-10 w-10 border border-white/10 shrink-0 flex items-center justify-center hover:bg-[#343434] cursor-pointer rounded-md" onClick={onClick}>
        <Icon className="h-4" />
      </div>

      <div className="w-full my-auto relative">
        <div className="flex gap-2 absolute top-0 right-0 z-20">
          <button className="cursor-pointer" onClick={() => set([...cells.slice(0, index + 1), ...cells.slice(index)])}>
            duplicate
          </button>
          <button className="cursor-pointer" onClick={() => set([...cells.slice(0, index), ...cells.slice(index + 1)])}>
            remove
          </button>
          <button
            className="cursor-pointer"
            onClick={() => {
              if (index === 0) return
              ;[cells[index - 1], cells[index]] = [cells[index], cells[index - 1]]

              set(cells)
            }}
          >
            up
          </button>
          <button
            className="cursor-pointer"
            onClick={() => {
              if (index === cells.length - 1) return
              ;[cells[index + 1], cells[index]] = [cells[index], cells[index + 1]]

              set(cells)
            }}
          >
            down
          </button>
          <button
            className="cursor-pointer"
            onClick={() => {
              set(cells.map((x, i) => (i !== index ? x : { ...x, type: x.type === 'code' ? 'markdown' : 'code' })))
            }}
          >
            type
          </button>
          <button
            className="cursor-pointer"
            onClick={() => {
              set(cells.map((x, i) => (i !== index ? x : { ...x, runOnLoad: x.runOnLoad ? undefined : 'true' })))
            }}
          >
            run on start
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const CodeBlock = ({ start, end, content, index }: { index: number; content: string; start: number; end: number }) => {
  const { setQueue, cellLogs, cellIsRunning } = useNotebook()
  const run = () => setQueue((x) => [...x, index])
  const logs = cellLogs[index]
  const isRunning = cellIsRunning[index]
  return (
    <Block index={index} onClick={run} Icon={!isRunning ? PlayIcon : Loader2Icon}>
      <Code content={content} start={start} end={end} run={run} />
      <div>
        <Console
          logs={logs}
          variant="dark"
          styles={{
            LOG_BACKGROUND: 'transparent',
            BASE_BACKGROUND_COLOR: 'transparent',
          }}
        />
      </div>
    </Block>
  )
}
export const Code = ({ start, end, content, run }: { run?: () => void; content: string; start: number; end: number }) => {
  const lineHeight = 18
  const ref = useRef<any>(null)
  const range = useRef<Range>(null)

  useEffect(() => {
    range.current = new Range(start, 1, end - 1, Number.MAX_SAFE_INTEGER)
    ref.current?.revealRange(range.current, 1)
  }, [start, end])

  return (
    <div className="border border-white/10 rounded-md p-1">
      <Editor
        keepCurrentModel
        defaultPath={Uri.file('notebook.ts').toString()}
        height={(end - start) * lineHeight}
        onMount={(editor) => {
          ref.current = editor
          range.current = new Range(start, 1, end - 1, Number.MAX_SAFE_INTEGER)

          editor.revealRange(range.current, 1)
          editor.onDidScrollChange((e) => {
            editor.revealRange(range.current!, 1)
          })
          editor.addAction({
            id: 'custom-select-all',
            label: 'Select Cell Content',
            keybindings: [KeyMod.CtrlCmd | KeyCode.KeyA],
            run: () => {
              editor.setSelection(range.current!)
            },
          })
          if (run) {
            editor.addAction({
              id: 'run',
              label: 'Run cell',
              contextMenuGroupId: 'run',
              keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
              run: () => run(),
            })
            editor.addAction({
              id: 'save',
              label: 'Save',
              keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
              run: () => run(),
            })
          }
          editor.onDidChangeCursorPosition((e) => {
            const pos = e.position
            const start = range.current!.getStartPosition()
            const end = range.current!.getEndPosition()
            if (pos.isBefore(start)) editor.setPosition(start)
            else if (end.isBefore(pos)) editor.setPosition(end)
          })
        }}
        options={{
          lineNumbers: (e) => (e - start + 1) as any,
          stickyScroll: { enabled: false },
          wordWrap: 'off',
          minimap: { enabled: false },
          lineHeight,
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'auto',
            handleMouseWheel: false,
            useShadows: false,
          },
          overviewRulerLanes: 0,
          lineDecorationsWidth: 1,
          lineNumbersMinChars: 3,
          overviewRulerBorder: false,
        }}
        theme="vs-dark"
      />
    </div>
  )
}

export const MarkdownBlock = ({ index, content, start, end }: { index: number; end: number; start: number; content: string }) => {
  const [md, setMd] = useState('')
  const [editor, setEditor] = useState(false)
  useEffect(() => {
    const effect = async () => setMd(await marked.parse(content))
    effect()
  }, [content])
  return (
    <Block index={index} Icon={!editor ? CodeIcon : TextIcon} onClick={() => setEditor((e) => !e)}>
      {!editor && <div className="prose prose-invert py-1 max-w-[1000px]" dangerouslySetInnerHTML={{ __html: md }}></div>}
      {editor && <Code content={content} start={start} end={end} />}
    </Block>
  )
}

import { createContext, type ReactNode, useContext, useRef, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri, Range, KeyMod, KeyCode } from 'monaco-editor'
import { useEffect } from 'react'
import { CodeIcon, PlayIcon, TextIcon, type LucideIcon } from 'lucide-react'
import { Console, Hook, Unhook } from 'console-feed'
import { marked } from 'marked'

const CELL_TYPES = ['code', 'markdown']
type CellType = 'code' | 'markdown'
type Cell = {
  type: CellType
  content: string
}
type Notebook = {
  cells: Cell[]
  setCells: React.Dispatch<React.SetStateAction<Cell[]>>
}

type PackageFile = { type: 'directory'; name: string; files: PackageFile[] } | { type: 'file'; name: string; hash: string; size: number }
type PackageInfo = {
  name: string
  version: string
  files: PackageFile[]
}

const pattern = /\/\*\*\s*\[\]\(cell:(\w+)\)\s*\*\//

const codeToCells = (lines: string[]): Cell[] => {
  const out: Cell[] = []
  let type: CellType | undefined
  let currentLines: string[] = []
  const push = () => {
    if (type === 'markdown') currentLines = currentLines.join('\n').trim().split('\n').slice(1, -1)
    out.push({ type: type!, content: currentLines.join('\n') })
  }

  for (const line of lines) {
    const match = line.match(pattern)
    if (match) {
      if (type) push()
      currentLines = []
      type = match[1] as CellType
      if (!CELL_TYPES.includes(type)) throw new Error(`Invalid cell type ${type}`)
    } else {
      currentLines.push(line)
    }
  }
  if (type) push()
  return out
}

const NotebookContext = createContext<Notebook | undefined>(undefined)
const useNotebook = () => {
  const res = useContext(NotebookContext)
  if (!res) throw new Error(`You can access NotebookContext only in the provider`)
  return res
}
export const NotebookProvider = ({ code, children }: { children: ReactNode; code: string }) => {
  const [cells, setCells] = useState(() => codeToCells(code.split('\n')))
  return <NotebookContext.Provider value={{ cells, setCells }}>{children}</NotebookContext.Provider>
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
    let chunk = `/** [](cell:${cell.type}) */\n`
    if (cell.type === 'markdown') chunk += `/**\n${cell.content}\n*/`
    if (cell.type === 'code') chunk += `${cell.content}`
    chunks.push(chunk)
  }
  return chunks.join('\n')
}

const Cells = () => {
  const { cells } = useNotebook()
  const startEnd = getStartEnd(cells)
  return (
    <div className="flex flex-col h-full min-h-screen pt-10">
      <CodeInit code={cellsToString(cells)} />
      {cells.map((cell, i) => {
        return (
          <div key={i} className="hover:bg-white/2 duration-200 py-2 px-10">
            {cell.type === 'markdown' && <MarkdownBlock content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
            {cell.type === 'code' && <CodeBlock content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
          </div>
        )
      })}
    </div>
  )
}

export const CodeInit = ({ code }: { code: string }) => {
  const monaco = useMonaco()
  const { setCells } = useNotebook()

  useEffect(() => {
    if (!monaco) return

    const uri = Uri.file('notebook.ts')
    let model = monaco.editor.getModel(uri)
    if (model) return
    model = monaco.editor.createModel(code, 'typescript', uri)
    model.onDidChangeContent((e) => {
      const cells = codeToCells(model.getLinesContent())
      setCells(cells)
    })

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
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
        monaco.languages.typescript.typescriptDefaults.addExtraLib(content, `file:///node_modules/${name}${x}`)
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

  if (/^\s*\{/.test(code) && /\}\s*$/.test(code)) code = `(${code})`

  code = code.replaceAll('const ', 'window.')
  code = code.replaceAll('let ', 'window.')

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
const Block = ({ children, onClick, Icon }: { Icon: LucideIcon; onClick: () => void; children: ReactNode }) => {
  return (
    <div className="flex gap-4 relative min-h-14">
      <div className="absolute bottom-2 right-2 z-10 md:relative md:bottom-0 md:right-0 bg-[#1e1e1e] min-h-10 w-10 border border-white/10 shrink-0 flex items-center justify-center hover:bg-[#343434] cursor-pointer rounded-md" onClick={onClick}>
        <Icon className="h-4" />
      </div>
      <div className="w-full my-auto">{children}</div>
    </div>
  )
}
export const CodeBlock = ({ start, end, content }: { content: string; start: number; end: number }) => {
  const [logs, setLogs] = useState<any[]>([])

  const run = async () => {
    setLogs([])
    const hookedConsole = Hook(window.console, (log) => setLogs((currLogs) => [...currLogs, log]), false)

    await runJS(content)

    Unhook(hookedConsole)
  }
  return (
    <Block onClick={run} Icon={PlayIcon}>
      <Code content={content} start={start} end={end} />
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
export const Code = ({ start, end, content }: { content: string; start: number; end: number }) => {
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
          formatOnType: true,
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

export const MarkdownBlock = ({ content, start, end }: { end: number; start: number; content: string }) => {
  const [md, setMd] = useState('')
  const [editor, setEditor] = useState(false)
  useEffect(() => {
    const effect = async () => setMd(await marked.parse(content))
    effect()
  }, [content])
  return (
    <Block Icon={!editor ? CodeIcon : TextIcon} onClick={() => setEditor((e) => !e)}>
      {!editor && <div className="prose prose-invert py-1 max-w-[1000px]" dangerouslySetInnerHTML={{ __html: md }}></div>}
      {editor && <Code content={content} start={start} end={end} />}
    </Block>
  )
}

import { createContext, type ReactNode, useContext, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri } from 'monaco-editor'
import { useEffect } from 'react'

const CELL_TYPES = ['code', 'markdown']
type CellType = 'code' | 'markdown'
type Cell = {
  type: CellType
  content: string
  startLine: number
  endLine: number
}
type Notebook = {
  cells: Cell[]
  setCells: (c: Cell[]) => void
}

type PackageFile = { type: 'directory'; name: string; files: PackageFile[] } | { type: 'file'; name: string; hash: string; size: number }
type PackageInfo = {
  name: string
  version: string
  files: PackageFile[]
}

const codeToCells = (code: string): Cell[] => {
  const out: Cell[] = []
  const pattern = /\/\*\*\s*\[\]\(cell:(\w+)\)\s*\*\//g
  const splits = code.trim().split(pattern).slice(1)
  let offset = 1
  for (let i = 0; i < splits.length; i += 2) {
    const type = splits[i] as CellType
    if (!CELL_TYPES.includes(type)) throw new Error(`Invalid cell type ${type}`)
    let content = splits[i + 1].trim()
    if (type === 'markdown') content = content.split('\n').slice(1, -1).join('\n')

    let lines = 1 // the cell definition
    lines += content.split('\n').length // content
    if (type === 'markdown') lines += 2 // md block start and end
    lines++ // trailing space
    out.push({ type, content, startLine: offset, endLine: offset + lines })
    offset += lines
  }
  return out
}
const cellsToCode = (cells: Cell[]): string => {
  let out = ''
  for (const cell of cells) {
    out += `/** [](cell:${cell.type}) */\n`
    if (cell.type === 'code') out += `${cell.content}\n\n`
    if (cell.type === 'markdown') out += `/**\n${cell.content}\n*/\n\n`
  }
  return out
}

const NotebookContext = createContext<Notebook | undefined>(undefined)
const useNotebook = () => {
  const res = useContext(NotebookContext)
  if (!res) throw new Error(`You can access NotebookContext only in the provider`)
  return res
}
export const NotebookProvider = ({ code, children }: { children: ReactNode; code: string }) => {
  const [cells, setCells] = useState(() => codeToCells(code))
  return <NotebookContext.Provider value={{ cells, setCells }}>{children}</NotebookContext.Provider>
}

export const App = ({ code }: { code: string }) => {
  return (
    <NotebookProvider code={code}>
      <Cells />
    </NotebookProvider>
  )
}

const Cells = () => {
  const { cells } = useNotebook()
  return (
    <div className="flex flex-col gap-6 bg-[#1e1e1e] text-white p-10">
      <CodeInit />
      {cells.map((cell, i) => (
        <div key={i} className="">
          {cell.type === 'markdown' && <MarkdownBlock content={cell.content} />}
          {cell.type === 'code' && <CodeBlock {...cell} />}
        </div>
      ))}
    </div>
  )
}

export const CodeInit = () => {
  const monaco = useMonaco()
  const { cells } = useNotebook()
  useEffect(() => {
    if (!monaco) return
    const uri = Uri.file('notebook.ts')
    let model = monaco.editor.getModel(uri)
    if (model) return
    model = monaco.editor.createModel(cellsToCode(cells), 'typescript', uri)
    model.onDidChangeContent((e)=>{
      console.log(e)
    })

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
    })

    const loadPackage = async (name: string) => {
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

    loadPackage('@jsgrad/jsgrad')
    loadPackage('@jsgrad/models')
    loadPackage('zod')
  }, [monaco])

  return null
}

export const CodeBlock = ({ startLine, endLine }: Cell) => {
  const start = startLine + 1
  const end = endLine - 1
  const monaco = useMonaco()

  useEffect(() => {
    if (!monaco) return
    // Ensure TypeScript compiler options are set
  }, [monaco])
  return (
    <Editor
      defaultPath={Uri.file('notebook.ts').toString()}
      height={(end - start) * 19}
      onMount={(editor, monaco) => {
        const range = new monaco.Range(start, 1, end, Number.MAX_SAFE_INTEGER)
        editor.revealRange(range, 0)
        editor.onDidScrollChange((e) => {
          editor.revealRange(range, 0)
        })
      }}
      options={{
        // lineNumbers: 'off',
        stickyScroll: { enabled: false },
        wordWrap: 'off',
        minimap: { enabled: false },
        formatOnType: true,
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'auto',
          handleMouseWheel: false,
        },
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
      }}
      theme="vs-dark"
    />
  )
}

export const MarkdownBlock = ({ content }: { content: string }) => {
  return <div>{content}</div>
}

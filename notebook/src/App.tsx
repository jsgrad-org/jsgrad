import { createContext, type ReactNode, useContext, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri } from 'monaco-editor'
import { useEffect } from 'react'

const CELL_TYPES = ['code', 'markdown']
type CellType = 'code' | 'markdown'
type Cell = {
  type: CellType
  content: string
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
  for (let i = 0; i < splits.length; i += 2) {
    const type = splits[i] as CellType
    if (!CELL_TYPES.includes(type)) throw new Error(`Invalid cell type ${type}`)
    let content = splits[i + 1].trim()
    if (type === 'markdown') content = content.split('\n').slice(1, -1).join('\n')
    out.push({ type, content })
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
  let line = 1
  return (
    <div className="flex flex-col gap-6 bg-[#1e1e1e] text-white p-10">
      <CodeInit />
      {cells.map((cell, i) => {
        const start = line
        const len = cell.content.split('\n').length + 2
        if (cell.type === 'code') line += len
        return (
          <div key={i} className="">
            {cell.type === 'markdown' && <MarkdownBlock content={cell.content} />}
            {cell.type === 'code' && <CodeBlock start={start} end={start + len} />}
          </div>
        )
      })}
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
    const code = cells
      .filter((x) => x.type === 'code')
      .map((x) => `\n${x.content}\n`)
      .join('\n')
    model = monaco.editor.createModel(code, 'typescript', uri)
    model.onDidChangeContent((e) => {
      for (const change of e.changes) {
        console.log(change.range, change.text, change.rangeLength, change.rangeOffset)
      }
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
  }, [monaco])

  return null
}

export const CodeBlock = ({ start, end }: { start: number; end: number }) => {
  const lineHeight = 18
  return (
    <Editor
      className="border-2 border-gray-900 rounded-xl !shadow-none overflow-hidden"
      defaultPath={Uri.file('notebook.ts').toString()}
      height={(end - start) * lineHeight}
      onMount={(editor, monaco) => {
        const range = new monaco.Range(start, 1, end, Number.MAX_SAFE_INTEGER)
        editor.revealRange(range, 1)
        editor.onDidScrollChange((e) => {
          editor.revealRange(range, 1)
        })
        editor.addAction({
          id: 'custom-select-all',
          label: 'Select Cell Content',
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA],
          run: () => {
            editor.setSelection(range)
          },
        })
      }}
      options={{
        lineNumbers: (e) => {
          if (e >= end - 1 || e < start) return null
          return (e - start) as any
        },
        stickyScroll: { enabled: false },
        wordWrap: 'off',
        minimap: { enabled: false },
        lineHeight,
        formatOnType: true,
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'hidden',
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

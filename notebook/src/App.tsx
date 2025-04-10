import { createContext, type ReactNode, useContext, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri } from 'monaco-editor'
import { useEffect } from 'react'

const CELL_TYPES = ['code', 'markdown']
type CellType = 'code' | 'markdown'
type Cell = { type: CellType; content: string }
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

const parseCode = (code: string) => {
  const out: Cell[] = []
  const pattern = /\/\*\*\s*\[\]\(cell:(\w+)\)\s*\*\//g
  const splits = code.split(pattern).slice(1)
  for (let i = 0; i < splits.length; i += 2) {
    const type = splits[i] as CellType
    if (!CELL_TYPES.includes(type)) throw new Error(`Invalid cell type ${type}`)
    let content = splits[i + 1].trim()
    if (type === 'markdown') content = content.split('\n').slice(1, -1).join('\n')
    out.push({ type, content })
  }
  console.log(out)
  return out
}
const NotebookContext = createContext<Notebook | undefined>(undefined)
const useNotebook = () => {
  const res = useContext(NotebookContext)
  if (!res) throw new Error(`You can access NotebookContext only in the provider`)
  return res
}
export const NotebookProvider = ({ code, children }: { children: ReactNode; code: string }) => {
  const [cells, setCells] = useState(() => parseCode(code))
  return <NotebookContext.Provider value={{ cells, setCells }}>{children}</NotebookContext.Provider>
}

export const App = ({ code }: { code: string }) => {
  return (
    <NotebookProvider code={code}>
      <Cells code={code} />
    </NotebookProvider>
  )
}

const Cells = ({ code }: { code: string }) => {
  const { cells } = useNotebook()
  return (
    <div className="flex flex-col gap-6 bg-[#1e1e1e] text-white p-10">
      <CodeInit code={code} />
      {cells.map((cell, i) => (
        <div key={i} className="">
          {cell.type === 'markdown' && <MarkdownBlock content={cell.content} />}
          {cell.type === 'code' && <CodeBlock content={cell.content} index={i} />}
        </div>
      ))}
    </div>
  )
}

export const CodeInit = ({ code }: { code: string }) => {
  const monaco = useMonaco()

  useEffect(() => {
    if (!monaco) return
    monaco.editor.createModel(code, 'typescript', Uri.file('notebook.ts'))

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
    loadPackage('sharp')
  }, [monaco])

  return null
}

export const CodeBlock = ({ content, index }: { index: number; content: string }) => {
  const monaco = useMonaco()

  useEffect(() => {
    if (!monaco) return
    // Ensure TypeScript compiler options are set
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
    })
  }, [monaco])
  const start = index * 15
  const end = index * 15 + 15
  return (
    <Editor
      defaultPath={Uri.file('notebook.ts').toString()}
      height={(end - start) * 19}
      onMount={(editor, monaco) => {
        const range = new monaco.Range(start, 1, end, Number.MAX_SAFE_INTEGER)
        editor.revealRange(range, 0)
        editor.onDidScrollChange(() => {
          editor.revealRange(range, 0)
        })
      }}
      onChange={(e) => console.log(e)}
      options={{
        // lineNumbers: 'off',
        stickyScroll: { enabled: false },
        wordWrap: 'off',
        minimap: { enabled: false },
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

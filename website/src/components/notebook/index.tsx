import { createContext, Fragment, type ReactNode, useContext, useRef, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri, Range, KeyMod, KeyCode } from 'monaco-editor'
import { useEffect } from 'react'
import { ArrowDownIcon, ArrowUpIcon, CirclePlayIcon, CodeIcon, CopyIcon, CopyPlusIcon, Loader2Icon, PlayIcon, PlusIcon, RefreshCwIcon, RefreshCwOffIcon, SaveIcon, ShareIcon, TextIcon, XIcon } from 'lucide-react'
import { marked } from 'marked'
import { toast } from 'sonner'
import { cellsToCode, getStartEnd, type CellType, type CodeType, type Cell, fetchTypes, type Notebook as NotebookType, codeToNotebook } from './helpers'
import { runCell, tscOptions, type CellOutput } from './runner'
import type { NB } from "../../../../global.d.ts"

const NOTEBOOK = Uri.file('notebook.ts')

export const Notebook = (args: { kvBaseUrl: string; notebookBaseUrl: string }) => {
  const [notebook, setNotebook] = useState<NotebookType>()
  useEffect(() => {
    const effect = async () => {
      const params = new URLSearchParams(window.location.search)

      const hash = params.get('hash')
      const data = params.get('data')
      if (hash) {
        const res = await fetch(`${args.kvBaseUrl}?hash=${encodeURIComponent(hash)}`)
        if (!res.ok) throw new Error(`Invalid hash`)
        setNotebook(codeToNotebook((await res.text()).split('\n')))
        return
      } else if (data) {
        return setNotebook(codeToNotebook(atob(decodeURIComponent(data)).split('\n')))
      }

      setNotebook({ cells: [{ type: 'code', content: '// Write code here \n' }] })
    }

    effect()
    window.addEventListener('popstate', effect)
    return () => window.removeEventListener('popstate', effect)
  }, [])
  if (!notebook) return <p>Loading...</p>
  return <NotebookWrapper {...args} notebook={notebook} />
}

export type NotebookContext = {
  cells: Cell[]
  setCells: React.Dispatch<React.SetStateAction<Cell[]>>
  queue: number[]
  setQueue: React.Dispatch<React.SetStateAction<number[]>>
  isRunning: boolean
  cellIsRunning: Record<number, boolean>
  cellLogs: Record<number, CellOutput[]>
  notebookBaseUrl: string
  kvBaseUrl: string
}

const NotebookContext = createContext<NotebookContext | undefined>(undefined)

const save = (cells: Cell[], notebookBaseUrl: string) => {
  const url = `${notebookBaseUrl}?data=${encodeURIComponent(btoa(cellsToCode(cells)))}`
  window.history.pushState({}, '', url)
  return url
}

const useAsyncEffect = (fn: () => Promise<void>, deps: any[]) => useEffect(() => void fn(), deps)

const NB = `declare const nb: {
  /**
   * Rended any html under the cell.
   */
  display: (html: string) => void
  /**
   * Display an image under the cell.
   */
  image: (href: string) => void
}
`

export const NotebookProvider = ({ type, notebook, children, notebookBaseUrl, kvBaseUrl }: { type: CodeType; notebook: NotebookType; notebookBaseUrl: string; kvBaseUrl: string; children: ReactNode }) => {
  const monaco = useMonaco()
  const [cells, setCells] = useState(notebook.cells)
  const [queue, setQueue] = useState<number[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [cellLogs, setCellLogs] = useState<Record<number, CellOutput[]>>({})
  const [cellIsRunning, setCellIsRunning] = useState<Record<number, boolean>>({})
  const [importedPackages, setImportedPackages] = useState<string[]>([])

  // Pushing every runOnLoad to the queue
  useEffect(() => setQueue([...cells.entries()].filter(([_, x]) => x.runOnLoad).map(([i]) => i)), [])

  // Updating the cells and code when notebook changes
  useEffect(() => {
    setCells(notebook.cells)
    monaco?.editor.getModel(NOTEBOOK)?.setValue(cellsToCode(notebook.cells))
  }, [notebook.cells, monaco])

  // Updating the title
  useEffect(() => {
    if (notebook.title) document.title = notebook.title
  }, [notebook.title])

  // Keyboard shortcuts
  useEffect(() => {
    const handleSave = (e: any) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save(cells, notebookBaseUrl)
      }
    }
    window.addEventListener('keydown', handleSave)
    return () => window.removeEventListener('keydown', handleSave)
  }, [cells, notebookBaseUrl])

  // Running queue
  useAsyncEffect(async () => {
    if (isRunning || !queue.length) return

    const index = queue.shift()!

    const cell = cells[index]
    if (!cell || cell.type !== 'code') throw new Error(`Trying to run markdown block!`)

    setIsRunning(true)
    setCellIsRunning((x) => ({ ...x, [index]: true }))
    setCellLogs((x) => ({ ...x, [index]: [] }))
    const addOutput = (out:CellOutput)=>{
      setCellLogs(x => {
        const last = x[index].at(-1)
        // handle env.stdout
        if (last?.type === "console.log" && last.args.includes('\u200B')){
          console.log(last, out)
        }
        return { ...x, [index]: [...x[index], out] }
    })
    }
    await runCell(cell.content, addOutput)

    setIsRunning(false)
    setCellIsRunning((x) => ({ ...x, [index]: false }))

  }, [queue, isRunning])

  // Initializing notebook
  useEffect(() => {
    if (!monaco) return
    monaco.languages.typescript.typescriptDefaults.addExtraLib(NB, 'notebook.ts')
    let model = monaco.editor.getModel(NOTEBOOK)
    if (!model) model = monaco.editor.createModel(cellsToCode(cells), type, NOTEBOOK)
    model.onDidChangeContent((e) => {
      const { cells } = codeToNotebook(model.getLinesContent())
      setCells(cells)
    })
    monaco.languages.typescript[`${type}Defaults`].setCompilerOptions(tscOptions)
  }, [monaco])

  // Importing types
  useEffect(() => {
    if (!monaco) return
    const code = cellsToCode(cells)
    const packages = [...code.matchAll(/import\s*{[^}]+}\s*from\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    Promise.all(
      packages
        .filter((x) => !importedPackages.includes(x))
        .map(async (x) => {
          const res = await fetchTypes(x)
          for (const { name, content } of res) {
            monaco.languages.typescript[`${type}Defaults`].addExtraLib(content, `file:///node_modules/${name}`)
          }
          setImportedPackages((i) => [...i, x])
        }),
    )
  }, [cells, monaco])

  return (
    <NotebookContext.Provider
      value={{
        cells,
        setCells,
        queue,
        setQueue,
        cellIsRunning,
        cellLogs,
        isRunning,
        notebookBaseUrl,
        kvBaseUrl,
      }}
    >
      {children}
    </NotebookContext.Provider>
  )
}

export const useNotebook = () => {
  const res = useContext(NotebookContext)
  if (!res) throw new Error(`You can access NotebookContext only in the provider`)
  return res
}

export const NotebookWrapper = (args: { kvBaseUrl: string; notebookBaseUrl: string; notebook: NotebookType }) => {
  return (
    <NotebookProvider type="typescript" {...args}>
      <Cells />
    </NotebookProvider>
  )
}

const MenuButton = ({ Icon, text, onClick }: { Icon: Icon; text: string; onClick: () => void }) => {
  return (
    <button className="cursor-pointer shrink-0 flex gap-1 items-center text-sm hover:bg-white/10 py-1 pl-1 pr-2 rounded-md" onClick={onClick}>
      <Icon className="h-4" />
      {text}
    </button>
  )
}

const Cells = () => {
  const { cells, setQueue, notebookBaseUrl, kvBaseUrl } = useNotebook()
  const [raw, setRaw] = useState(false)
  const startEnd = getStartEnd(cells)
  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast('Copied to clipboard!')
  }
  return (
    <div className="flex flex-col h-full min-h-screen pt-16">
      <div className="flex fixed top-0 backdrop-blur-lg bg-[#1e1e1e]/50 w-full border-b border-white/10 z-50 p-1 overflow-auto">
        <MenuButton Icon={PlusIcon} text="New" onClick={() => (window.location.href = notebookBaseUrl)} />
        <MenuButton Icon={CopyIcon} text="Copy content" onClick={() => copy(cellsToCode(cells))} />
        <MenuButton Icon={SaveIcon} text="Save" onClick={() => save(cells, notebookBaseUrl)} />
        <MenuButton
          Icon={ShareIcon}
          text="Share"
          onClick={async () => {
            const body = cellsToCode(cells)
            const res = await fetch(kvBaseUrl, { body, method: 'POST' })
            if (!res.ok) throw new Error(`Failed to save the hash!`)

            const hash = await res.json().then((x) => x.hash)
            const url = `${notebookBaseUrl}?hash=${encodeURIComponent(hash)}`
            window.history.pushState({}, '', url)
            toast(`Copied url to clipboard!`)
          }}
        />
        <MenuButton Icon={CodeIcon} text={raw ? 'Edit blocks' : 'Edit raw'} onClick={() => setRaw((r) => !r)} />
        <MenuButton Icon={CirclePlayIcon} text="Run all" onClick={() => setQueue(() => [...cells.entries()].filter(([i, x]) => x.type === 'code').map(([i]) => i))} />
      </div>
      {raw && (
        <div className="section">
          <Code start={1} end={cellsToCode(cells).split('\n').length + 1} />
        </div>
      )}
      {!raw &&
        cells.map((cell, i) => {
          return (
            <Fragment key={i}>
              {cell.type === 'markdown' && <MarkdownBlock index={i} content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
              {cell.type === 'code' && <CodeBlock index={i} content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
            </Fragment>
          )
        })}
    </div>
  )
}

type Icon = (x: { className?: string; onClick?: () => void }) => ReactNode

const SmallIcon = ({ onClick, Icon, description }: { description: string; Icon: Icon; onClick: () => void }) => {
  return (
    <button className="relative cursor-pointer p-1.5 bg-[#1e1e1e] hover:bg-[#2d2d2d] group/icon rounded-sm">
      <Icon className="h-4 w-4" onClick={onClick} />
      <span className="absolute hidden whitespace-nowrap top-[105%] left-[50%] text-sm -translate-x-1/2 group-hover/icon:block">{description}</span>
    </button>
  )
}

const AddCell = ({ bottom, add }: { bottom?: boolean; add: (c: CellType) => void }) => {
  return (
    <div className={`absolute w-full h-[1px]  ${bottom ? 'bottom-0 -translate-y-1/2' : 'top-0 translate-y-1/2'}  rounded-full opacity-0 group-hover:opacity-100 duration-200 z-20`}>
      <div className="absolute text-xs bg-[#1e1e1e] rounded-full border border-white/20 left-1/2 -translate-x-1/2 -translate-y-1/2 flex overflow-hidden">
        <button className="cursor-pointer w-20 hover:bg-white/5 p-0.5" onClick={() => add('code')}>
          Code
        </button>
        <div className="h-5 w-[1px] shrink-0 bg-white/20"></div>
        <button className="cursor-pointer w-20 hover:bg-white/5 p-0.5" onClick={() => add('markdown')}>
          Markdown
        </button>
      </div>
    </div>
  )
}

const Cell = ({ index, children, onClick, Icon }: { index: number; Icon: Icon; onClick: () => void; children: ReactNode }) => {
  const { cells, setCells } = useNotebook()
  const cell = cells[index]
  const monaco = useMonaco()
  const set = (cells: Cell[]) => {
    setCells(cells)
    monaco!.editor.getModel(NOTEBOOK)!.setValue(cellsToCode(cells))
  }
  return (
    <div className="group hover:bg-white/2 duration-200 relative p-3">
      <div className="section">
        <div className="relative w-full">
          <div className="hidden group-hover:flex absolute -top-[34px]  right-0 z-20 shadow-sm shadow-white/10 border border-white/10 rounded-md">
            <SmallIcon Icon={Icon} description={cell.type === 'code' ? 'Run cell' : 'Edit markdown'} onClick={onClick} />
            <SmallIcon
              Icon={ArrowUpIcon}
              description="Move up"
              onClick={() => {
                if (index === 0) return
                ;[cells[index - 1], cells[index]] = [cells[index], cells[index - 1]]

                set(cells)
              }}
            />
            <SmallIcon
              Icon={ArrowDownIcon}
              description="Move down"
              onClick={() => {
                if (index === cells.length - 1) return
                ;[cells[index + 1], cells[index]] = [cells[index], cells[index + 1]]

                set(cells)
              }}
            />
            <SmallIcon
              Icon={cell.runOnLoad ? RefreshCwOffIcon : RefreshCwIcon}
              description={cell.runOnLoad ? 'Disable running on start' : 'Enable running on start'}
              onClick={() => {
                set(cells.map((x, i) => (i !== index ? x : { ...x, runOnLoad: x.runOnLoad ? undefined : 'true' })))
              }}
            />
            <SmallIcon
              Icon={cell.type === 'code' ? TextIcon : CodeIcon}
              description={cell.type === 'code' ? 'Change to markdown cell' : 'Change to code cell'}
              onClick={() => {
                set(cells.map((x, i) => (i !== index ? x : { ...x, type: x.type === 'code' ? 'markdown' : 'code' })))
              }}
            />
            <SmallIcon Icon={CopyPlusIcon} description="Clone cell" onClick={() => set([...cells.slice(0, index + 1), ...cells.slice(index)])} />
            <SmallIcon Icon={XIcon} description="Delete cell" onClick={() => set([...cells.slice(0, index), ...cells.slice(index + 1)])} />
          </div>
          {children}
        </div>
      </div>
      <AddCell bottom add={(type) => set([...cells.slice(0, index + 1), { type, content: '' }, ...cells.slice(index + 1)])} />
    </div>
  )
}

export const CodeBlock = ({ start, end, content, index }: { index: number; content: string; start: number; end: number }) => {
  const { setQueue, cellLogs, cellIsRunning } = useNotebook()
  const run = () => setQueue((x) => [...x, index])
  const logs = (cellLogs[index] || [])
  const isRunning = cellIsRunning[index]
  return (
    <Cell index={index} onClick={run} Icon={!isRunning ? PlayIcon : ({ className }) => <Loader2Icon className={className + ' animate-spin'} />}>
      <Code start={start} end={end} run={run} />
      <div>
        <Console logs={logs} />
      </div>
    </Cell>
  )
}

const logItem = (item:any): string => {
  if (Array.isArray(item)) return "[" + item.map((item)=>logItem(item)).join(", ") + "]"
  if (typeof item === "object") return "{ " + Object.entries(item).map(([k,v])=>`${k}: ${logItem(v)}`).join(", ") + " }"
  if (typeof item === "string") return item
  return JSON.stringify(item)
}

const String = ({ children }: { children: string }) => {
  const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

  const regex = /\u001b\[(\d+)(;\d+)*m/g;
  let lastIndex = 0;
  const elements: ReactNode[] = [];

  children.replace(regex, (match, code, _subcode, index) => {
    if (index > lastIndex) elements.push(<span key={lastIndex}>{children.slice(lastIndex, index)}</span>);

    const codeNum = parseInt(code, 10);
    let style: React.CSSProperties = {};

    if (codeNum === 0) style = {};
    else if (codeNum >= 30 && codeNum <= 37) style = { color: colors[codeNum - 30] };
    else if (codeNum >= 90 && codeNum <= 97) style = { color: colors[codeNum - 90], filter: 'brightness(1.5)' };
    else if (codeNum >= 40 && codeNum <= 47) style = { backgroundColor: colors[codeNum - 40] };
    else if (codeNum >= 100 && codeNum <= 107) style = { backgroundColor: colors[codeNum - 100], filter: 'brightness(1.5)' };

    const nextMatch = children.slice(index + match.length).match(/\u001b\[\d+(;\d+)*m/);
    const textEnd = nextMatch ? index + match.length + nextMatch.index! : children.length;
    const text = children.slice(index + match.length, textEnd);

    if (text) elements.push(<span key={index} style={style}>{text}</span>);

    lastIndex = textEnd;
    return match;
  });

  if (lastIndex < children.length) elements.push(<span key={lastIndex}>{children.slice(lastIndex)}</span>);

  return <>{elements}</>;
};

export const Console = ({logs}:{logs:CellOutput[]}) => {
  return <div className='flex flex-col bg-white/5 rounded-b-md overflow-hidden whitespace-pre overflow-x-auto font-mono text-xs'>
    {logs.map((log,i)=><div key={i} className={`w-full p-0.5 px-2 ${log.type==="error" || log.type==="console.error" ? "bg-red-500/50 hover:bg-red-500/60":"hover:bg-white/10"}`}>
      {log.type==="console.log" && <String>{JSON.parse(log.args).map((x:any)=>logItem(x)).join(", ")}</String>}
      {log.type==="console.error" && <String>{JSON.parse(log.args).map((x:any)=>logItem(x)).join(", ")}</String>}
      {log.type==="console.table" && <Table args={JSON.parse(log.args)[0]}/>}
      {log.type==="error" && <div>{log.error}</div>}
      {log.type==="display" && <div dangerouslySetInnerHTML={{__html:log.html}}></div>}
      {log.type==="image" && <img src={log.src}/>}
    </div>)}
  </div>
}
const Table = ({args}:{args:Record<string,Record<string,any>>}) => {
  const allKeys = [...new Set(Object.values(args).flatMap(x=>Object.keys(x)))]
  return <table className='table-auto w-full border !rounded-md border-white/10'>
    <thead>
      <tr>
        {["",...allKeys].map((x,i)=><th key={i} className='p-0.5 odd:bg-white/3'>{x}</th>)}
      </tr>
    </thead>
    <tbody>
    {Object.entries(args).map(([k,v],i)=>
      <tr key={i} className='odd:bg-white/3 border-t border-white/10'>
        <th>{k}</th>
        {allKeys.map((k,i)=><td key={i} className='odd:bg-white/3 text-center p-0.5'>{logItem(v[k])}</td>)}
      </tr>
    )}
    </tbody>
  </table>
}

export const Code = ({ start, end, run }: { run?: () => void; start: number; end: number }) => {
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
    <Cell index={index} Icon={!editor ? CodeIcon : TextIcon} onClick={() => setEditor((e) => !e)}>
      {!editor && <div className="prose prose-invert max-w-full" dangerouslySetInnerHTML={{ __html: md }}></div>}
      {editor && <Code start={start} end={end} />}
    </Cell>
  )
}

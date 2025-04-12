import { Hook, Unhook } from 'console-feed'
import { createContext, type ReactNode, useState, useEffect, useContext } from 'react'
import { type Cell, type Notebook } from './helpers'

import ts from 'typescript'

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

export type NotebookContext = {
  cells: Cell[]
  setCells: React.Dispatch<React.SetStateAction<Cell[]>>
  queue: number[]
  setQueue: React.Dispatch<React.SetStateAction<number[]>>
  isRunning: boolean
  cellIsRunning: Record<number, boolean>
  cellLogs: Record<number, any[]>
}

const NotebookContext = createContext<NotebookContext | undefined>(undefined)

export const NotebookProvider = ({ notebook, children }: { notebook: Notebook; children: ReactNode }) => {
  const [cells, setCells] = useState(notebook.cells)
  const [queue, setQueue] = useState<number[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [cellLogs, setCellLogs] = useState<Record<number, any[]>>({})
  const [cellIsRunning, setCellIsRunning] = useState<Record<number, boolean>>({})

  useEffect(() => setQueue([...cells.entries()].filter(([_, x]) => x.runOnLoad).map(([i]) => i)), [])

  useEffect(() => {
    if (notebook.title) document.title= notebook.title
  }, [notebook.title])

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

export const useNotebook = () => {
  const res = useContext(NotebookContext)
  if (!res) throw new Error(`You can access NotebookContext only in the provider`)
  return res
}

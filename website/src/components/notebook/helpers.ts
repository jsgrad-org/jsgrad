export type StartEnd = { start: number; end: number }
export type CodeType = 'typescript' | 'javascript'
export type CellType = 'code' | 'markdown'
export type Cell = {
  type: CellType
  runOnLoad?: 'true'
  content: string
}
export type Notebook = {
  title?: string
  cells: Cell[]
}

const CELL_TYPES = ['code', 'markdown']

const headerPattern = /\/\*\*\s*\[\]\((.*?)\)\s*\*\//

export const codeToNotebook = (lines: string[]): Notebook => {
  const cells: Cell[] = []
  let cell: Cell | undefined
  let currentLines: string[] = []
  const push = () => {
    if (cell!.type === 'markdown') currentLines = currentLines.join('\n').trim().split('\n').slice(1, -1)
    cells.push({ ...cell!, content: currentLines.join('\n') })
  }

  for (const line of lines) {
    const match = line.match(headerPattern)
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
  const title = cells[0]?.content.startsWith('#') ? cells[0]?.content.split('\n')[0].replaceAll('#', '') : undefined
  return { cells, title }
}

export const getStartEnd = (cells: Cell[]) => {
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

export const cellsToCode = (cells: Cell[]) => {
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

type PackageName = { name: string; path?: string; version?: string }

export const parsePackageString = (pkg: string) => {
  const regex = /^((?:@[^/@]+\/)?[^/@]+)(?:@([^/]+))?(?:\/(.+))?$/
  const match = pkg.match(regex)
  if (!match) throw new Error(`Invalid package string: ${pkg}`)

  const [, name, version, path] = match
  const result: PackageName = { name }
  if (version) result.version = version
  if (path) result.path = path

  return result
}

export type PackageFile = { type: 'directory'; name: string; files: PackageFile[] } | { type: 'file'; name: string; hash: string; size: number }
export type PackageInfo = {
  name: string
  version: string
  files: PackageFile[]
}

export const fetchTypes = async (pkg: string) => {
  try {
    let { name, version } = parsePackageString(pkg)
    if (!version) {
      version = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}`)
        .then((x) => x.json())
        .then((x) => x.tags.latest)
    }
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
      const content = await fetch(`https://cdn.jsdelivr.net/npm/${name}@${version}${x}`).then((x) => x.text())
      return { name: name + x, content }
    })
    return await Promise.all(promises)
  } catch (e) {
    return []
  }
}

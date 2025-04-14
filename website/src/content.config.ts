// @ts-ignore
import { defineCollection, z } from 'astro:content'
import fs from 'node:fs'
import path from 'node:path'
import { codeToNotebook } from './components/notebook/helpers'

const getFiles = (dir: string) => {
  let results: string[] = []
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) results.push(...getFiles(fullPath))
    else results.push(fullPath)
  }
  return results
}

const load = (path: string, prefix: string) =>{
  const names = getFiles(path)
  const files = names.map((name) => {
    const content = new TextDecoder().decode(fs.readFileSync(name))
    const data = codeToNotebook(content.split('\n'))
    return {
      id: name.replace(`${path}/`, prefix ? `${prefix}/` : "").replace('.ts', ''),
      ...data,
    }
  })
  return files
}

const notebooks = defineCollection({
  loader: async () => {
    return [
      ...load("src/content", ""),
      ...load("../examples", "examples")
    ]
  
  },
  schema: z.object({
    id: z.string(),
    title: z.string().optional(),
    cells: z
      .object({
        type: z.enum(['code', 'markdown']),
        runOnLoad: z.literal('true').optional(),
        content: z.string(),
      })
      .array(),
  }),
})

export const collections = { notebooks }

// @ts-ignore
import { defineCollection, z } from 'astro:content'
import fs from 'node:fs'
import path from 'node:path'

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

const notebooks = defineCollection({
  loader: async () => {
    const names = getFiles('src/notebooks')
    const files = names.map((name) => ({
      id: name.replace('src/notebooks/', '').replace('.ts', ''),
      content: new TextDecoder().decode(fs.readFileSync(name)),
    }))
    return files
  },
})

export const collections = { notebooks }

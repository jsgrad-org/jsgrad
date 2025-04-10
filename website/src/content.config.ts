import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import fs from 'node:fs/promises'
import { exec as execSync } from 'node:child_process'

const exec = async (cmd: string) =>
  await new Promise<string>((resolve, reject) => {
    execSync(cmd, (error, stdout, stderr) => {
      if (error) reject(stderr)
      else resolve(stdout)
    })
  })

const docs = defineCollection({
  loader: glob({ base: './src/docs', pattern: '**/*.(md|mdx)', generateId: ({ entry }) => entry.split('.md')[0] }),
  schema: z.object({
    title: z.string(),
  }),
})

const generated = defineCollection({
  loader: async () => {
    const out: any[] = []

    const item = async (path: string, id: string, title: string) => {
      await exec(`deno doc --json ${path} > /tmp/${id}.json`)
      const items = JSON.parse(new TextDecoder().decode(await fs.readFile(`/tmp/${id}.json`))).nodes.filter((x: any) => x.kind !== 'import')
      return { id, items, title }
    }
    // out.push(await item('../jsgrad/index.ts', 'api', 'API'))

    // const MODELS = (await fs.readdir('../models')).filter((x) => x.endsWith('.ts'))
    // for (const model of MODELS) {
    //   const id = model.replace('.ts', '')
    //   out.push(await item(`../models/${model}`, id, id))
    // }
    return out
  },
  schema: z.object({
    title: z.string(),
    id: z.string(),
    items: z.any().array(),
  }),
})

export const collections = { docs, generated }

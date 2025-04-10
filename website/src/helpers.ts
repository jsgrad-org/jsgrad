import fs from 'node:fs/promises'
import { bytes_to_string } from '@jsgrad/jsgrad'

export const getExample = async (file: string) => bytes_to_string(await fs.readFile(`src/examples/${file}`))
export const getExamples = async () => {
  const examples = await fs.readdir('src/examples')
  return await Promise.all(examples.map(async (file) => ({ file, code: await getExample(file) })))
}

export const getDocs = async () => {
  return JSON.parse(bytes_to_string(await fs.readFile('.astro/docs.json')))
}

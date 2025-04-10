import { Editor, useMonaco } from '@monaco-editor/react'
import { useEffect } from 'react'

type File = { type: 'directory'; name: string; files: File[] } | { type: 'file'; name: string; hash: string; size: number }
type Meta = {
  name: string
  version: string
  files: File[]
}

export const CodeInit = () => {
  const monaco = useMonaco()

  useEffect(() => {
    if (!monaco) return
    const loadPackage = async (name: string) => {
      const version = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}`)
        .then((x) => x.json())
        .then((x) => x.tags.latest)
      const info: Meta = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}@${version}`).then((x) => x.json())

      const types: string[] = []
      const getTypes = (files: File[], path = '') => {
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
      const res = await Promise.all(promises)
    }

    loadPackage('@jsgrad/jsgrad')
    loadPackage('@jsgrad/models')
    loadPackage('zod')
    loadPackage('sharp')
  }, [monaco])

  return null
}

export const Code = ({ content, index }: { index: number; content: string }) => {
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

  return (
    <Editor
      defaultPath={`file:///${index}.ts`}
      defaultLanguage="typescript"
      defaultValue={content}
      height={90}
      onChange={(e) => console.log(e)}
      options={{
        lineNumbers: 'off',
        stickyScroll: { enabled: false },
        wordWrap: 'off',
        minimap: { enabled: false },
        formatOnType: true,
      }}
      theme="vs-dark"
    />
  )
}

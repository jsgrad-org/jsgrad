import ts from 'typescript'

export const tscOptions = {
  target: ts.ScriptTarget.ESNext as 99,
  module: ts.ModuleKind.ESNext as 99,
  moduleResolution: ts.ModuleResolutionKind.Node10 as 2,
  isolatedModules: false,
  noUnusedLocals: false,
  noUnusedParameters: false,
  verbatimModuleSyntax: true,
  strict: true,
  strictNullChecks: true,
}

export const runJS = async (code: string) => {
  code = code.trim()
  code = code
    .split('\n')
    .filter((x) => !x.trim().startsWith('//'))
    .join('\n')
  code = ts.transpile(code, tscOptions)
  code = code.replace('export {};', '')

  if (/^\s*\{/.test(code) && /\}\s*$/.test(code)) code = `(${code})`

  code = code.replace(/(?:const|let)\s+(\[([^\]]+)\]|\{([^}]+)\})\s*=\s*([^;\n]+)(;?)/g, (match, fullDestructure, arrayVars, objectVars, value, semi) => {
    const vars = (objectVars || arrayVars)
      .split(',')
      .map((v: string) => v.trim().split('=')[0].trim())
      .filter(Boolean)
      .join(', ')

    return `${match}\nObject.assign(window, {${vars}})${semi}`
  })

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

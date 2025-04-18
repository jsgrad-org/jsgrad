import ts, { factory, type Node, type ShorthandPropertyAssignment, type TransformationContext } from 'typescript';

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
};

const setGlobal = (items:ShorthandPropertyAssignment[])=>{
  return factory.createExpressionStatement(factory.createCallExpression(
      factory.createIdentifier("setGlobal"),
      undefined,
      [factory.createObjectLiteralExpression(items, false)]
    ))
}
const esm = `https://esm.sh`

export const transformTypescript = (code: string) => {
  const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true);
  
  // Find the last top-level expression statement in the original code
  let originalLastExprPos: number | undefined;
  let originalLastExprEnd: number | undefined;
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement)) {
      originalLastExprPos = statement.pos;
      originalLastExprEnd = statement.end;
    }
  }

  const transformer = (context: TransformationContext) => {
    const visit = (node: Node, parent: Node | undefined): Node | ReadonlyArray<Node> => {
      // Check if this node is the original last expression statement
      if (originalLastExprPos !== undefined && originalLastExprEnd !== undefined &&
          ts.isExpressionStatement(node) && node.pos === originalLastExprPos && node.end === originalLastExprEnd) {
        // Replace with console.log
        return factory.createBlock(
          [
            factory.createVariableStatement(
              undefined,
              factory.createVariableDeclarationList(
                [factory.createVariableDeclaration(
                  factory.createIdentifier("__out__"),
                  undefined,
                  undefined,
                  node.expression
                )],
                ts.NodeFlags.Const 
              )
            ),
            factory.createIfStatement(
              factory.createBinaryExpression(
                factory.createIdentifier("__out__"),
                factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                factory.createIdentifier("undefined")
              ),
              factory.createExpressionStatement(factory.createCallExpression(
                factory.createPropertyAccessExpression(
                  factory.createIdentifier("console"),
                  factory.createIdentifier("log")
                ),
                undefined,
                [factory.createIdentifier("__out__")]
              )),
            )
          ]
        )
      }

      // Handle Import Declarations
      if (ts.isImportDeclaration(node)) {
        const importClause = node.importClause;
        if (!importClause) return node;

        const moduleSpecifierNode = node.moduleSpecifier;
        if (!ts.isStringLiteral(moduleSpecifierNode)) return node;
        const moduleSpecifier = `${esm}/${moduleSpecifierNode.text}`

        const defaultImport = importClause.name?.text;
        const namedBindings = importClause.namedBindings;

        let namespaceImport: string | undefined;
        const namedImports: ts.ImportSpecifier[] = [];
        if (namedBindings) {
          if (ts.isNamespaceImport(namedBindings)) namespaceImport = namedBindings.name.text;
          else if (ts.isNamedImports(namedBindings)) namedImports.push(...namedBindings.elements);
        }

        const identifiers: string[] = [];
        let variableStatement: ts.VariableStatement | undefined;

        if (namespaceImport) {
          identifiers.push(namespaceImport);
          variableStatement = factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
              [factory.createVariableDeclaration(
                factory.createIdentifier(namespaceImport),
                undefined,
                undefined,
                factory.createAwaitExpression(
                  factory.createCallExpression(
                    factory.createIdentifier("import"),
                    undefined,
                    [factory.createStringLiteral(moduleSpecifier)]
                  )
                )
              )],
              ts.NodeFlags.Const
            )
          );
        } else if (defaultImport && namedImports.length === 0) {
          identifiers.push(defaultImport);
          const importCall = factory.createCallExpression(
            factory.createIdentifier("import"),
            undefined,
            [factory.createStringLiteral(moduleSpecifier)]
          );
          const thenProp = factory.createPropertyAccessExpression(importCall, 'then');
          const arrowFunc = factory.createArrowFunction(
            undefined,
            undefined,
            [factory.createParameterDeclaration(undefined, undefined, 'x')],
            undefined,
            factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            factory.createPropertyAccessExpression(factory.createIdentifier('x'), 'default')
          );
          const thenCall = factory.createCallExpression(thenProp, undefined, [arrowFunc]);
          variableStatement = factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
              [factory.createVariableDeclaration(
                factory.createIdentifier(defaultImport),
                undefined,
                undefined,
                factory.createAwaitExpression(thenCall)
              )],
              ts.NodeFlags.Const
            )
          );
        } else {
          const bindingElements: ts.BindingElement[] = [];
          if (defaultImport) {
            bindingElements.push(
              factory.createBindingElement(
                undefined,
                factory.createIdentifier("default"),
                factory.createIdentifier(defaultImport),
                undefined
              )
            );
            identifiers.push(defaultImport);
          }
          for (const specifier of namedImports) {
            if (specifier.isTypeOnly) continue; // Skip type-only imports
            const bindingName = specifier.name.text;
            const propName = specifier.propertyName?.text;
            bindingElements.push(
              factory.createBindingElement(
                undefined,
                propName ? factory.createIdentifier(propName) : undefined,
                factory.createIdentifier(bindingName),
                undefined
              )
            );
            identifiers.push(bindingName);
          }
          if (bindingElements.length === 0 && !defaultImport) return node
          const bindingPattern = factory.createObjectBindingPattern(bindingElements);
          variableStatement = factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
              [factory.createVariableDeclaration(
                bindingPattern,
                undefined,
                undefined,
                factory.createAwaitExpression(
                  factory.createCallExpression(
                    factory.createIdentifier("import"),
                    undefined,
                    [factory.createStringLiteral(moduleSpecifier)]
                  )
                )
              )],
              ts.NodeFlags.Const
            )
          );
        }

        if (!variableStatement) return node;
        const assign = setGlobal(identifiers.map(id => factory.createShorthandPropertyAssignment(id)))

        return factory.createBlock([variableStatement, assign])
      }

      // Handle class declarations (only top-level)
      if (ts.isClassDeclaration(node) && node.name) {
        if (parent && ts.isSourceFile(parent)) {
          const className = node.name.text;
          const assign = setGlobal([factory.createShorthandPropertyAssignment(className)])
          return factory.createBlock([node, assign]);
        }
        return node;
      }

      // Handle function declarations (only top-level)
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (parent && ts.isSourceFile(parent)) {
          const functionName = node.name.text;
          const assign = setGlobal([factory.createShorthandPropertyAssignment(functionName)])
          return factory.createBlock([node, assign])
        }
        return node;
      }

      // Handle variable statements (only top-level)
      if (ts.isVariableStatement(node)) {
        if (parent && ts.isSourceFile(parent)) {
          const decls = node.declarationList.declarations;
          const boundIdentifiers: ts.Identifier[] = [];
        
          decls.forEach(decl => {
            const collect = (bindingName: ts.BindingName) => {
              if (ts.isIdentifier(bindingName)) boundIdentifiers.push(bindingName);
              else if (ts.isObjectBindingPattern(bindingName) || ts.isArrayBindingPattern(bindingName)) {
                bindingName.elements.forEach(el => {
                  if (ts.isBindingElement(el)) collect(el.name);
                });
              }
            };
            collect(decl.name);
          });
        
          if (boundIdentifiers.length > 0) {
            const assign = setGlobal(boundIdentifiers.map(id => factory.createShorthandPropertyAssignment(id.text)))
            return factory.createBlock([node, assign])
          }
        }
        return node;
      }

      // For other nodes, visit children and pass current node as parent
      return ts.visitEachChild(node, (child) => visit(child, node), context);
    };

    return (node: Node) => visit(node, undefined) as Node;
  };

  const result = ts.transform(sourceFile, [transformer as any], tscOptions);

  const printer = ts.createPrinter();
  return printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], sourceFile);
};

export const transformCode = (code: string) => {
  code = transformTypescript(code);
  code = ts.transpile(code, tscOptions);
  return code;
};

const workerCode = `

const setGlobal = (args) => {
  Object.assign(globalThis, args)
}

globalThis.nb = {
  display: (html) => self.postMessage({ type: "display", html }),
  image: (src) => self.postMessage({ type: "image", src }),
}
const log = console.log
console.log = (...args) => {
  log(...args)
  self.postMessage({ type: "console.log", args: JSON.stringify(args) })
}
const error = console.error
console.error = (...args) => {
  error(...args)
  self.postMessage({ type: "console.error", args: JSON.stringify(args) })
}
const table = console.table
console.table = (...args) =>{
  table(...args)
  self.postMessage({ type: "console.table", args: JSON.stringify(args) })
}

self.onmessage = async ({ data }) => {
  try{
    const fn = new Function("setGlobal", \`const main = async () => {\${data.code}}\nreturn main()\`)
    const result = await fn(setGlobal)
    self.postMessage({ type: "success", result })
  } catch(error){
    console.error(error)
    self.postMessage({ type: "error", error: error.message }) 
  }
}
`
const url = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }))
const worker = new Worker(url, { type: 'module' })

export type CellOutput = { type: "display", html: string }
                       | { type: "image", src: string }
                       | { type: "console.log" | "console.error" | "console.table", args: string }
                       | { type: "error", error: string }
  
export const runCell = async (code: string | string[], onOutput: (out:CellOutput)=>void) => {
  if (Array.isArray(code)) code = code.join("\n")
  code = transformCode(code);

  worker.postMessage({code})
  const res = await new Promise((resolve, reject)=>worker.onmessage = ({ data })=>{
    if (data.type === "success") resolve(data.result)
    else if (data.type === "error") {
      onOutput(data)
      resolve(undefined)
    }
    else onOutput(data)
  })
  worker.onmessage = null

  return res
};

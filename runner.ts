import ts, { factory, type Node, type TransformationContext } from 'typescript';

declare global {
    var __nb__: {};
}

const tscOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  isolatedModules: false,
  noUnusedLocals: false,
  noUnusedParameters: false,
  verbatimModuleSyntax: true,
  strict: true,
  strictNullChecks: true,
};

const ctx = ts.factory.createIdentifier('globalThis')
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
        const loggedExpr = factory.createCallExpression(
          factory.createIdentifier('console.log'),
          undefined,
          [node.expression]
        );
        return factory.createExpressionStatement(loggedExpr);
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

        const assign = factory.createExpressionStatement(
          factory.createAssignment(
            ctx,
            factory.createObjectLiteralExpression([
              factory.createSpreadAssignment(ctx),
              ...identifiers.map(id => factory.createShorthandPropertyAssignment(id))
            ])
          )
        );

        return [variableStatement, assign];
      }

      // Handle class declarations (only top-level)
      if (ts.isClassDeclaration(node) && node.name) {
        if (parent && ts.isSourceFile(parent)) {
          const className = node.name.text;
          const assign = factory.createExpressionStatement(
            factory.createAssignment(
              ctx,
              factory.createObjectLiteralExpression([
                factory.createSpreadAssignment(ctx),
                factory.createShorthandPropertyAssignment(className)
              ])
            )
          );
          return [node, assign];
        }
        return node;
      }

      // Handle function declarations (only top-level)
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (parent && ts.isSourceFile(parent)) {
          const functionName = node.name.text;
          const assign = factory.createExpressionStatement(
            factory.createAssignment(
              ctx,
              factory.createObjectLiteralExpression([
                factory.createSpreadAssignment(ctx),
                factory.createShorthandPropertyAssignment(functionName)
              ])
            )
          );
          return [node, assign];
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
            const assign = factory.createExpressionStatement(
              factory.createAssignment(
                ctx,
                factory.createObjectLiteralExpression([
                  factory.createSpreadAssignment(ctx),
                  ...boundIdentifiers.map(id => factory.createShorthandPropertyAssignment(id.text)),
                ])
              )
            );
            return [node, assign];
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

console.log = (...args) => self.postMessage({ type: "console.log", args })
console.error = (...args) => self.postMessage({ type: "console.error", args})

self.onmessage = async ({ data }) => {
  try{
    console.log(data)
    const fn = new Function(\`const main = async () => {\${data.code}}\nreturn main()\`)
    const result = await fn()
    self.postMessage({ type: "success", result })
  } catch(error){
    self.postMessage({ type: "error", error }) 
  }
}
`
const url = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }))
const worker = new Worker(url, { type: 'module' })

export const runCell = async (code: string) => {
  code = transformCode(code);

  worker.postMessage({code})
  const res =  await new Promise((resolve, reject)=>worker.onmessage = ({ data })=>{
    if (data.type === "success") resolve(data.result)
    else if (data.type === "console.log") console.log(...data.args)
    else if (data.type === "console.error") console.error(...data.args)
    else if (data.type === "error") reject(data.error)
    else throw new Error(`Invalid data: ${data}`)
  })
  worker.onmessage = null

  return res
};

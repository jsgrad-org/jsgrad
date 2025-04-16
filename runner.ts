import ts, { factory, type Node, type TransformationContext, type VariableDeclaration } from 'typescript';

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

const ctx = ts.factory.createPropertyAccessExpression(
  ts.factory.createIdentifier('globalThis'),
  ts.factory.createIdentifier("__nb__")
);

export const transformCode = (code: string) => {
  const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true);
  const transformer = (context: TransformationContext) => {
    const visit = (node: Node, parent: Node | undefined): Node => {
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
          return ts.factory.createNodeArray([node, assign]) as unknown as Node;
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
          return ts.factory.createNodeArray([node, assign]) as unknown as Node;
        }
        return node;
      }

      // Handle variable statements (only top-level)
      if (ts.isVariableStatement(node)) {
        if (parent && ts.isSourceFile(parent)) {
          const decls = node.declarationList.declarations;
          const original = [node];
        
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
                  ...boundIdentifiers.map(id =>
                    factory.createShorthandPropertyAssignment(id)
                  ),
                ])
              )
            );
            return ts.factory.createNodeArray([...original, assign]) as unknown as Node;
          }
        }
        return node;
      }

      // For other nodes, visit children and pass current node as parent
      return ts.visitEachChild(node, (child) => visit(child, node), context);
    };

    return (node: Node) => visit(node, undefined);
  };

  const result = ts.transform(sourceFile, [transformer as any], tscOptions);

  const printer = ts.createPrinter();
  return printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], sourceFile);
};

declare global {
  var __nb__: {};
}

export const run = async (code: string) => {
  console.log(`INPUT:\n${code}`);
  code = transformCode(code);
  console.log(`OUTPUT:\n${code}`);
  if (!globalThis.__nb__) globalThis.__nb__ = {};
  const fn = new Function(`const main = async () => {${code}}\nreturn main()`);
  return await fn();
};

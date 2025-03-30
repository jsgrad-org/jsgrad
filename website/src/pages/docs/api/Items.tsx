// deno-lint-ignore-file jsx-key
import { Fragment, type ReactNode } from "react";

const ghUrl = (location: any) => `https://github.com/jsgrad-org/jsgrad/blob/main/${location.filename.split("/jsgrad/")[1]}#L${location.line}`;
const url = (location: any, name: string) =>
  location ? `/docs/api/${location.filename.split("/jsgrad/jsgrad/")[1].replace(".ts", "")}#${name}` : undefined;
const Join = ({ items, sep }: { items: ReactNode[]; sep: ReactNode }) => {
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && sep}
          {item}
        </Fragment>
      ))}
    </>
  );
};
const Json = ({ item }: { item: any }) => {
  return <span className="text-red-500 whitespace-pre">{JSON.stringify(item, null, 2)}</span>;
};
const Link = ({ children, loc }: { loc: any; children: string }) => {
  return (
    <a id={children} href={url(loc, children)} className="text-blue-400">
      {children}
    </a>
  );
};
// reverse refs with their locations
const refs: Record<string, any> = {
  Tensor: {
    filename: "/jsgrad/jsgrad/tensor.ts",
    line: 1,
  },
};
const Ref = ({ children, name }: { name: any; children: string }) => {
  return (
    <a href={url(refs[name], name)} className="text-yellow-400">
      {children}
    </a>
  );
};
const Declaration = ({ item, children }: { item: any; children: ReactNode }) => {
  return (
    <div>
      {item.jsDoc && <p>{item.jsDoc.doc}</p>}
      {children}
    </div>
  );
};
// prettier-ignore
const Type = ({ item }: { item: any }): any => {
  if (!item || !item.kind) return <Json item={item} />

  // Declarations
  if (item.kind === "class")
    return <Declaration item={item}>
      {item.classDef.isAbstract ? `abstract ` : ``}
      class <Link loc={item.location}>{item.name}</Link>{item.classDef.typeParams.length!==0 && <>{"<"}<Join sep=", " items={item.classDef.typeParams.map((x:any)=><>{x.name}{!!x.constraint && <> extends <Type item={x.constraint}/></>}{!!x.default && <> = <Type item={x.default}/></>}</>)}/>{">"}</>}
      {item.classDef.extends ? <> extends {item.classDef.extends}{item.classDef.superTypeParams.length!==0 && <>{"<"}<Join sep=", " items={item.classDef.superTypeParams.map((x: any)=><Type item={x}/>)}/>{">"}</>}</>:""}
      {item.classDef.implements.length!==0 && <>implements <Join sep=", " items={item.classDef.implements.map((x: any)=><Type item={x}/>)}/></>}
      {" {\n"}
      <div className='pl-4'>
        {item.classDef.constructors.map((x: any) => <Declaration item={x}>constructor(<Join sep=", " items={x.params.map((x: any)=><Type item={x}/>)}/>)</Declaration>)}
          {item.classDef.properties.map((x:any) => <Declaration item={x}>{x.readonly ? "readonly " : ""}{x.isAbstract ? "abstract " : ""}{x.isStatic ? "static " : ""}<Link loc={x.location}>{x.name}</Link> = <Type item={x.tsType}/></Declaration>)}
          {item.classDef.methods.map((x:any)=><Declaration item={x}><Type item={x}/></Declaration>)}
      </div>
      {"}"}
    </Declaration>
  if (item.kind==="variable") return <Declaration item={item}>{item.variableDef.kind} <Link loc={item.location}>{item.name}</Link> = <Type item={item.variableDef.tsType}/></Declaration>
  if (item.kind === "typeAlias") return <Declaration item={item}>type <Link loc={item.location}>{item.name}</Link> = <Type item={item.typeAliasDef.tsType}/></Declaration>
  if (item.kind==="method" || item.kind==="function" || item.kind==="getter" || item.kind==="setter") {
    const dec = item.kind === "getter" ? "get" : item.kind==="setter" ? "set" : "function"
    return <Declaration item={item}>{item.isOverride &&"override "}{item.functionDef.isAsync && "async "}{dec} <Link loc={item.location}>{item.name}</Link> (<Join sep=", " items={item.functionDef.params.map((x:any)=><Type item={x}/>)}/>): <Type item={item.functionDef.returnType}/></Declaration>
  }

  if (item.kind==="typePredicate") return <>{item.typePredicate.param.name} is <Type item={item.typePredicate.type}/></>
  if (item.kind==="typeQuery") return <>typeof {item.typeQuery}</>
  if (item.kind==="tuple") return <>[<Join sep=", " items={item.tuple.map((x: any)=><Type item={x}/>)}/>]</>
  if (item.kind==="rest") return <>...<Type item={item.arg}/>: <Type item={item.tsType}/></>
  if (item.kind === "object") return <>{"{ "}<Join sep=", " items={item.props.map((x: any) => x.key)}/>: <Type item={item.tsType}/>{" }"}</>
  if (item.kind === "assign") return <><Type item={item.left}/> = {item.right}</>
  if (item.kind === "typeLiteral") return <>{`{`} <Join sep=", " items={item.typeLiteral.properties.map((x: any) => <>{x.name}: <Type item={x.tsType}/></>)}/> {`}`}</>;
  if (item.kind === "union") return <Join sep=" | " items={item.union.map((x: any) => <Type item={x}/>)}/>
  if (item.kind === "array") return <><Type item={item.array}/>[]</>
  if (item.kind === "keyword") return item.keyword;
  if (item.kind === "typeRef") return <Ref name={item.typeRef.typeName}>{item.typeRef.typeParams ? <>{item.typeRef.typeName}{"<"}<Join sep=", " items={item.typeRef.typeParams.map((x: any) => <Type item={x}/>)}/>{">"}</> : item.typeRef.typeName}</Ref>
  if (item.kind === "literal") return <Type item={item.literal}/>
  if (item.kind === "string") return `'${item.string}'`;
  if (item.kind === "parenthesized") return<>( <Type item={item.parenthesized}/> )</>
  if (item.kind === "fnOrConstructor") return <>(<Join sep=", " items={item.fnOrConstructor.params.map((x: any) =><Type item={x}/>)}/>){" => "}<Type item={item.fnOrConstructor.tsType}/></>
  if (item.kind === "identifier") return <>{item.name}{item.optional ? "?" : ""}: {item.tsType ? <Type item={item.tsType}/>:""}</>
  if (item.kind ==='intersection') return <>{item.intersection.map((x: any)=><Type item={x}/>)}</>
  if (item.kind === "boolean") return item.boolean ? "true" : "false"
  if (item.kind === "typeOperator") return <>{item.typeOperator.operator} <Type item={item.typeOperator.tsType}/></>

  else return  <Json item={item} />
};

const Item = ({ item }: { item: any }) => {
  return (
    <div>
      <div className="whitespace-pre x">
        <Type item={item} />
      </div>
    </div>
  );
};

export const Items = ({ items }: { items: any[] }) => {
  return (
    <div>
      {items.map((item, i) => (
        <Item item={item} key={i} />
      ))}
    </div>
  );
};

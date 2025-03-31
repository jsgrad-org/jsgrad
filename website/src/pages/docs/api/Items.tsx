// deno-lint-ignore-file jsx-key
import { Fragment, type ReactNode } from 'react'

let allFiles: string[] = []

const ghUrl = (location: any) => `https://github.com/jsgrad-org/jsgrad/blob/main/${location.filename.split('/jsgrad/')[1]}#L${location.line}`
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
  )
}
const Json = ({ item }: { item: any }) => {
  return <span className='text-red-500 whitespace-pre'>{JSON.stringify(item, null, 2)}</span>
}
const Link = ({ name, loc }: { loc: any; name: string }) => {
  return (
    <span className='relative group'>
      <a id={name} href={`#${name}`} className='text-blue-400'>
        {name}
      </a>
      <div className='absolute top-1/2 -translate-y-1/2 right-[100%] z-20 hidden group-hover:block pr-1'>
        <a href={ghUrl(loc)} target='_blank' className='flex gap-1 items-center bg-dark p-0.5 border border-white/10 shadow shadow-white text-sm rounded-md'>
          <svg className='h-4 fill-white' role='img' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
            <path d='M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' />
          </svg>
          GitHub
        </a>
      </div>
    </span>
  )
}
const Ref = ({ children, name }: { name: any; children: string }) => {
  return (
    <a href={allFiles.includes(name) ? `/docs/api/${name}` : undefined} className={allFiles.includes(name) ? 'text-green-500' : ''}>
      {children}
    </a>
  )
}
const Declaration = ({ item, children }: { item: any; children: ReactNode }) => {
  return (
    <div className='mt-3 relative'>
      {item.jsDoc && <p className='p-2 rounded-md bg-white/10 whitespace-pre prose-sm prose-invert mb-1'>{item.jsDoc.doc}</p>}

      {children}
    </div>
  )
}
// prettier-ignore deno-fmt-ignore
const Type = ({ item }: { item: any }): any => {
  if (!item || !item.kind) return <Json item={item} />

  // Declarations
  if (item.kind === "class")
    return <Declaration  item={item}>
      {item.classDef.isAbstract ? `abstract ` : ``}
      class <Link loc={item.location} name={item.name}/>{item.classDef.typeParams.length!==0 && <>{"<"}<Join sep=", " items={item.classDef.typeParams.map((x:any)=><>{x.name}{!!x.constraint && <> extends <Type item={x.constraint}/></>}{!!x.default && <> = <Type item={x.default}/></>}</>)}/>{">"}</>}
      {item.classDef.extends ? <> extends <Ref name={item.classDef.extends}>{item.classDef.extends}</Ref>{item.classDef.superTypeParams.length!==0 && <>{"<"}<Join sep=", " items={item.classDef.superTypeParams.map((x: any)=><Type item={x}/>)}/>{">"}</>}</>:""}
      {item.classDef.implements.length!==0 && <>implements <Join sep=", " items={item.classDef.implements.map((x: any)=><Type item={x}/>)}/></>}
      {" {\n"}
      <div className='pl-4'>
        {item.classDef.constructors.map((x: any) => <Declaration  item={x}>constructor(<Join sep=", " items={x.params.map((x: any)=><Type item={x}/>)}/>)</Declaration>)}
        {item.classDef.properties.map((x:any) => <Declaration item={x}>{x.readonly ? "readonly " : ""}{x.isAbstract ? "abstract " : ""}{x.isStatic ? "static " : ""}<Link loc={x.location} name={x.name}/> = <Type item={x.tsType}/></Declaration>)}
        {item.classDef.methods.map((x:any)=><Type item={x}/>)}
      </div>
      {"}"}
    </Declaration>
  if (item.kind==="variable") return <Declaration  item={item}>{item.variableDef.kind} <Link loc={item.location} name={item.name}/> = <Type item={item.variableDef.tsType}/></Declaration>
  if (item.kind === "typeAlias") return <Declaration  item={item}>type <Link loc={item.location} name={item.name}/> = <Type item={item.typeAliasDef.tsType}/></Declaration>
  if (item.kind==="method" || item.kind==="function" || item.kind==="getter" || item.kind==="setter") {
    const dec = item.kind === "getter" ? "get" : item.kind==="setter" ? "set" : "function"
    return <Declaration item={item} >{item.isOverride &&"override "}{item.functionDef.isAsync && "async "}{dec} <Link loc={item.location} name={item.name}/> (<Join sep=", " items={item.functionDef.params.map((x:any)=><Type item={x}/>)}/>): <Type item={item.functionDef.returnType}/></Declaration>
  }

  if (item.kind==="typePredicate") return <>{item.typePredicate.param.name} is <Type item={item.typePredicate.type}/></>
  if (item.kind==="typeQuery") return <>typeof <Ref name={item.typeQuery}>{item.typeQuery}</Ref></>
  if (item.kind==="tuple") return <>[<Join sep=", " items={item.tuple.map((x: any)=><Type item={x}/>)}/>]</>
  if (item.kind==="rest") return <>...<Type item={item.arg}/>: <Type item={item.tsType}/></>
  if (item.kind === "object") return <>{"{ "}<Join sep=", " items={item.props.map((x: any) => x.key)}/>: <Type item={item.tsType}/>{" }"}</>
  if (item.kind === "assign") return <><Type item={item.left}/> = {item.right}</>
  if (item.kind === "typeLiteral") return <>{`{`} <Join sep=", " items={item.typeLiteral.properties.map((x: any) => <>{x.name}: <Type item={x.tsType}/></>)}/> {`}`}</>;
  if (item.kind === "union") return <Join sep=" | " items={item.union.map((x: any) => <Type item={x}/>)}/>
  if (item.kind === "array") return <><Type item={item.array}/>[]</>
  if (item.kind === "keyword") return item.keyword;
  if (item.kind === "typeRef") return item.typeRef.typeParams ? <><Ref name={item.typeRef.typeName}>{item.typeRef.typeName}</Ref>{"<"}<Join sep=", " items={item.typeRef.typeParams.map((x: any) => <Type item={x}/>)}/>{">"}</> : <Ref name={item.typeRef.typeName}>{item.typeRef.typeName}</Ref>
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
export const Item = ({ item, all }: { item: any; all: string[] }) => {
  allFiles = all
  return (
    <div className='mt-16 py-10 section flex flex-col gap-5'>
      <div className='flex justify-between items-center'>
        <h1 className='text-4xl'>{item.name}</h1>
        <a href={ghUrl(item.location)} target='_blank' className='flex gap-2 items-center bg-dark px-2 p-1 border border-white/10 shadow shadow-white rounded-md'>
          <svg className='h-5 fill-white' role='img' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
            <path d='M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' />
          </svg>
          View in GitHub
        </a>
      </div>
      <Type item={item} />
    </div>
  )
}

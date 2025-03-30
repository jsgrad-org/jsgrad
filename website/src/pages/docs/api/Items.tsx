// deno-lint-ignore-file jsx-key
import { Fragment, type ReactNode } from "react";

const ghUrl = (location: any) => `https://github.com/jsgrad-org/jsgrad/blob/main/${location.filename.split("/jsgrad/")[1]}#L${location.line}`;

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
// Items
// prettier-ignore
const Type = ({ item }: { item: any }): any => {
  if (!item || !item.kind) return <Json item={item} />
  if (item.kind==="typePredicate") return <>{item.typePredicate.param.name} is <Type item={item.typePredicate.type}/></>
  if (item.kind==="variable") return <>{item.variableDef.kind} {item.name} = <Type item={item.variableDef.tsType}/></>
  if (item.kind==="typeQuery") return <>typeof {item.typeQuery}</>
  if (item.kind==="tuple") return <>[<Join sep=", " items={item.tuple.map((x: any)=><Type item={x}/>)}/>]</>
  if (item.kind==="rest") return <>...<Type item={item.arg}/>: <Type item={item.tsType}/></>
  if (item.kind === "object") return <>{"{ "}<Join sep=", " items={item.props.map((x: any) => x.key)}/>: <Type item={item.tsType}/>{" }"}</>
  if (item.kind === "assign") return <><Type item={item.left}/> = {item.right}</>
  if (item.kind === "class")
    return <>
    {item.classDef.isAbstract ? `abstract ` : ``}
    class {item.name}{item.classDef.typeParams.length!==0 && <>{"<"}<Join sep=", " items={item.classDef.typeParams.map((x:any)=><>{x.name}{!!x.constraint && <> extends <Type item={x.constraint}/></>}{!!x.default && <> = <Type item={x.default}/></>}</>)}/>{">"}</>}
    {item.classDef.extends ? <> extends {item.classDef.extends}{item.classDef.superTypeParams.length!==0 && <>{"<"}<Join sep=", " items={item.classDef.superTypeParams.map((x: any)=><Type item={x}/>)}/>{">"}</>}</>:""}
    {item.classDef.implements.length!==0 && <>implements <Join sep=", " items={item.classDef.implements.map((x: any)=><Type item={x}/>)}/></>}
    {" {\n"}
  <Join sep={<br/>} items={item.classDef.constructors.map((x: any) => <>constructor(<Join sep=", " items={x.params.map((x: any)=><Type item={x}/>)}/>)</>)}/>
  <br/>
  <Join sep={<br/>} items={item.classDef.properties.map((x:any) => <>{x.readonly ? "readonly " : ""}{x.isAbstract ? "abstract " : ""}{x.isStatic ? "static " : ""}{x.name} = <Type item={x.tsType}/></>)}/>
  <br/>
  <Join sep={<br/>} items={item.classDef.methods.map((x:any)=><Type item={x}/>)}/>
{"\n}"}
  </>
  if (item.kind === "typeAlias") return <>type {item.name} = <Type item={item.typeAliasDef.tsType}/></>
  if (item.kind === "typeLiteral") return <>{`{`} <Join sep=", " items={item.typeLiteral.properties.map((x: any) => <>{x.name}: <Type item={x.tsType}/></>)}/> {`}`}</>;
  if (item.kind === "union") return <Join sep=" | " items={item.union.map((x: any) => <Type item={x}/>)}/>
  if (item.kind === "array") return <><Type item={item.array}/>[]</>
  if (item.kind === "keyword") return item.keyword;
  if (item.kind === "typeRef") return item.typeRef.typeParams ? <>{item.typeRef.typeName}{"<"}<Join sep=", " items={item.typeRef.typeParams.map((x: any) => <Type item={x}/>)}/>{">"}</> : item.typeRef.typeName;
  if (item.kind === "literal") return <Type item={item.literal}/>
  if (item.kind === "string") return `'${item.string}'`;
  if (item.kind === "parenthesized") return<>( <Type item={item.parenthesized}/> )</>
  if (item.kind === "fnOrConstructor") return <>(<Join sep=", " items={item.fnOrConstructor.params.map((x: any) =><Type item={x}/>)}/>){" => "}<Type item={item.fnOrConstructor.tsType}/></>
  if (item.kind === "identifier") return <>{item.name}{item.optional ? "?" : ""}: {item.tsType ? <Type item={item.tsType}/>:""}</>
  if (item.kind ==='intersection') return <>{item.intersection.map((x: any)=><Type item={x}/>)}</>
  if (item.kind === "boolean") return item.boolean ? "true" : "false"
  if (item.kind === "typeOperator") return <>{item.typeOperator.operator} <Type item={item.typeOperator.tsType}/></>
  if (item.kind==="method" || item.kind==="function" || item.kind==="getter" || item.kind==="setter") {
    const dec = item.kind === "getter" ? "get" : item.kind==="setter" ? "set" : "function"
    return <>{item.isOverride &&"override "}{item.functionDef.isAsync && "async "}{dec} {item.name} (<Join sep=", " items={item.functionDef.params.map((x:any)=><Type item={x}/>)}/>): <Type item={item.functionDef.returnType}/></>
  }
  else return  <Json item={item} />
};

const Item = ({ item }: { item: any }) => {
  return (
    <div>
      {!!item.jsDoc && <p className="whitespace-pre italic text-sm">{item.jsDoc.doc}</p>}
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
        <div key={i} id={item.name}>
          <div className="flex gap-2">
            <a href={`#${item.name}`}>{item.name}</a>
            <a target="_blank" href={ghUrl(item.location)}>
              Github
            </a>
          </div>
          <Item item={item} />
          <br />
        </div>
      ))}
    </div>
  );
};

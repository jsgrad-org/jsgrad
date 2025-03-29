// @ts-nocheck 
const ghUrl = (location: Location) => `https://github.com/jsgrad-org/jsgrad/blob/main/${location.filename.split("/jsgrad/")[1]}#L${location.line}`;

// Items
const getType = (item: any):any => {
  if (item.kind === "typeLiteral") return `{ ${item.typeLiteral.properties.map((x) => `${x.name}: ${getType(x.tsType)}`).join(", ")} }`;
  if (item.kind === "union") return item.union.map((x) => getType(x)).join(" | ");
  if (item.kind === "array") return `${getType(item.array)}[]`;
  if (item.kind === "keyword") return item.keyword;
  if (item.kind === "typeRef")
    return item.typeRef.typeParams ? `${item.typeRef.typeName}<${item.typeRef.typeParams.map((x) => getType(x)).join(", ")}>` : item.typeRef.typeName;
  if (item.kind === "literal") return getType(item.literal);
  if (item.kind === "string") return `'${item.string}'`;
  if (item.kind === "parenthesized") return `( ${getType(item.parenthesized)} )`;
  if (item.kind === "fnOrConstructor")
    return `(${item.fnOrConstructor.params.map((x) => getType(x)).join(", ")}) => ${getType(item.fnOrConstructor.tsType)}`;
  if (item.kind === "identifier") return `${item.name}${item.optional ? "?" : ""}: ${getType(item.tsType)}`;
  else return JSON.stringify(item);
};
// ((x: Tensor) => Tensor) | { call: (x: Tensor) => Tensor }
const ItemType = ({ item }: { item: any }) => {
  return (
    <div>
      {item.name} = {getType(item.typeAliasDef.tsType)}
    </div>
  );
};

const ItemClass = ({ item }: { item: Node }) => {
  return <div></div>;
};
const Item = ({ item }: { item: any }) => {
  if (item.kind === "typeAlias") return <ItemType item={item} />;
  if (item.kind === "class") return <ItemClass item={item} />;
};

export const Items = ({ items }: { items: any[] }) => {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex gap-2">
            <p>{item.name}</p>
            <a target="_blank" href={ghUrl(item.location)}>
              Github
            </a>
          </div>
          <Item item={item} />
          <p className="whitespace-pre bg-red-500 text-xs">{JSON.stringify(item, null, 4)}</p>
        </div>
      ))}
    </div>
  );
};

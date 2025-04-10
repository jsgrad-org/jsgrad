import { createContext, type ReactNode, useContext, useState } from "react";
import { Markdown } from "./Markdown.tsx";
import { Code, CodeInit } from "./Code.tsx";

const CELL_TYPES = ["code", "markdown"];
type CellType = "code" | "markdown";
type Cell = { type: CellType; content: string };
type Notebook = {
  cells: Cell[];
  setCells: (c: Cell[]) => void;
};

const parseCode = (code: string) => {
  const out: Cell[] = [];
  const pattern = /\/\*\*\s*\[\]\(cell:(\w+)\)\s*\*\//g;
  const splits = code.split(pattern).slice(1);
  for (let i = 0; i < splits.length; i += 2) {
    const type = splits[i] as CellType;
    if (!CELL_TYPES.includes(type)) throw new Error(`Invalid cell type ${type}`);
    let content = splits[i + 1].trim();
    if (type === "markdown") content = content.split("\n").slice(1, -1).join("\n");
    out.push({ type, content });
  }
  console.log(out);
  return out;
};

const NotebookContext = createContext<Notebook | undefined>(undefined);
const useNotebook = () => {
  const res = useContext(NotebookContext);
  if (!res) throw new Error(`You can access NotebookContext only in the provider`);
  return res;
};
export const NotebookProvider = ({ code, children }: { children: ReactNode; code: string }) => {
  const [cells, setCells] = useState(() => parseCode(code));
  return <NotebookContext.Provider value={{ cells, setCells }}>{children}</NotebookContext.Provider>;
};

export const App = ({ code }: { code: string }) => {
  return (
    <NotebookProvider code={code}>
      <Cells />
    </NotebookProvider>
  );
};

const Cells = () => {
  const { cells } = useNotebook();
  return (
    <div className="flex flex-col gap-6 bg-[#1e1e1e] text-white p-10">
      <CodeInit />
      {cells.map((cell, i) => (
        <div key={i} className="">
          {cell.type === "markdown" && <Markdown content={cell.content} />}
          {cell.type === "code" && <Code content={cell.content} />}
        </div>
      ))}
    </div>
  );
};

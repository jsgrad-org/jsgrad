import { Editor, useMonaco } from "@monaco-editor/react";
import { useEffect, useState } from "react";

export const CodeInit = () => {
  const monaco = useMonaco();
  const [typesLoaded, setTypesLoaded] = useState(false);

  useEffect(() => {
    if (!monaco || typesLoaded) return;

    const loadTypes = async () => {
      try {
        
        const base = await fetch("https://esm.sh/@jsgrad/jsgrad/types/jsgrad/base.d.ts").then((x) => x.text());
        monaco.languages.typescript.typescriptDefaults.addExtraLib(base, "file:///node_modules/@jsgrad/jsgrad/index.d.ts");

        const tensor = await fetch("https://esm.sh/@jsgrad/jsgrad/types/jsgrad/tensor.d.ts").then((x) => x.text());
        monaco.languages.typescript.typescriptDefaults.addExtraLib(tensor, "file:///node_modules/@jsgrad/jsgrad/tensor.ts.d.ts");

        setTypesLoaded(true); // Mark types as loaded
      } catch (error) {
        console.error("Failed to load type definitions:", error);
      }
    };

    loadTypes();
  }, [monaco, typesLoaded]);

  return null;
};

export const Code = ({ content }: { content: string }) => {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;
    // Ensure TypeScript compiler options are set
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
    });
  }, [monaco]);

  return (
    <Editor
      className="border border-white rounded"
      defaultPath="file:///"
      defaultLanguage="typescript"
      defaultValue={content}
      height={90}
      onChange={(e) => console.log(e)}
      options={{
        lineNumbers: "off",
        stickyScroll: { enabled: false },
        wordWrap: "off",
        minimap: { enabled: false },
        formatOnType: true,
      }}
      theme="vs-dark"
    />
  );
};

import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ base: "./src/blog", pattern: "**/*.(md|mdx)", generateId: ({ entry }) => entry.split(".md")[0] }),
  schema: z.object({
    title: z.string(),
  }),
});

const docs = defineCollection({
  loader: glob({ base: "./src/docs", pattern: "**/*.(md|mdx)", generateId: ({ entry }) => entry.split(".md")[0] }),
  schema: z.object({
    title: z.string(),
  }),
});

const api = defineCollection({
  loader: file("./.astro/docs.json", {
    parser: (x) => {
      const data = JSON.parse(x);
      const getPath = (fn: string) => fn.split("jsgrad/jsgrad/")[1].replace(".ts", "");
      const paths: Record<string, Node[]> = {};
      for (const item of data.nodes) {
        const fn = getPath(item.location.filename);
        if (!fn) continue;
        if (!paths[fn]) paths[fn] = [];
        paths[fn].push(item);
      }
      return Object.entries(paths).map(([id, items]) => ({ id, items }));
    },
  }),
});

export const collections = { blog, docs, api };

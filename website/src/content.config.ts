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
      return data.nodes.map((x: any) => ({ ...x, id: x.name }));
    },
  }),
});

export const collections = { blog, docs, api };

import { Editor, rootCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import { DOMParser } from "@milkdown/kit/prose/model";
import { markdownSchema, configureMarkdownSchema } from "./schema";

// Build the shared schema in a detached, temporary editor, then immediately destroy its view.
// Retain only the schema/converter, never documents or HTML from previous copy operations.
export async function createMarkdownClipboard() {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement("div"));
      configureMarkdownSchema(ctx);
    })
    .use(markdownSchema);
  await editor.create();
  const convert = editor.action((ctx) => {
    const parser = DOMParser.fromSchema(ctx.get(schemaCtx));
    const serialize = ctx.get(serializerCtx);
    return (fragment: HTMLElement) => serialize(parser.parse(fragment)).trimEnd();
  });
  await editor.destroy();
  return convert;
}

import path from "node:path";
import { pathToFileURL } from "node:url";

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    const withExt = /\.[a-z]+$/i.test(rest) ? rest : `${rest}.ts`;
    const target = path.resolve(process.cwd(), "src", withExt);
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}

// Module resolution hook for `node --test`: Node's built-in TypeScript support
// requires explicit file extensions, but tsconfig (moduleResolution "bundler")
// rejects `.ts` in import paths. This lets test files keep the extensionless
// imports used everywhere else by retrying a relative import with `.ts` added.
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-z]+$/i.test(specifier);
  if (isRelative && !hasExtension) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Fall through and let Node report the original specifier.
    }
  }
  return nextResolve(specifier, context);
}

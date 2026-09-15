// Preload for the test runner: node --import ./scripts/test-register.mjs --test lib/*.test.ts
import { register } from "node:module";

register("./test-hooks.mjs", import.meta.url);

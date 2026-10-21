import { runAll } from "./harness.mjs";
import "./rules.test.js";
import "./solver.test.js";
import "./generator.test.js";

await runAll();

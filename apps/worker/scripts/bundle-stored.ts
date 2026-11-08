// pnpm --filter @kimi/worker bundle:stored — writes src/stored.gen.json from content/problems (the public judge build).
import { BUNDLE_PATH, writeBundle } from "../src/stored-bundle.ts";

writeBundle();
process.stdout.write(`wrote ${BUNDLE_PATH}\n`);

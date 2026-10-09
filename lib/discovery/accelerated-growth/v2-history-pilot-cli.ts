import { readFileSync } from "node:fs";
import { evaluateV2HistoricalPilotBundle } from "./v2-history-pilot-bundle";

/**
 * Explicit local-file-only entry point:
 * npx tsx lib/discovery/accelerated-growth/v2-history-pilot-cli.ts /path/to/bundle.json
 * Does not read environment secrets, call Supabase, or write files.
 */
const path = process.argv[2];
if (process.argv.length !== 3 || !path || path.startsWith("-")) {
  process.stderr.write("Usage: tsx v2-history-pilot-cli.ts <local-bundle.json>\n");
  process.exitCode = 2;
} else {
  try {
    const bytes = readFileSync(path);
    if (bytes.byteLength > 32 * 1024 * 1024) {
      process.stderr.write("Pilot bundle exceeds 32 MiB\n");
      process.exitCode = 2;
    } else {
      const result = evaluateV2HistoricalPilotBundle(bytes.toString("utf8"));
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (!result.accepted) process.exitCode = 1;
    }
  } catch {
    process.stderr.write("Could not read supplied local pilot bundle\n");
    process.exitCode = 2;
  }
}

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
  console.log(`updated ${path}`);
}

function replaceOnce(content, from, to, label) {
  const index = content.indexOf(from);
  if (index === -1) {
    throw new Error(`Could not find expected ${label} snippet.`);
  }
  if (content.indexOf(from, index + from.length) !== -1) {
    throw new Error(`Expected only one ${label} snippet, found more than one.`);
  }
  return content.slice(0, index) + to + content.slice(index + from.length);
}

// app/discovery/page.tsx
{
  const path = "app/discovery/page.tsx";
  let content = read(path);

  content = replaceOnce(
    content,
    `  const selectedMode =\n    mode === "paper_active"\n      ? "paper_active"\n      : "paper_long_term";`,
    `  const selectedMode =\n    mode === "paper_active"\n      ? "paper_active"\n      : mode === "real"\n        ? "real"\n        : "paper_long_term";`,
    "Discovery selectedMode"
  );

  const activeLink = `          <Link\n            href="/discovery?mode=paper_active"\n            className={\`rounded px-4 py-2 text-sm font-medium \${\n              selectedMode ===\n              "paper_active"\n                ? "bg-black text-white"\n                : "border border-gray-300 bg-white text-gray-700"\n            }\`}\n          >\n            AI Active\n          </Link>`;

  const activeAndRealLinks = `${activeLink}\n\n          <Link\n            href="/discovery?mode=real"\n            className={\`rounded px-4 py-2 text-sm font-medium \${\n              selectedMode ===\n              "real"\n                ? "bg-black text-white"\n                : "border border-gray-300 bg-white text-gray-700"\n            }\`}\n          >\n            Real Portfolio\n          </Link>`;

  content = replaceOnce(
    content,
    activeLink,
    activeAndRealLinks,
    "AI Active Discovery link"
  );

  write(path, content);
}

// lib/discovery/process-scan-run.ts
{
  const path = "lib/discovery/process-scan-run.ts";
  let content = read(path);

  content = replaceOnce(
    content,
    `import {\n  finalizeDiscoveryScan,\n} from "./finalize-scan";`,
    `import {\n  finalizeDiscoveryScan,\n} from "./finalize-scan";\n\nimport type {\n  DiscoveryPortfolioMode,\n} from "./types";`,
    "DiscoveryPortfolioMode import"
  );

  content = replaceOnce(
    content,
    `  const portfolioMode =\n    scanRun.portfolio_type as\n      | "paper_active"\n      | "paper_long_term";`,
    `  const portfolioMode =\n    scanRun.portfolio_type as\n      DiscoveryPortfolioMode;`,
    "deep scoring portfolio mode cast"
  );

  write(path, content);
}

// app/committee-actions.ts
{
  const path = "app/committee-actions.ts";
  let content = read(path);

  content = replaceOnce(
    content,
    `const portfolioMode: CommitteePortfolioMode =\n  portfolio.type === "real"\n    ? "paper_long_term"\n    : (portfolio.type as CommitteePortfolioMode);`,
    `const portfolioMode: CommitteePortfolioMode =\n  portfolio.type === "real"\n    ? "paper_long_term"\n    : (portfolio.type as CommitteePortfolioMode);\n\nconst discoveryPortfolioMode =\n  portfolio.type === "real"\n    ? "real"\n    : portfolioMode;`,
    "committee portfolio mode"
  );

  const discoveryStart = content.indexOf(`.from(\n        "stock_discovery_candidates"\n      )`);
  if (discoveryStart === -1) {
    throw new Error("Could not find Discovery candidate query in committee-actions.ts.");
  }

  const before = content.slice(0, discoveryStart);
  let after = content.slice(discoveryStart);
  const from = `      .eq(\n        "portfolio_type",\n        portfolioMode\n      )`;
  const to = `      .eq(\n        "portfolio_type",\n        discoveryPortfolioMode\n      )`;
  if (!after.includes(from)) {
    throw new Error("Could not find committee Discovery portfolio filter.");
  }
  after = after.replace(from, to);
  content = before + after;

  write(path, content);
}

console.log("Real Portfolio Discovery wiring applied successfully.");

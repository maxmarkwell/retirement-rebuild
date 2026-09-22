export const AG_THEME_VERSION = "ag-theme-v1";

const normalize = (value: string | null | undefined) =>
  value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || null;

// v1 deliberately uses deterministic sector attribution from the FMP discovery
// universe. It is a concentration bucket, not an AI-generated investment theme.
export function deriveAgThemeKey(input: { sector?: string | null }): string | null {
  const sector = normalize(input.sector);
  return sector ? `${AG_THEME_VERSION}:sector:${sector}` : null;
}

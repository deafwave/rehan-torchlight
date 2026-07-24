import type { LocalCaptureHandoff } from "./analysis-types";

// tli_dump treats BDID as an opaque, non-empty string. Keep the browser
// boundary equally conservative: recognize the base64-shaped codes players
// share, but do not pretend their bytes contain character state.
const BUILD_CODE_PATTERN = /(?:^|[^A-Za-z0-9+/])([A-Za-z0-9+/]{20,}={0,2})(?=$|[^A-Za-z0-9+/=])/;

export function extractInGameBuildCode(raw: string): string | null {
  return raw.trim().match(BUILD_CODE_PATTERN)?.[1] ?? null;
}

export function createLocalCaptureHandoff(buildCode: string): LocalCaptureHandoff {
  return {
    kind: "tli-dump-local-capture",
    buildCode,
    resolver: "tli_dump",
    privacy: "local-export",
    steps: [
      {
        title: "Open the referenced build in-game",
        detail: "Use the code in Torchlight: Infinite, open its Pro Build / Build Reference detail, and leave the viewed build open.",
      },
      {
        title: "Let tli_dump capture the Character view",
        detail: "Run tli_dump locally and leave the build's Character tab visible until its capture is ready. The tool reads the active ViewPlayerBDReference page; it does not resolve codes over the web.",
      },
      {
        title: "Export JSON locally",
        detail: "Use “Copy TLI Compendium JSON” in tli_dump. A portable-v3 file produced with --portable-json is also accepted for structural inspection and its converter coverage report; portable formula inputs remain blocked until catalog attestation is implemented.",
      },
      {
        title: "Bring the export back here",
        detail: "Paste the copied JSON or drop the saved JSON file into TLI Lens, then select it as Before or After.",
      },
    ],
    acceptedDocuments: [
      "tli_dump portable-v3 JSON",
      "TLI Compendium build JSON",
    ],
  };
}

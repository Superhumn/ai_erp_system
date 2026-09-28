import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("./db", () => ({}));
vi.mock("./_core/env", () => ({
  ENV: {
    r2PublicUrl: "",
    r2AccountId: "",
    llmApiKey: "test-key",
    llmApiUrl: "",
    llmModel: "claude-opus-5",
  },
}));

import {
  buildDocumentMessageContent,
  assertPdfRasterizerAvailable,
  resetPdfRasterizerCheck,
} from "./documentImportService";

function gmAvailable(): boolean {
  try {
    execSync("gm version", { stdio: "ignore" });
    execSync("gs --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("assertPdfRasterizerAvailable", () => {
  beforeEach(() => resetPdfRasterizerCheck());
  afterEach(() => resetPdfRasterizerCheck());

  it("explains the missing packages instead of failing inside pdf2pic", () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      expect(() => assertPdfRasterizerAvailable()).toThrow(/GraphicsMagick and Ghostscript/);
    } finally {
      process.env.PATH = origPath;
    }
  });
});

// Real render: builds an image-only PDF with GraphicsMagick, then runs the
// scanned-PDF path (pdfjs finds no text -> pdf2pic rasterizes -> vision blocks).
// Skipped where gm/gs are not installed; the Dockerfile installs both.
describe.skipIf(!gmAvailable())("scanned PDF OCR rendering", () => {
  let dir: string;
  beforeEach(() => {
    resetPdfRasterizerCheck();
    dir = mkdtempSync(join(tmpdir(), "ocr-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("rasterizes an image-only PDF into image blocks for the vision model", async () => {
    const png = join(dir, "scan.png");
    const pdf = join(dir, "scan.pdf");
    execSync(`gm convert -size 600x300 xc:white -fill black -draw "rectangle 30,30 300,70" -draw "rectangle 30,120 500,160" "${png}"`);
    execSync(`gm convert "${png}" "${pdf}"`);
    const dataUrl = `data:application/pdf;base64,${readFileSync(pdf).toString("base64")}`;

    const built = await buildDocumentMessageContent(dataUrl, "scan.pdf", "Extract the invoice.", "application/pdf");

    expect(built.ok).toBe(true);
    expect(built.isPdf).toBe(true);
    expect(built.hasImageContent).toBe(true);
    const images = built.content.filter((c: any) => c.type === "image_url");
    expect(images).toHaveLength(1);
    expect(images[0].image_url.url).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    // The rendered page is a real PNG, not an empty payload.
    const bytes = Buffer.from(images[0].image_url.url.split(",")[1], "base64");
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }, 60_000);
});

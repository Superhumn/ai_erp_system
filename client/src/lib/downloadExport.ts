/**
 * Trigger a browser download for a tRPC export result produced by
 * server/_core/messageExport.ts.
 */
export interface ExportResult {
  data: string;
  filename: string;
  mimeType: string;
  encoding: "base64" | "utf-8";
}

export function downloadExport(result: ExportResult): void {
  let blob: Blob;
  if (result.encoding === "base64") {
    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: result.mimeType });
  } else {
    blob = new Blob([result.data], { type: `${result.mimeType};charset=utf-8` });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

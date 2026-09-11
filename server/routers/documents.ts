// appRouter.documents — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { createAuditLog } from "./_shared";

// ============================================
// LEGAL - DOCUMENTS
// ============================================
export const documentsRouter = router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getDocuments(input)),
    // Batched doc counts for many references at once, so a table can show a
    // per-row count with one query instead of one query per row.
    countsByReferences: protectedProcedure
      .input(z.object({
        referenceType: z.string(),
        referenceIds: z.array(z.number()),
      }))
      .query(({ input }) => db.getDocumentCountsByReferences(input.referenceType, input.referenceIds)),
    upload: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['contract', 'invoice', 'receipt', 'report', 'legal', 'hr', 'freight', 'customs', 'bol', 'packing_list', 'certificate', 'po', 'other']),
        category: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
        fileData: z.string(), // base64 encoded
        mimeType: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { fileData, mimeType: inputMimeType, ...docData } = input;
        const mimeType = inputMimeType || 'application/octet-stream';
        const buffer = Buffer.from(fileData, 'base64');
        const fileKey = `documents/${ctx.user.id}/${nanoid()}-${input.name}`;

        // Try S3 first, fall back to base64 data URL
        let url: string;
        try {
          const uploaded = await storagePut(fileKey, buffer, mimeType);
          url = uploaded.url;
        } catch {
          // S3 not configured — store as base64 data URL (works for files <5MB)
          url = `data:${mimeType};base64,${fileData}`;
        }

        const result = await db.createDocument({
          ...docData,
          fileUrl: url,
          fileKey,
          fileSize: buffer.length,
          mimeType,
          uploadedBy: ctx.user.id,
        });

        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);

        // If this is a 409A valuation report, parse it for FMV value
        const isSpreadsheet = mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("sheet") || input.name.match(/\.(xlsx|xls)$/i) !== null;
        if (input.referenceType === "valuation" && (mimeType.includes("pdf") || mimeType.includes("image") || isSpreadsheet)) {
          try {
            const { invokeLLM } = await import("../_core/llm");
            let userContent: any;

            if (mimeType.includes("pdf")) {
              // Extract text from PDF so we can pass it as text to the LLM
              // (Sending a PDF as image_url is not supported by Anthropic)
              let pdfText: string | null = null;
              try {
                let pdfBuffer: Buffer | null = null;
                if (url.startsWith("data:")) {
                  const base64Data = url.split(",")[1];
                  if (base64Data) pdfBuffer = Buffer.from(base64Data, "base64");
                } else {
                  const pdfResponse = await fetch(url);
                  if (pdfResponse.ok) pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                }
                if (pdfBuffer) {
                  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
                  const pdf = await (pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) })).promise;
                  let text = "";
                  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 10); pageNumber++) {
                    const page = await pdf.getPage(pageNumber);
                    const tc = await page.getTextContent();
                    text += tc.items.map((item: any) => item.str).join(" ") + "\n";
                  }
                  if (text.trim().length > 0) pdfText = text.substring(0, 30000);
                }
              } catch (pdfErr) {
                console.warn("[409A] PDF text extraction failed:", pdfErr);
              }
              userContent = pdfText
                ? `Document: ${input.name}\n\nEXTRACTED TEXT:\n${pdfText}`
                : `Document: ${input.name} (PDF content could not be extracted)`;
            } else if (isSpreadsheet) {
              // Extract text from Excel/spreadsheet using xlsx library
              let sheetText: string | null = null;
              try {
                const xlsxMod = await import("xlsx");
                // CJS modules via dynamic import may expose exports under .default
                const xlsxLib = ('default' in xlsxMod && typeof (xlsxMod as any).default?.read === 'function')
                  ? (xlsxMod as any).default as typeof xlsxMod
                  : xlsxMod;
                const workbook = xlsxLib.read(buffer, { type: "buffer" });
                let text = "";
                for (const sheetName of workbook.SheetNames) {
                  text += `Sheet: ${sheetName}\n`;
                  text += xlsxLib.utils.sheet_to_csv(workbook.Sheets[sheetName]).substring(0, 10000);
                  text += "\n";
                }
                if (text.trim().length > 0) sheetText = text.substring(0, 30000);
              } catch (xlsxErr) {
                console.warn("[409A] XLSX parse failed:", xlsxErr);
              }
              userContent = sheetText
                ? `Document: ${input.name}\n\nSPREADSHEET CONTENT:\n${sheetText}`
                : `Document: ${input.name} (Spreadsheet content could not be extracted)`;
            } else {
              // Image: pass directly as image_url
              userContent = [
                { type: "text" as const, text: `Document: ${input.name}` },
                { type: "image_url" as const, image_url: { url } },
              ];
            }

            const fmvResponse = await invokeLLM({
              messages: [
                { role: "system", content: "Extract the 409A fair market value per share from this valuation document. Return JSON: {\"fmvPerShare\": number, \"totalValuation\": number, \"valuationDate\": \"YYYY-MM-DD\", \"provider\": \"string\"}. If you cannot find the data, return {\"fmvPerShare\": null}." },
                { role: "user", content: userContent },
              ],
            });
            const fmvText = typeof fmvResponse.choices?.[0]?.message?.content === "string" ? fmvResponse.choices[0].message.content : "";
            try {
              const fmvData = JSON.parse(fmvText.replace(/```json\n?|\n?```/g, "").trim());
              if (fmvData.fmvPerShare) {
                // Always create a new valuation record to preserve history
                const valuationDate = fmvData.valuationDate ? new Date(fmvData.valuationDate) : new Date();
                const newValuation = await db.createValuation409a({
                  fairMarketValue: String(fmvData.fmvPerShare),
                  valuationDate,
                  ...(fmvData.totalValuation ? { totalValuation: String(fmvData.totalValuation) } : {}),
                  ...(fmvData.provider ? { provider: fmvData.provider } : {}),
                  ...(input.companyId ? { companyId: input.companyId } : {}),
                  reportUrl: url,
                  status: "approved",
                });
                // Link the document to the newly created valuation record
                await db.updateDocument(result.id, { referenceId: newValuation.id });
                console.log(`[409A] Created new valuation from ${input.name}: $${fmvData.fmvPerShare}/share (id=${newValuation.id})`);
              }
            } catch { /* FMV parse failed, that's ok */ }
          } catch (e) {
            console.warn("[409A] Failed to parse valuation document:", e);
          }
        }

        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDocument(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'document', input.id);
        return { success: true };
      }),
  });

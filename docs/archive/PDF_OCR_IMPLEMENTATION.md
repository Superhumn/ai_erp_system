# PDF OCR Implementation for Document Import

## Overview

The document import feature now supports **automatic OCR (Optical Character Recognition)** for scanned PDF files. This enables the system to extract structured data from PDFs that contain images rather than selectable text.

## How It Works

### 1. Initial Text Extraction
When a PDF is uploaded, the system first attempts to extract text using **pdfjs-dist**:
- Fast, pure JavaScript implementation
- Works for text-based PDFs (e.g., generated from Word, exported from software)
- No external dependencies required

### 2. Scanned PDF Detection
After text extraction, the system checks if sufficient text was extracted:
- **Threshold**: 100 characters
- If less than 100 characters extracted → PDF is likely scanned/image-based
- Triggers OCR fallback automatically

### 3. OCR Fallback Process
For scanned PDFs, the system performs these steps:

1. **PDF to Image Conversion** (using `pdf2pic`)
   - Converts the first page to a high-quality PNG image
   - Resolution: 200 DPI
   - Size: 2000×2800 pixels
   - Format: PNG with base64 encoding

2. **Vision-based OCR** (using LLM Vision API)
   - Sends the image to the LLM's vision endpoint
   - Extracts text using advanced AI vision models
   - Same structured data extraction as text-based PDFs

3. **Cleanup**
   - Temporary files are automatically removed
   - No persistent storage of intermediate files

## Supported Document Types

The system can extract structured data from:
- **Purchase Orders**: PO number, vendor info, line items, amounts
- **Freight Invoices**: Invoice number, carrier info, shipment details, charges

## Technical Details

### Dependencies
```json
{
  "pdfjs-dist": "^5.4.530",  // Text extraction
  "pdf2pic": "^3.2.0"         // PDF to image conversion
}
```

### Code Location
- Implementation: `server/documentImportService.ts`
- Function: `parseUploadedDocument()`
- Lines: ~203-299

### Performance Considerations

**Text-based PDFs:**
- Very fast (< 1 second for multi-page documents)
- Low resource usage
- No external API calls for extraction

**Scanned PDFs:**
- Slower due to image conversion (~2-5 seconds)
- Higher resource usage (image processing)
- Requires LLM API call with vision support
- Currently processes first page only for efficiency

### Error Handling

The system gracefully handles errors:
1. If PDF download fails → Returns error immediately
2. If text extraction fails → Attempts OCR fallback
3. If OCR conversion fails → Returns descriptive error
4. Temporary directories are cleaned up in all cases

## Usage Examples

### Upload a Text-based PDF
```typescript
const result = await parseUploadedDocument(
  'https://s3.example.com/po-12345.pdf',
  'po-12345.pdf',
  'purchase_order'
);
// Fast text extraction, returns structured data
```

### Upload a Scanned PDF
```typescript
const result = await parseUploadedDocument(
  'https://s3.example.com/scanned-invoice.pdf',
  'scanned-invoice.pdf',
  'freight_invoice'
);
// Automatic OCR fallback, returns structured data
```

## Monitoring & Logs

The system provides detailed logging:
- `[DocumentImport]` prefix for all logs
- Text extraction status and length
- OCR fallback triggers
- Conversion progress
- Cleanup status

Example log flow for scanned PDF:
```
[DocumentImport] Extracting text from PDF using pdfjs-dist
[DocumentImport] PDF loaded, pages: 1
[DocumentImport] PDF text extracted, length: 42
[DocumentImport] Insufficient text extracted, PDF appears to be scanned. Falling back to OCR...
[DocumentImport] Converting PDF to images for OCR...
[DocumentImport] PDF converted to image, using vision OCR
```

## System Requirements

The OCR functionality requires these system dependencies to be installed:

- **ImageMagick** (version 6.9+): Required for PDF to image conversion
  ```bash
  apt-get install imagemagick
  ```
- **Ghostscript** (version 9.0+): Required for PDF processing
  ```bash
  apt-get install ghostscript
  ```

**Note**: The system is configured to use ImageMagick (not GraphicsMagick). The `pdf2pic` library is configured via `convert.setGMClass(true)` to use ImageMagick's `convert` command.

## Testing

Run the comprehensive OCR test suite:
```bash
node test_ocr_functionality.mjs
```

This verifies:
- ✅ PDF text extraction using pdfjs-dist
- ✅ Scanned PDF detection
- ✅ PDF to image conversion using pdf2pic
- ✅ Base64 encoding for vision API
- ✅ Temporary file cleanup
- ✅ All required dependencies

Run the integration workflow test:
```bash
node test_document_import_workflow.mjs
```

This demonstrates the complete end-to-end document import flow.

## Future Enhancements

Potential improvements:
- [ ] Multi-page OCR support (currently only first page)
- [ ] Batch processing optimization
- [ ] Quality detection to skip OCR for low-quality scans
- [ ] Progress callbacks for long operations
- [ ] Caching of OCR results

## Troubleshooting

### PDF Processing Fails
- Check PDF is accessible at the provided URL
- Verify PDF is not corrupted or password-protected
- Ensure LLM API is configured and accessible

### OCR Conversion Fails
- Verify ImageMagick is installed: `convert --version`
- Verify Ghostscript is installed: `gs --version`
- Check that pdf2pic is configured to use ImageMagick (not GraphicsMagick)
- Ensure the system has sufficient disk space for temporary files

### OCR Returns Poor Results
- Original scan quality may be too low
- Try re-scanning at higher DPI (300+)
- Ensure document is not skewed or rotated

### Slow Performance
- Normal for scanned PDFs (2-5 seconds)
- If consistently slow, check LLM API latency
- Consider implementing caching layer

## Recent Fixes

**January 2026**: Fixed OCR fallback configuration
- Added `convert.setGMClass(true)` to configure pdf2pic to use ImageMagick instead of GraphicsMagick
- This resolves "Could not execute GraphicsMagick/ImageMagick" errors
- See `OCR_FIX_SUMMARY.md` for details

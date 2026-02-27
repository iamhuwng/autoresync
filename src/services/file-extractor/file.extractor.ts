import type { Result } from '../../types/result.types';

/**
 * File extraction service
 * Extracts text from TXT, DOCX, PDF, and MD files
 * 
 * @version 2.0.0 - Added markdown support and file corruption detection
 * @date 2026-02-05
 * @see PRD-0020 Phase 2
 */

/**
 * Validate extracted content and return result
 * Detects file corruption (empty content after extraction)
 */
function validateAndReturn(result: Result<string>, fileName: string): Result<string> {
  // If extraction failed, return as-is
  if (!result.success) {
    return result;
  }

  // Check for empty content (file corruption detection)
  if (!result.data || result.data.trim().length === 0) {
    return {
      success: false,
      error: `The file "${fileName}" appears to be empty or corrupted. No text content could be extracted. Please check the file and try again.`,
    };
  }

  return result;
}

/**
 * Extract text from a TXT file
 */
async function extractTxt(file: File): Promise<Result<string>> {
  try {
    const text = await file.text();
    return { success: true, data: text };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract text from a Markdown file (treat as plain text)
 * @description Markdown files are read as-is since they're already text-based.
 * Markdown formatting is preserved for potential parsing by downstream services.
 */
async function extractMd(file: File): Promise<Result<string>> {
  try {
    const text = await file.text();

    // Check for empty content (file corruption detection)
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'The markdown file appears to be empty or corrupted. Please check the file and try again.',
      };
    }

    return { success: true, data: text };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract text from a DOCX file using mammoth
 */
async function extractDocx(file: File): Promise<Result<string>> {
  try {
    // Dynamic import to avoid bundling if not used
    const mammoth = await import('mammoth');

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Extract text with mammoth
    const result = await mammoth.extractRawText({ arrayBuffer });

    if (result.value) {
      return { success: true, data: result.value };
    }

    return {
      success: false,
      error: 'No text content found in DOCX file',
    };
  } catch (error) {
    // Check if mammoth is not installed
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      return {
        success: false,
        error: 'DOCX support requires the "mammoth" package. Please install it: npm install mammoth',
      };
    }

    return {
      success: false,
      error: `Failed to extract DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract text from a PDF file using pdf.js
 * 
 * IMPORTANT: Uses Y-coordinate analysis to detect line breaks and paragraph breaks.
 * PDF text items have transform data [scaleX, skewX, skewY, scaleY, x, y].
 * - Same Y (within threshold): items on the same line → join with space
 * - Small Y gap: new line within same paragraph → join with newline
 * - Large Y gap: new paragraph → join with double newline
 * 
 * This preserves the original document structure including:
 * - Paragraph breaks
 * - Paragraph labels (A, B, C, i, ii, Section X, etc.)
 * - Line breaks within paragraphs
 */
async function extractPdf(file: File): Promise<Result<string>> {
  try {
    // Dynamic import to avoid bundling if not used
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker path (required for pdf.js) - use CDN for worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extract text from all pages with structure preservation
    const textPromises: Promise<string>[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      textPromises.push(
        pdf.getPage(pageNum).then(async (page) => {
          const textContent = await page.getTextContent();
          const items = textContent.items as any[];

          if (items.length === 0) return '';

          // Build structured text using Y-coordinate analysis
          const lines: string[] = [];
          let currentLine = '';
          let lastY: number | null = null;
          let lastItemEndX = 0;
          let lastFontSize = 0;

          for (const item of items) {
            if (!item.str && !item.hasEOL) continue;

            // Extract position from transform matrix [scaleX, skewX, skewY, scaleY, x, y]
            const y = item.transform ? item.transform[5] : null;
            const x = item.transform ? item.transform[4] : 0;
            const fontSize = item.transform ? Math.abs(item.transform[3]) : 12;
            const itemWidth = item.width || 0;

            if (lastY === null) {
              // First item
              currentLine = item.str || '';
              lastY = y;
              lastItemEndX = x + itemWidth;
              lastFontSize = fontSize;
              continue;
            }

            if (y === null) {
              // No position data, just append
              currentLine += item.str || '';
              continue;
            }

            // Calculate Y distance (PDF Y increases upward, so same-line items have ~same Y)
            const yDiff = Math.abs(y - lastY);
            // Use font size as reference for line height detection
            const lineHeight = Math.max(fontSize, lastFontSize, 10);

            if (yDiff < lineHeight * 0.3) {
              // Same line - check if we need a space between items
              const gap = x - lastItemEndX;
              if (gap > fontSize * 0.3 && currentLine.length > 0 && !currentLine.endsWith(' ')) {
                currentLine += ' ';
              }
              currentLine += item.str || '';
            } else if (yDiff < lineHeight * 1.8) {
              // New line (small gap) - within same paragraph
              if (currentLine.trim()) {
                lines.push(currentLine.trim());
              }
              currentLine = item.str || '';
            } else {
              // New paragraph (large gap) - add empty line separator
              if (currentLine.trim()) {
                lines.push(currentLine.trim());
              }
              lines.push(''); // Empty line = paragraph break
              currentLine = item.str || '';
            }

            lastY = y;
            lastItemEndX = x + itemWidth;
            lastFontSize = fontSize;
          }

          // Don't forget the last line
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }

          return lines.join('\n');
        })
      );
    }

    const pageTexts = await Promise.all(textPromises);
    const fullText = pageTexts.join('\n\n');

    if (fullText.trim()) {
      return { success: true, data: fullText };
    }

    return {
      success: false,
      error: 'No text content found in PDF file',
    };
  } catch (error) {
    // Check if pdfjs-dist is not installed
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      return {
        success: false,
        error: 'PDF support requires the "pdfjs-dist" package. Please install it: npm install pdfjs-dist',
      };
    }

    return {
      success: false,
      error: `Failed to extract PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract text from any supported file type
 */
export async function extractTextFromFile(file: File): Promise<Result<string>> {
  // Validate file exists
  if (!file) {
    return {
      success: false,
      error: 'No file provided',
    };
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > maxSize) {
    return {
      success: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (10MB)`,
    };
  }

  // Get file extension
  const fileName = file.name.toLowerCase();
  const extension = fileName.split('.').pop();

  // Route to appropriate extractor
  switch (extension) {
    case 'txt':
      return validateAndReturn(await extractTxt(file), file.name);

    case 'md':
    case 'markdown':
      return validateAndReturn(await extractMd(file), file.name);

    case 'docx':
      return validateAndReturn(await extractDocx(file), file.name);

    case 'pdf':
      return validateAndReturn(await extractPdf(file), file.name);

    case 'doc':
      return {
        success: false,
        error: 'Legacy .doc files are not supported. Please convert to .docx format using Microsoft Word or Google Docs, then try again.',
      };

    case 'rtf':
      return {
        success: false,
        error: 'RTF files are not yet supported. Please save as .docx or .txt format and try again.',
      };

    case 'odt':
      return {
        success: false,
        error: 'OpenDocument files (.odt) are not yet supported. Please save as .docx or .txt format and try again.',
      };

    default:
      return {
        success: false,
        error: `Unsupported file type: .${extension}. Supported formats: TXT, DOCX, PDF, MD. Please convert your file to one of these formats.`,
      };
  }
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return ['txt', 'docx', 'pdf', 'md', 'markdown'];
}

/**
 * Get accept attribute for file input
 */
export function getFileInputAccept(): string {
  return '.txt,.docx,.pdf,.md,.markdown';
}

/**
 * Validate file type before upload
 */
export function isFileTypeSupported(file: File): boolean {
  const extension = file.name.toLowerCase().split('.').pop();
  return getSupportedExtensions().includes(extension || '');
}

/**
 * Get maximum file size in bytes (10MB)
 */
export function getMaxFileSize(): number {
  return 10 * 1024 * 1024; // 10MB
}

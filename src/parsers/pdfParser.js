import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for PDF.js - use local worker from node_modules
// This avoids CORS issues and works with Vite's dev server
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch (error) {
  // Fallback for environments where import.meta.url might not work
  console.warn('Failed to set PDF.js worker from import.meta.url, using CDN fallback');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

/**
 * PDF Parser for Quiz Files
 * Extracts text from PDF files and converts to quiz format
 */

/**
 * Parse PDF file and extract quiz data
 * @param {File} file - The PDF file to parse
 * @returns {Promise<Object>} Parsed quiz data with confidence scores
 */
export async function parsePdfFile(file) {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // Extract text from all pages
    let fullText = '';
    const numPages = pdf.numPages;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items from the page
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');
      
      fullText += pageText + '\n\n';
    }
    
    if (!fullText || fullText.trim().length === 0) {
      return {
        success: false,
        error: 'PDF file contains no readable text. It may be scanned or image-based.',
        confidence: 0
      };
    }
    
    // Parse the extracted text using the text parser
    const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
    const { parseWithAIFallback, shouldTriggerAI } = await import('../utils/parsers/aiParser.js');
    
    // Try rule-based parsing first
    const ruleBasedResult = parseTextToQuiz(fullText);
    
    // Check if AI fallback should be triggered
    let parsedResult;
    if (shouldTriggerAI(ruleBasedResult.confidence)) {
      console.log(`Low confidence (${ruleBasedResult.confidence}%), attempting AI parsing...`);
      parsedResult = await parseWithAIFallback(fullText, file.name, ruleBasedResult);
    } else {
      parsedResult = {
        ...ruleBasedResult,
        source: 'rule-based'
      };
    }
    
    // Add PDF-specific metadata
    return {
      ...parsedResult,
      sourceFormat: 'pdf',
      originalFileName: file.name,
      numPages,
      extractedTextLength: fullText.length
    };
    
  } catch (error) {
    console.error('Error parsing PDF file:', error);
    
    // Provide helpful error messages
    let errorMessage = `Failed to parse PDF file: ${error.message}`;
    
    if (error.message.includes('Invalid PDF')) {
      errorMessage = 'The file appears to be corrupted or is not a valid PDF';
    } else if (error.message.includes('password')) {
      errorMessage = 'This PDF is password-protected. Please use an unprotected PDF.';
    }
    
    return {
      success: false,
      error: errorMessage,
      confidence: 0
    };
  }
}

/**
 * Validate PDF file before parsing
 * @param {File} file - The file to validate
 * @returns {Object} Validation result
 */
export function validatePdfFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'File must be a .pdf file' };
  }
  
  // Check file size (max 10MB for PDF)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'PDF file size must be less than 10MB' };
  }
  
  if (file.size === 0) {
    return { valid: false, error: 'PDF file is empty' };
  }
  
  return { valid: true };
}

export default {
  parsePdfFile,
  validatePdfFile
};

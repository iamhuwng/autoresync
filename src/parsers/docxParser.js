import mammoth from 'mammoth';

/**
 * DOCX Parser for Quiz Files
 * Extracts text from DOCX files and converts to quiz format
 */

/**
 * Parse DOCX file and extract quiz data
 * @param {File} file - The DOCX file to parse
 * @returns {Promise<Object>} Parsed quiz data with confidence scores
 */
export async function parseDocxFile(file) {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Extract text from DOCX using mammoth
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'DOCX file is empty or contains no readable text',
        confidence: 0
      };
    }
    
    // Parse the extracted text using the text parser
    const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
    const { parseWithAIFallback, shouldTriggerAI } = await import('../utils/parsers/aiParser.js');
    
    // Try rule-based parsing first
    const ruleBasedResult = parseTextToQuiz(text);
    
    // Check if AI fallback should be triggered
    let parsedResult;
    if (shouldTriggerAI(ruleBasedResult.confidence)) {
      console.log(`Low confidence (${ruleBasedResult.confidence}%), attempting AI parsing...`);
      parsedResult = await parseWithAIFallback(text, file.name, ruleBasedResult);
    } else {
      parsedResult = {
        ...ruleBasedResult,
        source: 'rule-based'
      };
    }
    
    // Add DOCX-specific metadata
    return {
      ...parsedResult,
      sourceFormat: 'docx',
      originalFileName: file.name,
      extractedTextLength: text.length
    };
    
  } catch (error) {
    console.error('Error parsing DOCX file:', error);
    return {
      success: false,
      error: `Failed to parse DOCX file: ${error.message}`,
      confidence: 0
    };
  }
}

/**
 * Validate DOCX file before parsing
 * @param {File} file - The file to validate
 * @returns {Object} Validation result
 */
export function validateDocxFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return { valid: false, error: 'File must be a .docx file' };
  }
  
  // Check file size (max 10MB for DOCX)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'DOCX file size must be less than 10MB' };
  }
  
  if (file.size === 0) {
    return { valid: false, error: 'DOCX file is empty' };
  }
  
  return { valid: true };
}

export default {
  parseDocxFile,
  validateDocxFile
};

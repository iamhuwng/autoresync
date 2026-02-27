/**
 * Document Converter Service
 * 
 * Wrapper service for file extraction that provides a unified interface
 * for converting various document formats to plain text.
 * 
 * This service is part of the new test-creation pipeline:
 * File → DocumentConverter → AI Extractor → Type Classifier → Validator
 * 
 * @module document-converter.service
 * @version 1.0.0
 * @date 2026-02-05
 * @see PRD-0020 Phase 2
 */

import type { Result } from '../../types/result.types';
import {
    extractTextFromFile,
    getSupportedExtensions,
    getFileInputAccept,
    isFileTypeSupported,
    getMaxFileSize,
} from '../file-extractor/file.extractor';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Document conversion result with metadata
 */
export interface ConversionResult {
    /** Extracted text content */
    text: string;
    /** Original file name */
    fileName: string;
    /** File size in bytes */
    fileSize: number;
    /** File extension */
    extension: string;
    /** Word count estimate */
    wordCount: number;
    /** Conversion timestamp */
    convertedAt: Date;
}

/**
 * Progress callback for conversion operations
 */
export type ConversionProgressCallback = (stage: string, progress: number) => void;

// ═══════════════════════════════════════════════════════════════
// MAIN SERVICE
// ═══════════════════════════════════════════════════════════════

/**
 * Document Converter Service
 * 
 * Provides a high-level interface for document conversion with
 * validation, progress tracking, and metadata extraction.
 */
class DocumentConverterService {
    /**
     * Convert a file to plain text
     * 
     * @param file - File to convert
     * @param onProgress - Optional progress callback
     * @returns Conversion result with text and metadata
     * 
     * @example
     * ```typescript
     * const result = await documentConverter.convertToText(file);
     * if (result.success) {
     *   console.log(`Extracted ${result.data.wordCount} words`);
     *   console.log(result.data.text);
     * }
     * ```
     */
    async convertToText(
        file: File,
        onProgress?: ConversionProgressCallback
    ): Promise<Result<ConversionResult>> {
        // Validate file
        onProgress?.('Validating file...', 10);

        const validation = this.validateFile(file);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error!,
            };
        }

        // Extract text
        onProgress?.('Extracting text...', 30);

        const extractResult = await extractTextFromFile(file);

        if (!extractResult.success) {
            return {
                success: false,
                error: extractResult.error!,
            };
        }

        // Process result
        onProgress?.('Processing content...', 80);

        const text = extractResult.data!;
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const wordCount = this.countWords(text);

        onProgress?.('Conversion complete', 100);

        return {
            success: true,
            data: {
                text,
                fileName: file.name,
                fileSize: file.size,
                extension,
                wordCount,
                convertedAt: new Date(),
            },
        };
    }

    /**
     * Validate file before conversion
     */
    validateFile(file: File): { valid: boolean; error?: string } {
        // Check if file exists
        if (!file) {
            return { valid: false, error: 'No file provided' };
        }

        // Check file type
        if (!isFileTypeSupported(file)) {
            const extension = file.name.split('.').pop()?.toLowerCase() || 'unknown';
            const supported = getSupportedExtensions().join(', ').toUpperCase();
            return {
                valid: false,
                error: `Unsupported file type: .${extension}. Please use one of: ${supported}`,
            };
        }

        // Check file size
        const maxSize = getMaxFileSize();
        if (file.size > maxSize) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            const maxMB = (maxSize / 1024 / 1024).toFixed(0);
            return {
                valid: false,
                error: `File size (${sizeMB}MB) exceeds maximum allowed size (${maxMB}MB)`,
            };
        }

        // Check for empty file
        if (file.size === 0) {
            return {
                valid: false,
                error: 'The file appears to be empty. Please check the file and try again.',
            };
        }

        return { valid: true };
    }

    /**
     * Count words in text
     */
    countWords(text: string): number {
        if (!text || text.trim().length === 0) return 0;
        return text.trim().split(/\s+/).length;
    }

    /**
     * Get supported file extensions
     */
    getSupportedExtensions(): string[] {
        return getSupportedExtensions();
    }

    /**
     * Get accept attribute for file input
     */
    getFileInputAccept(): string {
        return getFileInputAccept();
    }

    /**
     * Check if file type is supported
     */
    isFileTypeSupported(file: File): boolean {
        return isFileTypeSupported(file);
    }

    /**
     * Get maximum file size in bytes
     */
    getMaxFileSize(): number {
        return getMaxFileSize();
    }

    /**
     * Get maximum file size as human-readable string
     */
    getMaxFileSizeFormatted(): string {
        return `${(getMaxFileSize() / 1024 / 1024).toFixed(0)}MB`;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

/**
 * Singleton instance of DocumentConverterService
 * 
 * @example
 * ```typescript
 * import { documentConverter } from '../services/test-creation/document-converter.service';
 * 
 * const result = await documentConverter.convertToText(file);
 * ```
 */
export const documentConverter = new DocumentConverterService();

/**
 * Re-export for direct access
 */
export { DocumentConverterService };

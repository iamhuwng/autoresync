/**
 * ExportManager - Export drawings to PNG and PDF
 * Includes background content with annotations
 */

import jsPDF from 'jspdf';

class ExportManager {
  constructor() {
    this.exportCount = 0;
  }
  
  /**
   * Generate filename with timestamp
   * @param {string} baseName - Base name for file
   * @param {string} extension - File extension (without dot)
   * @returns {string} Filename with timestamp
   */
  generateFilename(baseName, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${baseName}-${timestamp}.${extension}`;
  }
  
  /**
   * Export canvas to PNG
   * @param {HTMLCanvasElement} canvas - Canvas element to export
   * @param {Object} options - Export options
   * @returns {string} Data URL of PNG
   */
  exportToPNG(canvas, options = {}) {
    try {
      const {
        filename = 'passage-annotated',
        scale = 2, // 2x resolution for quality
        backgroundColor = null
      } = options;
      
      // Create temporary canvas for export at higher resolution
      const exportCanvas = document.createElement('canvas');
      const ctx = exportCanvas.getContext('2d');
      
      exportCanvas.width = canvas.width * scale;
      exportCanvas.height = canvas.height * scale;
      
      // Fill background if specified
      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }
      
      // Scale context and draw source canvas
      ctx.scale(scale, scale);
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
      
      // Get data URL
      const dataURL = exportCanvas.toDataURL('image/png');
      
      // Trigger download
      this.downloadDataURL(dataURL, this.generateFilename(filename, 'png'));
      
      this.exportCount++;
      console.log(`✅ Exported PNG: ${filename}`);
      
      return dataURL;
    } catch (error) {
      console.error('❌ Failed to export PNG:', error);
      throw error;
    }
  }
  
  /**
   * Export canvas to PDF
   * @param {HTMLCanvasElement} canvas - Canvas element to export
   * @param {Object} options - Export options
   */
  exportToPDF(canvas, options = {}) {
    try {
      const {
        filename = 'passage-annotated',
        title = 'Annotated Passage',
        orientation = 'auto', // 'auto', 'portrait', 'landscape'
        format = 'a4'
      } = options;
      
      // Determine orientation
      let pdfOrientation = orientation;
      if (orientation === 'auto') {
        pdfOrientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
      }
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: format
      });
      
      // Get PDF dimensions
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate canvas aspect ratio
      const canvasAspect = canvas.width / canvas.height;
      const pdfAspect = pdfWidth / pdfHeight;
      
      // Calculate dimensions to fit canvas in PDF while maintaining aspect ratio
      let imgWidth, imgHeight, x, y;
      
      if (canvasAspect > pdfAspect) {
        // Canvas is wider - fit to width
        imgWidth = pdfWidth - 20; // 10mm margin on each side
        imgHeight = imgWidth / canvasAspect;
        x = 10;
        y = (pdfHeight - imgHeight) / 2;
      } else {
        // Canvas is taller - fit to height
        imgHeight = pdfHeight - 30; // 10mm top, 20mm bottom for title
        imgWidth = imgHeight * canvasAspect;
        x = (pdfWidth - imgWidth) / 2;
        y = 20; // Leave room for title at top
      }
      
      // Add title
      pdf.setFontSize(16);
      pdf.setTextColor(30, 41, 59); // slate-800
      pdf.text(title, pdfWidth / 2, 10, { align: 'center' });
      
      // Convert canvas to image and add to PDF
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      
      // Add footer with export timestamp
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139); // slate-500
      const footerText = `Exported: ${new Date().toLocaleString()}`;
      pdf.text(footerText, pdfWidth / 2, pdfHeight - 5, { align: 'center' });
      
      // Save PDF
      pdf.save(this.generateFilename(filename, 'pdf'));
      
      this.exportCount++;
      console.log(`✅ Exported PDF: ${filename}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to export PDF:', error);
      throw error;
    }
  }
  
  /**
   * Export with background content (image or text)
   * @param {DrawingManager} manager - Drawing manager instance
   * @param {string} format - 'png' or 'pdf'
   * @param {Object} options - Export options
   */
  async exportWithBackground(manager, format, options = {}) {
    try {
      // Create temporary canvas with background + drawings
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      
      const { width, height } = manager.canvasEngine.getDimensions();
      tempCanvas.width = width * window.devicePixelRatio;
      tempCanvas.height = height * window.devicePixelRatio;
      
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      // Draw white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // Draw background content
      if (manager.backgroundImage) {
        ctx.drawImage(manager.backgroundImage, 0, 0, width, height);
      } else if (manager.backgroundText) {
        // Render background text
        ctx.fillStyle = '#000000';
        ctx.font = '16px Georgia, serif';
        const lines = manager.backgroundText.split('\n');
        lines.forEach((line, i) => {
          ctx.fillText(line, 20, 40 + i * 24);
        });
      }
      
      // Draw the drawing canvas on top
      const drawingCanvas = manager.canvasEngine.getCanvas();
      ctx.drawImage(drawingCanvas, 0, 0, width, height);
      
      // Export based on format
      if (format === 'png') {
        return this.exportToPNG(tempCanvas, options);
      } else if (format === 'pdf') {
        return this.exportToPDF(tempCanvas, options);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('❌ Failed to export with background:', error);
      throw error;
    }
  }
  
  /**
   * Trigger download of data URL
   * @param {string} dataURL - Data URL to download
   * @param {string} filename - Filename for download
   */
  downloadDataURL(dataURL, filename) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  /**
   * Get export statistics
   */
  getStats() {
    return {
      totalExports: this.exportCount
    };
  }
}

// Singleton instance
let exportManagerInstance = null;

export const getExportManager = () => {
  if (!exportManagerInstance) {
    exportManagerInstance = new ExportManager();
  }
  return exportManagerInstance;
};

export default ExportManager;

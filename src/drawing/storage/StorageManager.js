/**
 * StorageManager - IndexedDB persistence for drawings
 * Stores drawings per passage across sessions
 */

import { openDB } from 'idb';

const DB_NAME = 'kahoot-drawings';
const DB_VERSION = 1;
const STORE_NAME = 'passage_annotations';

class StorageManager {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }
  
  /**
   * Initialize IndexedDB
   */
  async initDB() {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create object store if it doesn't exist
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { 
              keyPath: 'id' 
            });
            
            // Create indexes for efficient querying
            store.createIndex('passageId', 'passageId', { unique: false });
            store.createIndex('quizId', 'quizId', { unique: false });
            store.createIndex('sessionId', 'sessionId', { unique: false });
            store.createIndex('modified', 'metadata.modified', { unique: false });
          }
        }
      });
      
      console.log('✅ IndexedDB initialized successfully');
      return this.db;
    } catch (error) {
      console.error('❌ Failed to initialize IndexedDB:', error);
      throw error;
    }
  }
  
  /**
   * Generate unique key for passage
   */
  generateKey(passageId, quizId, sessionId) {
    return `${quizId}_${passageId}_${sessionId}`;
  }
  
  /**
   * Save drawing data
   * @param {string} passageId - Passage identifier
   * @param {string} quizId - Quiz identifier
   * @param {string} sessionId - Session identifier
   * @param {Object} drawingData - Drawing data from DrawingManager
   */
  async saveDrawing(passageId, quizId, sessionId, drawingData) {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const key = this.generateKey(passageId, quizId, sessionId);
      
      const record = {
        id: key,
        passageId,
        quizId,
        sessionId,
        strokes: drawingData.strokes || [],
        textAnnotations: drawingData.textAnnotations || [],
        shapes: drawingData.shapes || [],
        metadata: {
          ...drawingData.metadata,
          created: drawingData.metadata?.created || Date.now(),
          modified: Date.now()
        }
      };
      
      await this.db.put(STORE_NAME, record);
      console.log(`✅ Saved drawing for passage: ${passageId}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to save drawing:', error);
      return false;
    }
  }
  
  /**
   * Load drawing data
   * @param {string} passageId - Passage identifier
   * @param {string} quizId - Quiz identifier
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Drawing data or null if not found
   */
  async loadDrawing(passageId, quizId, sessionId) {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const key = this.generateKey(passageId, quizId, sessionId);
      const record = await this.db.get(STORE_NAME, key);
      
      if (record) {
        console.log(`✅ Loaded drawing for passage: ${passageId}`);
        return {
          strokes: record.strokes || [],
          textAnnotations: record.textAnnotations || [],
          shapes: record.shapes || [],
          metadata: record.metadata || {}
        };
      }
      
      console.log(`ℹ️ No saved drawing found for passage: ${passageId}`);
      return null;
    } catch (error) {
      console.error('❌ Failed to load drawing:', error);
      return null;
    }
  }
  
  /**
   * Delete drawing data
   * @param {string} passageId - Passage identifier
   * @param {string} quizId - Quiz identifier
   * @param {string} sessionId - Session identifier
   */
  async deleteDrawing(passageId, quizId, sessionId) {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const key = this.generateKey(passageId, quizId, sessionId);
      await this.db.delete(STORE_NAME, key);
      console.log(`✅ Deleted drawing for passage: ${passageId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete drawing:', error);
      return false;
    }
  }
  
  /**
   * Get all drawings for a quiz
   * @param {string} quizId - Quiz identifier
   * @returns {Array} Array of drawing records
   */
  async getDrawingsByQuiz(quizId) {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const index = tx.store.index('quizId');
      const records = await index.getAll(quizId);
      
      return records;
    } catch (error) {
      console.error('❌ Failed to get drawings by quiz:', error);
      return [];
    }
  }
  
  /**
   * Clear all drawings for a quiz (e.g., when quiz ends)
   * @param {string} quizId - Quiz identifier
   */
  async clearQuizDrawings(quizId) {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const index = tx.store.index('quizId');
      const records = await index.getAll(quizId);
      
      for (const record of records) {
        await tx.store.delete(record.id);
      }
      
      await tx.done;
      console.log(`✅ Cleared all drawings for quiz: ${quizId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to clear quiz drawings:', error);
      return false;
    }
  }
  
  /**
   * Get database statistics
   */
  async getStats() {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const allRecords = await this.db.getAll(STORE_NAME);
      
      const stats = {
        totalDrawings: allRecords.length,
        totalStrokes: 0,
        totalTextAnnotations: 0,
        totalShapes: 0,
        oldestModified: null,
        newestModified: null
      };
      
      allRecords.forEach(record => {
        stats.totalStrokes += record.strokes?.length || 0;
        stats.totalTextAnnotations += record.textAnnotations?.length || 0;
        stats.totalShapes += record.shapes?.length || 0;
        
        const modified = record.metadata?.modified;
        if (modified) {
          if (!stats.oldestModified || modified < stats.oldestModified) {
            stats.oldestModified = modified;
          }
          if (!stats.newestModified || modified > stats.newestModified) {
            stats.newestModified = modified;
          }
        }
      });
      
      return stats;
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return null;
    }
  }
  
  /**
   * Clear old drawings (older than specified days)
   * @param {number} days - Delete drawings older than this many days
   */
  async clearOldDrawings(days = 7) {
    await this.initPromise;
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const index = tx.store.index('modified');
      
      let cursor = await index.openCursor();
      let deletedCount = 0;
      
      while (cursor) {
        if (cursor.value.metadata.modified < cutoffTime) {
          await cursor.delete();
          deletedCount++;
        }
        cursor = await cursor.continue();
      }
      
      await tx.done;
      console.log(`✅ Deleted ${deletedCount} old drawings (>${days} days)`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Failed to clear old drawings:', error);
      return 0;
    }
  }
}

// Singleton instance
let storageManagerInstance = null;

export const getStorageManager = () => {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager();
  }
  return storageManagerInstance;
};

export default StorageManager;

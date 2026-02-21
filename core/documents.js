/**
 * KDT Aso - Document Storage System
 * Manages intel reports, mission plans, AARs, and other documents
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DocumentStorage {
  constructor(storageDir = './documents') {
    this.storageDir = storageDir;
    this.metadataFile = path.join(storageDir, 'metadata.json');
    this.documents = new Map();
    
    this.categories = {
      intel: 'Intelligence Reports',
      aar: 'After Action Reports',
      mission: 'Mission Plans',
      sitrep: 'Situation Reports',
      personnel: 'Personnel Files',
      asset: 'Asset Documentation',
      sop: 'Standard Operating Procedures',
      other: 'Other Documents'
    };
    
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      
      // Create category directories
      for (const cat of Object.keys(this.categories)) {
        await fs.mkdir(path.join(this.storageDir, cat), { recursive: true });
      }
      
      // Load metadata
      await this.loadMetadata();
      
      console.log('Document storage system initialized');
    } catch (err) {
      console.error('Failed to initialize document storage:', err);
    }
  }

  async loadMetadata() {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf8');
      const metadata = JSON.parse(data);
      for (const doc of metadata.documents || []) {
        this.documents.set(doc.id, doc);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading document metadata:', err);
      }
    }
  }

  async saveMetadata() {
    const metadata = {
      updatedAt: new Date().toISOString(),
      documents: Array.from(this.documents.values())
    };
    await fs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
  }

  /**
   * Create a new document
   */
  async create(options) {
    const {
      title,
      category = 'other',
      content,
      author,
      classification = 'unclassified',
      tags = [],
      relatedDocuments = []
    } = options;

    if (!this.categories[category]) {
      throw new Error(`Invalid category: ${category}`);
    }

    const id = crypto.randomUUID();
    const filename = `${id}.md`;
    const filePath = path.join(this.storageDir, category, filename);

    const doc = {
      id,
      title,
      category,
      filename,
      author,
      classification,
      tags,
      relatedDocuments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      size: Buffer.byteLength(content, 'utf8')
    };

    // Save content
    await fs.writeFile(filePath, content);
    
    // Save metadata
    this.documents.set(id, doc);
    await this.saveMetadata();

    return doc;
  }

  /**
   * Get document by ID
   */
  async get(id) {
    const doc = this.documents.get(id);
    if (!doc) {
      return null;
    }

    const filePath = path.join(this.storageDir, doc.category, doc.filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { ...doc, content };
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File missing, remove from metadata
        this.documents.delete(id);
        await this.saveMetadata();
        return null;
      }
      throw err;
    }
  }

  /**
   * Update document
   */
  async update(id, updates) {
    const doc = this.documents.get(id);
    if (!doc) {
      throw new Error('Document not found');
    }

    const { content, ...metadataUpdates } = updates;

    // Update metadata
    Object.assign(doc, metadataUpdates, {
      updatedAt: new Date().toISOString(),
      version: doc.version + 1
    });

    // Update content if provided
    if (content !== undefined) {
      const filePath = path.join(this.storageDir, doc.category, doc.filename);
      await fs.writeFile(filePath, content);
      doc.size = Buffer.byteLength(content, 'utf8');
    }

    await this.saveMetadata();
    return doc;
  }

  /**
   * Delete document
   */
  async delete(id) {
    const doc = this.documents.get(id);
    if (!doc) {
      return false;
    }

    const filePath = path.join(this.storageDir, doc.category, doc.filename);
    
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    this.documents.delete(id);
    await this.saveMetadata();
    return true;
  }

  /**
   * List documents with filters
   */
  list(filters = {}) {
    let docs = Array.from(this.documents.values());

    if (filters.category) {
      docs = docs.filter(d => d.category === filters.category);
    }
    if (filters.author) {
      docs = docs.filter(d => d.author === filters.author);
    }
    if (filters.classification) {
      docs = docs.filter(d => d.classification === filters.classification);
    }
    if (filters.tags && filters.tags.length > 0) {
      docs = docs.filter(d => 
        filters.tags.some(tag => d.tags.includes(tag))
      );
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      docs = docs.filter(d => 
        d.title.toLowerCase().includes(searchLower) ||
        d.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    // Sort by date (newest first)
    docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Pagination
    if (filters.limit) {
      const offset = filters.offset || 0;
      docs = docs.slice(offset, offset + filters.limit);
    }

    return docs;
  }

  /**
   * Search documents content
   */
  async search(query, options = {}) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const doc of this.documents.values()) {
      // Check title and tags first
      if (doc.title.toLowerCase().includes(queryLower) ||
          doc.tags.some(t => t.toLowerCase().includes(queryLower))) {
        results.push({ ...doc, matchType: 'metadata' });
        continue;
      }

      // Search content if requested
      if (options.searchContent !== false) {
        try {
          const filePath = path.join(this.storageDir, doc.category, doc.filename);
          const content = await fs.readFile(filePath, 'utf8');
          if (content.toLowerCase().includes(queryLower)) {
            // Extract snippet
            const idx = content.toLowerCase().indexOf(queryLower);
            const start = Math.max(0, idx - 50);
            const end = Math.min(content.length, idx + query.length + 50);
            const snippet = content.substring(start, end);
            
            results.push({ ...doc, matchType: 'content', snippet });
          }
        } catch (err) {
          continue;
        }
      }
    }

    return results;
  }

  /**
   * Get document statistics
   */
  getStats() {
    const stats = {
      total: this.documents.size,
      byCategory: {},
      byClassification: {},
      totalSize: 0
    };

    for (const doc of this.documents.values()) {
      stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;
      stats.byClassification[doc.classification] = (stats.byClassification[doc.classification] || 0) + 1;
      stats.totalSize += doc.size || 0;
    }

    return stats;
  }

  /**
   * Get available categories
   */
  getCategories() {
    return Object.entries(this.categories).map(([id, name]) => ({ id, name }));
  }

  /**
   * Generate document from template
   */
  async generateFromTemplate(templateType, data) {
    const templates = {
      sitrep: `# Situation Report
**Date:** ${data.date || new Date().toISOString()}
**Author:** ${data.author || 'Unknown'}
**Classification:** ${data.classification || 'UNCLASSIFIED'}

## Current Situation
${data.situation || '[Describe current situation]'}

## Key Events
${data.events || '[List key events]'}

## Assessment
${data.assessment || '[Provide assessment]'}

## Recommendations
${data.recommendations || '[List recommendations]'}
`,
      aar: `# After Action Report
**Operation:** ${data.operation || '[Operation Name]'}
**Date:** ${data.date || new Date().toISOString()}
**Author:** ${data.author || 'Unknown'}

## Mission Overview
${data.overview || '[Mission overview]'}

## Execution Summary
${data.execution || '[Execution summary]'}

## Key Outcomes
${data.outcomes || '[Key outcomes]'}

## Lessons Learned
${data.lessons || '[Lessons learned]'}

## Recommendations
${data.recommendations || '[Recommendations]'}
`,
      intel: `# Intelligence Report
**Subject:** ${data.subject || '[Subject]'}
**Date:** ${data.date || new Date().toISOString()}
**Source:** ${data.source || '[Source]'}
**Classification:** ${data.classification || 'UNCLASSIFIED'}

## Summary
${data.summary || '[Intelligence summary]'}

## Details
${data.details || '[Detailed information]'}

## Assessment
${data.assessment || '[Analyst assessment]'}

## Implications
${data.implications || '[Operational implications]'}
`
    };

    const template = templates[templateType];
    if (!template) {
      throw new Error(`Unknown template type: ${templateType}`);
    }

    return template;
  }
}

module.exports = DocumentStorage;

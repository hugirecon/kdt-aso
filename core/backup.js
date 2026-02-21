/**
 * KDT Aso - Backup & Restore System
 * Automated backups and recovery for all system data
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

class BackupSystem {
  constructor(options = {}) {
    this.backupDir = options.backupDir || './backups';
    this.dataDir = options.dataDir || '.';
    this.maxBackups = options.maxBackups || 10;
    this.autoBackupInterval = options.autoBackupInterval || 24 * 60 * 60 * 1000; // 24 hours
    
    this.backupSources = [
      'config',
      'memory',
      'documents',
      'agents'
    ];
    
    this.autoBackupTimer = null;
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      console.log('Backup system initialized');
    } catch (err) {
      console.error('Failed to initialize backup system:', err);
    }
  }

  /**
   * Start automatic backups
   */
  startAutoBackup() {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
    }
    
    this.autoBackupTimer = setInterval(async () => {
      try {
        console.log('Starting automatic backup...');
        await this.createBackup({ type: 'auto' });
        console.log('Automatic backup completed');
      } catch (err) {
        console.error('Automatic backup failed:', err);
      }
    }, this.autoBackupInterval);
    
    console.log(`Auto-backup enabled (every ${this.autoBackupInterval / 3600000} hours)`);
  }

  /**
   * Stop automatic backups
   */
  stopAutoBackup() {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = null;
      console.log('Auto-backup disabled');
    }
  }

  /**
   * Create a backup
   */
  async createBackup(options = {}) {
    const { type = 'manual', description = '' } = options;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
    const backupPath = path.join(this.backupDir, backupId);
    
    try {
      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });
      
      const manifest = {
        id: backupId,
        type,
        description,
        createdAt: new Date().toISOString(),
        sources: [],
        files: [],
        totalSize: 0,
        checksum: null
      };

      // Backup each source
      for (const source of this.backupSources) {
        const sourcePath = path.join(this.dataDir, source);
        const destPath = path.join(backupPath, source);
        
        try {
          await fs.access(sourcePath);
          await this.copyDirectory(sourcePath, destPath);
          
          const stats = await this.getDirectoryStats(destPath);
          manifest.sources.push({
            name: source,
            files: stats.files,
            size: stats.size
          });
          manifest.files.push(...stats.fileList.map(f => path.join(source, f)));
          manifest.totalSize += stats.size;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.warn(`Warning: Could not backup ${source}:`, err.message);
          }
        }
      }

      // Calculate checksum
      manifest.checksum = await this.calculateBackupChecksum(backupPath);

      // Save manifest
      await fs.writeFile(
        path.join(backupPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Compress backup
      const compressedPath = `${backupPath}.tar.gz`;
      await this.compressBackup(backupPath, compressedPath);

      // Remove uncompressed directory
      await this.removeDirectory(backupPath);

      // Clean old backups
      await this.cleanOldBackups();

      return {
        id: backupId,
        path: compressedPath,
        size: manifest.totalSize,
        files: manifest.files.length,
        createdAt: manifest.createdAt
      };
    } catch (err) {
      // Cleanup on error
      try {
        await this.removeDirectory(backupPath);
      } catch (e) {}
      throw err;
    }
  }

  /**
   * List all backups
   */
  async listBackups() {
    const backups = [];
    
    try {
      const files = await fs.readdir(this.backupDir);
      
      for (const file of files) {
        if (file.endsWith('.tar.gz')) {
          const backupId = file.replace('.tar.gz', '');
          const filePath = path.join(this.backupDir, file);
          const stat = await fs.stat(filePath);
          
          backups.push({
            id: backupId,
            filename: file,
            size: stat.size,
            createdAt: stat.birthtime.toISOString()
          });
        }
      }
      
      // Sort by date (newest first)
      backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    return backups;
  }

  /**
   * Restore from backup
   */
  async restore(backupId, options = {}) {
    const { dryRun = false, sources = null } = options;
    
    const compressedPath = path.join(this.backupDir, `${backupId}.tar.gz`);
    const extractPath = path.join(this.backupDir, `_restore_${backupId}`);
    
    try {
      // Check backup exists
      await fs.access(compressedPath);
      
      // Extract backup
      await this.extractBackup(compressedPath, extractPath);
      
      // Read manifest
      const manifestPath = path.join(extractPath, 'manifest.json');
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);
      
      // Verify checksum
      const currentChecksum = await this.calculateBackupChecksum(extractPath);
      if (currentChecksum !== manifest.checksum) {
        throw new Error('Backup checksum verification failed - backup may be corrupted');
      }
      
      const restoreResults = {
        backupId,
        manifest,
        restored: [],
        skipped: [],
        dryRun
      };

      // Restore each source
      for (const source of manifest.sources) {
        if (sources && !sources.includes(source.name)) {
          restoreResults.skipped.push(source.name);
          continue;
        }
        
        const sourcePath = path.join(extractPath, source.name);
        const destPath = path.join(this.dataDir, source.name);
        
        if (!dryRun) {
          // Backup current data before restoring
          const currentBackupPath = `${destPath}_pre_restore_${Date.now()}`;
          try {
            await fs.rename(destPath, currentBackupPath);
          } catch (err) {
            if (err.code !== 'ENOENT') throw err;
          }
          
          // Restore
          await this.copyDirectory(sourcePath, destPath);
        }
        
        restoreResults.restored.push(source.name);
      }
      
      // Cleanup
      await this.removeDirectory(extractPath);
      
      return restoreResults;
    } catch (err) {
      // Cleanup on error
      try {
        await this.removeDirectory(extractPath);
      } catch (e) {}
      throw err;
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId) {
    const compressedPath = path.join(this.backupDir, `${backupId}.tar.gz`);
    await fs.unlink(compressedPath);
    return true;
  }

  /**
   * Clean old backups (keep maxBackups)
   */
  async cleanOldBackups() {
    const backups = await this.listBackups();
    
    if (backups.length > this.maxBackups) {
      const toDelete = backups.slice(this.maxBackups);
      
      for (const backup of toDelete) {
        try {
          await this.deleteBackup(backup.id);
          console.log(`Deleted old backup: ${backup.id}`);
        } catch (err) {
          console.warn(`Failed to delete old backup ${backup.id}:`, err.message);
        }
      }
    }
  }

  /**
   * Get backup info
   */
  async getBackupInfo(backupId) {
    const compressedPath = path.join(this.backupDir, `${backupId}.tar.gz`);
    const extractPath = path.join(this.backupDir, `_info_${backupId}`);
    
    try {
      await this.extractBackup(compressedPath, extractPath);
      
      const manifestPath = path.join(extractPath, 'manifest.json');
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);
      
      await this.removeDirectory(extractPath);
      
      return manifest;
    } catch (err) {
      try {
        await this.removeDirectory(extractPath);
      } catch (e) {}
      throw err;
    }
  }

  // ==================== HELPER METHODS ====================

  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  async removeDirectory(dir) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async getDirectoryStats(dir) {
    let size = 0;
    let files = 0;
    const fileList = [];
    
    const processDir = async (currentDir, prefix = '') => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.join(prefix, entry.name);
        
        if (entry.isDirectory()) {
          await processDir(fullPath, relativePath);
        } else {
          const stat = await fs.stat(fullPath);
          size += stat.size;
          files++;
          fileList.push(relativePath);
        }
      }
    };
    
    await processDir(dir);
    return { size, files, fileList };
  }

  async calculateBackupChecksum(backupPath) {
    const hash = crypto.createHash('sha256');
    const files = [];
    
    const processDir = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.name === 'manifest.json') continue;
        
        if (entry.isDirectory()) {
          await processDir(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };
    
    await processDir(backupPath);
    files.sort();
    
    for (const file of files) {
      const content = await fs.readFile(file);
      hash.update(content);
    }
    
    return hash.digest('hex');
  }

  async compressBackup(sourceDir, destFile) {
    // Simple tar.gz using built-in modules
    const tar = require('tar');
    await tar.create(
      {
        gzip: true,
        file: destFile,
        cwd: path.dirname(sourceDir)
      },
      [path.basename(sourceDir)]
    );
  }

  async extractBackup(sourceFile, destDir) {
    const tar = require('tar');
    await fs.mkdir(destDir, { recursive: true });
    await tar.extract({
      file: sourceFile,
      cwd: destDir,
      strip: 1
    });
  }
}

module.exports = BackupSystem;

/**
 * KDT Aso - End-to-End Encryption System
 * Encrypts all sensitive data in transit and at rest
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class EncryptionSystem {
  constructor(options = {}) {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.saltLength = 32;
    this.tagLength = 16;
    this.keyDir = options.keyDir || './config/keys';
    
    this.masterKey = null;
    this.sessionKeys = new Map();
    
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.keyDir, { recursive: true });
      await this.loadOrGenerateMasterKey();
      console.log('Encryption system initialized');
    } catch (err) {
      console.error('Failed to initialize encryption system:', err);
    }
  }

  /**
   * Load or generate master key
   */
  async loadOrGenerateMasterKey() {
    const keyFile = path.join(this.keyDir, 'master.key');
    
    try {
      const keyData = await fs.readFile(keyFile);
      this.masterKey = keyData;
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Generate new master key
        this.masterKey = crypto.randomBytes(this.keyLength);
        await fs.writeFile(keyFile, this.masterKey, { mode: 0o600 });
        console.log('Generated new master key');
      } else {
        throw err;
      }
    }
  }

  /**
   * Derive key from password
   */
  deriveKey(password, salt = null) {
    salt = salt || crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha512');
    return { key, salt };
  }

  /**
   * Generate session key for user
   */
  generateSessionKey(userId) {
    const sessionKey = crypto.randomBytes(this.keyLength);
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    this.sessionKeys.set(sessionId, {
      userId,
      key: sessionKey,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });
    
    return sessionId;
  }

  /**
   * Get session key
   */
  getSessionKey(sessionId) {
    const session = this.sessionKeys.get(sessionId);
    if (!session) return null;
    
    if (Date.now() > session.expiresAt) {
      this.sessionKeys.delete(sessionId);
      return null;
    }
    
    return session.key;
  }

  /**
   * Encrypt data
   */
  encrypt(data, key = null) {
    key = key || this.masterKey;
    if (!key) throw new Error('No encryption key available');
    
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted;
    if (typeof data === 'string') {
      encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    } else if (Buffer.isBuffer(data)) {
      encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    } else {
      encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    }
    
    const tag = cipher.getAuthTag();
    
    // Combine IV + Tag + Encrypted data
    const result = Buffer.concat([iv, tag, encrypted]);
    return result.toString('base64');
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData, key = null, parseJson = false) {
    key = key || this.masterKey;
    if (!key) throw new Error('No encryption key available');
    
    const buffer = Buffer.from(encryptedData, 'base64');
    
    // Extract IV, Tag, and encrypted content
    const iv = buffer.slice(0, this.ivLength);
    const tag = buffer.slice(this.ivLength, this.ivLength + this.tagLength);
    const encrypted = buffer.slice(this.ivLength + this.tagLength);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const result = decrypted.toString('utf8');
    
    if (parseJson) {
      try {
        return JSON.parse(result);
      } catch (e) {
        return result;
      }
    }
    
    return result;
  }

  /**
   * Encrypt file
   */
  async encryptFile(inputPath, outputPath = null) {
    outputPath = outputPath || `${inputPath}.enc`;
    
    const data = await fs.readFile(inputPath);
    const encrypted = this.encrypt(data);
    await fs.writeFile(outputPath, encrypted);
    
    return outputPath;
  }

  /**
   * Decrypt file
   */
  async decryptFile(inputPath, outputPath = null) {
    outputPath = outputPath || inputPath.replace('.enc', '');
    
    const encrypted = await fs.readFile(inputPath, 'utf8');
    const decrypted = this.decrypt(encrypted);
    await fs.writeFile(outputPath, decrypted);
    
    return outputPath;
  }

  /**
   * Create encrypted message for transmission
   */
  createSecureMessage(message, recipientSessionId) {
    const sessionKey = this.getSessionKey(recipientSessionId);
    if (!sessionKey) {
      throw new Error('Invalid or expired session');
    }
    
    const encrypted = this.encrypt(message, sessionKey);
    const signature = this.sign(encrypted);
    
    return {
      encrypted,
      signature,
      timestamp: Date.now(),
      sessionId: recipientSessionId
    };
  }

  /**
   * Decrypt secure message
   */
  decryptSecureMessage(secureMessage) {
    const { encrypted, signature, sessionId } = secureMessage;
    
    // Verify signature
    if (!this.verify(encrypted, signature)) {
      throw new Error('Message signature verification failed');
    }
    
    const sessionKey = this.getSessionKey(sessionId);
    if (!sessionKey) {
      throw new Error('Invalid or expired session');
    }
    
    return this.decrypt(encrypted, sessionKey, true);
  }

  /**
   * Sign data
   */
  sign(data) {
    const hmac = crypto.createHmac('sha256', this.masterKey);
    hmac.update(typeof data === 'string' ? data : JSON.stringify(data));
    return hmac.digest('base64');
  }

  /**
   * Verify signature
   */
  verify(data, signature) {
    const expectedSignature = this.sign(data);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  }

  /**
   * Hash data (one-way)
   */
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm)
      .update(typeof data === 'string' ? data : JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Generate secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt sensitive fields in object
   */
  encryptSensitiveFields(obj, fields) {
    const result = { ...obj };
    
    for (const field of fields) {
      if (result[field] !== undefined) {
        result[field] = this.encrypt(result[field]);
        result[`${field}_encrypted`] = true;
      }
    }
    
    return result;
  }

  /**
   * Decrypt sensitive fields in object
   */
  decryptSensitiveFields(obj, fields) {
    const result = { ...obj };
    
    for (const field of fields) {
      if (result[`${field}_encrypted`] && result[field]) {
        result[field] = this.decrypt(result[field]);
        delete result[`${field}_encrypted`];
      }
    }
    
    return result;
  }

  /**
   * Rotate master key
   */
  async rotateMasterKey() {
    const oldKey = this.masterKey;
    const newKey = crypto.randomBytes(this.keyLength);
    
    // Store new key
    const keyFile = path.join(this.keyDir, 'master.key');
    const backupFile = path.join(this.keyDir, `master.key.backup.${Date.now()}`);
    
    // Backup old key
    await fs.writeFile(backupFile, oldKey, { mode: 0o600 });
    
    // Save new key
    await fs.writeFile(keyFile, newKey, { mode: 0o600 });
    
    this.masterKey = newKey;
    
    return {
      rotated: true,
      backupFile,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear expired sessions
   */
  clearExpiredSessions() {
    const now = Date.now();
    let cleared = 0;
    
    for (const [sessionId, session] of this.sessionKeys) {
      if (now > session.expiresAt) {
        this.sessionKeys.delete(sessionId);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * Get encryption status
   */
  getStatus() {
    return {
      initialized: !!this.masterKey,
      algorithm: this.algorithm,
      keyLength: this.keyLength * 8, // bits
      activeSessions: this.sessionKeys.size
    };
  }
}

module.exports = EncryptionSystem;

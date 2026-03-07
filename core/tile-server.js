/**
 * KDT Aso - Local PMTiles Tile Server
 * Serves map tiles from local PMTiles files via Express
 */

const path = require('path');
const fs = require('fs');
const { validatePathComponent } = require('./security');

// Resolve allowed origins for tile CORS from environment or default to localhost
function getTileAllowedOrigins() {
  const envOrigins = process.env.CORS_ORIGINS;
  const defaults = ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173',
                     'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'http://127.0.0.1:5173'];
  if (envOrigins) {
    return [...new Set([...defaults, ...envOrigins.split(',').map(o => o.trim())])];
  }
  return defaults;
}

function tileCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null; // same-origin requests
  const allowed = getTileAllowedOrigins();
  return allowed.includes(origin) ? origin : null;
}

// PMTiles JS library for reading tile archives
let PMTiles, FetchSource;

class TileServer {
  constructor(tilesDir) {
    this.tilesDir = tilesDir;
    this.archives = new Map();
  }

  /**
   * Initialize tile server and load available PMTiles archives
   */
  async init() {
    if (!fs.existsSync(this.tilesDir)) {
      fs.mkdirSync(this.tilesDir, { recursive: true });
      console.log(`[TILES] Created tiles directory: ${this.tilesDir}`);
    }

    // Find all .pmtiles files
    const files = fs.readdirSync(this.tilesDir).filter(f => f.endsWith('.pmtiles'));
    
    if (files.length === 0) {
      console.log('[TILES] No PMTiles archives found in', this.tilesDir);
      console.log('[TILES] Place .pmtiles files in the tiles/ directory');
      return;
    }

    for (const file of files) {
      const name = path.basename(file, '.pmtiles');
      this.archives.set(name, path.join(this.tilesDir, file));
      console.log(`[TILES] Loaded: ${name} (${file})`);
    }
  }

  /**
   * Register tile-serving routes on an Express app
   */
  registerRoutes(app) {
    // Serve tile JSON metadata
    app.get('/tiles/:archive/metadata', (req, res) => {
      try {
        validatePathComponent(req.params.archive, 'archive name');
      } catch (err) {
        return res.status(400).json({ error: 'Invalid archive name' });
      }
      
      const archivePath = this.archives.get(req.params.archive);
      if (!archivePath) {
        return res.status(404).json({ error: 'Archive not found' });
      }
      
      res.json({
        name: req.params.archive,
        type: 'pmtiles',
        available: fs.existsSync(archivePath)
      });
    });

    // List available tile archives
    app.get('/tiles/list', (req, res) => {
      const archives = [];
      for (const [name, filePath] of this.archives.entries()) {
        const stat = fs.statSync(filePath);
        archives.push({
          name,
          size: stat.size,
          sizeHuman: (stat.size / 1024 / 1024).toFixed(1) + ' MB',
          modified: stat.mtime
        });
      }
      res.json(archives);
    });

    // Serve PMTiles directly as static files for the pmtiles JS protocol
    app.get('/tiles/:archive.pmtiles', (req, res) => {
      try {
        validatePathComponent(req.params.archive, 'archive name');
      } catch (err) {
        return res.status(400).send('Invalid archive name');
      }
      
      const archivePath = this.archives.get(req.params.archive);
      if (!archivePath || !fs.existsSync(archivePath)) {
        return res.status(404).send('Not found');
      }

      const stat = fs.statSync(archivePath);
      const range = req.headers.range;

      const corsOrigin = tileCorsOrigin(req);
      const corsHeaders = corsOrigin
        ? { 'Access-Control-Allow-Origin': corsOrigin, 'Vary': 'Origin' }
        : {};

      if (range) {
        // Handle range requests (required by PMTiles protocol)
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
          ...corsHeaders,
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
        });

        const stream = fs.createReadStream(archivePath, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
          'Accept-Ranges': 'bytes',
          ...corsHeaders,
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
        });

        fs.createReadStream(archivePath).pipe(res);
      }
    });

    // Handle CORS preflight for range requests
    app.options('/tiles/:archive.pmtiles', (req, res) => {
      const corsOrigin = tileCorsOrigin(req);
      res.writeHead(204, {
        ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, 'Vary': 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
    });

    console.log('[TILES] Tile routes registered');
  }
}

module.exports = TileServer;

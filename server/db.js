const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'modpacks.db');

class ModpackDB {
  constructor() {
    this.db = null;
  }

  init() {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS modpacks (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        categories TEXT,
        versions TEXT,
        loaders TEXT,
        downloads INTEGER DEFAULT 0,
        follows INTEGER DEFAULT 0,
        icon_url TEXT,
        url TEXT,
        updated_at TEXT,
        crawled_at TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS modpacks_fts USING fts5(
        title,
        description,
        categories,
        content='modpacks',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS modpacks_ai AFTER INSERT ON modpacks BEGIN
        INSERT INTO modpacks_fts(rowid, title, description, categories)
        VALUES (new.rowid, new.title, new.description, new.categories);
      END;

      CREATE TRIGGER IF NOT EXISTS modpacks_ad AFTER DELETE ON modpacks BEGIN
        INSERT INTO modpacks_fts(modpacks_fts, rowid, title, description, categories)
        VALUES('delete', old.rowid, old.title, old.description, old.categories);
      END;

      CREATE TRIGGER IF NOT EXISTS modpacks_au AFTER UPDATE ON modpacks BEGIN
        INSERT INTO modpacks_fts(modpacks_fts, rowid, title, description, categories)
        VALUES('delete', old.rowid, old.title, old.description, old.categories);
        INSERT INTO modpacks_fts(rowid, title, description, categories)
        VALUES (new.rowid, new.title, new.description, new.categories);
      END;

      CREATE INDEX IF NOT EXISTS idx_modpacks_downloads ON modpacks(downloads);
      CREATE INDEX IF NOT EXISTS idx_modpacks_follows ON modpacks(follows);
    `);

    return this;
  }

  upsertModpacks(modpacks) {
    const stmt = this.db.prepare(`
      INSERT INTO modpacks (slug, title, description, categories, versions, loaders, downloads, follows, icon_url, url, updated_at, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        categories = excluded.categories,
        versions = excluded.versions,
        loaders = excluded.loaders,
        downloads = excluded.downloads,
        follows = excluded.follows,
        icon_url = excluded.icon_url,
        url = excluded.url,
        updated_at = excluded.updated_at,
        crawled_at = excluded.crawled_at
    `);

    const insert = this.db.transaction((items) => {
      const now = new Date().toISOString();
      for (const m of items) {
        stmt.run(
          m.slug,
          m.title,
          m.description || '',
          JSON.stringify(m.categories || []),
          JSON.stringify(m.versions || []),
          JSON.stringify(m.loaders || []),
          m.downloads || 0,
          m.follows || 0,
          m.icon_url || null,
          m.url || `https://modrinth.com/modpack/${m.slug}`,
          m.updated || null,
          now
        );
      }
    });

    insert(modpacks);
  }

  search(query, { loaders = [], versions = [], categories = [], excludeCategories = [], sortBy = 'relevance', limit = 50 } = {}) {
    const VALID_SORT = { relevance: true, downloads: true, follows: true, newest: true, updated: true };
    if (!VALID_SORT[sortBy]) sortBy = 'relevance';

    let sql = '';
    let params = [];

    if (query && query.trim()) {
      const ftsQuery = query.split(/\s+/)
        .map(w => w.replace(/["()*^{}:]/g, ''))
        .filter(w => w.length > 0)
        .map(w => `"${w}"`)
        .join(' OR ');

      if (ftsQuery) {
        sql = `
          SELECT m.*, rank
          FROM modpacks_fts fts
          JOIN modpacks m ON m.rowid = fts.rowid
          WHERE modpacks_fts MATCH ?
        `;
        params.push(ftsQuery);
      } else {
        sql = `SELECT m.*, 0 as rank FROM modpacks m WHERE 1=1`;
      }
    } else {
      sql = `SELECT m.*, 0 as rank FROM modpacks m WHERE 1=1`;
    }

    // Modrinth search API puts loader names (fabric, forge, etc.) in the categories field
    if (loaders.length > 0) {
      const conditions = loaders.map(l => `m.categories LIKE ?`);
      sql += ` AND (${conditions.join(' OR ')})`;
      params.push(...loaders.map(l => `%"${l}"%`));
    }

    if (versions.length > 0) {
      const conditions = versions.map(v => `m.versions LIKE ?`);
      sql += ` AND (${conditions.join(' OR ')})`;
      params.push(...versions.map(v => `%"${v}"%`));
    }

    if (categories.length > 0) {
      const conditions = categories.map(c => `m.categories LIKE ?`);
      sql += ` AND (${conditions.join(' OR ')})`;
      params.push(...categories.map(c => `%"${c}"%`));
    }

    if (excludeCategories.length > 0) {
      const conditions = excludeCategories.map(c => `m.categories NOT LIKE ?`);
      sql += ` AND (${conditions.join(' AND ')})`;
      params.push(...excludeCategories.map(c => `%"${c}"%`));
    }

    // Sort
    const sortMap = {
      relevance: (!query || !query.trim()) ? 'm.downloads DESC' : 'rank',
      downloads: 'm.downloads DESC',
      follows: 'm.follows DESC',
      newest: 'm.crawled_at DESC',
      updated: 'm.updated_at DESC'
    };
    sql += ` ORDER BY ${sortMap[sortBy]}`;
    sql += ` LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(this.toModrinthHit);
  }

  toModrinthHit(row) {
    return {
      slug: row.slug,
      title: row.title,
      description: row.description,
      categories: JSON.parse(row.categories || '[]'),
      versions: JSON.parse(row.versions || '[]'),
      loaders: JSON.parse(row.loaders || '[]'),
      downloads: row.downloads,
      follows: row.follows,
      icon_url: row.icon_url,
      url: row.url,
      project_type: 'modpack'
    };
  }

  getCount() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM modpacks').get();
    return row.count;
  }

  getLastCrawl() {
    const row = this.db.prepare('SELECT MAX(crawled_at) as lastCrawl FROM modpacks').get();
    return row.lastCrawl;
  }

  close() {
    if (this.db) this.db.close();
  }
}

module.exports = ModpackDB;

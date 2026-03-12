/**
 * lib/store.js
 *
 * Simple file-based encrypted store. Stores a single JSON object:
 * {
 *   users: [ { id, name, email, passwordHash, board, createdAt } ],
 *   sessions: { sid: userId, ... },
 *   winners: [ { id, userId, name, snapshot, createdAt } ]
 * }
 *
 * Encryption: AES-256-GCM using Node crypto. secretKey must be at least 32 characters.
 *
 * NOTE: This is intended for small deployments / local use.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor({ filePath, secretKey }) {
    this.filePath = filePath;
    this.secretKey = secretKey;
    if (typeof secretKey !== 'string' || secretKey.length < 32) {
      throw new Error('secretKey must be a string at least 32 characters long');
    }
    this._data = {
      users: [],
      sessions: {},
      winners: []
    };
  }

  async init() {
    // ensure directory exists
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // if file exists, load
    try {
      const enc = await fs.readFile(this.filePath);
      const json = Store._decrypt(enc, this.secretKey);
      this._data = JSON.parse(json);
      // sanity: ensure arrays exist
      this._data.users = this._data.users || [];
      this._data.sessions = this._data.sessions || {};
      this._data.winners = this._data.winners || [];
    } catch (err) {
      // file probably doesn't exist -> create initial encrypted store
      await this.save();
    }
  }

  static _encrypt(plainText, secretKey) {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // store as iv + tag + ciphertext
    return Buffer.concat([iv, tag, encrypted]);
  }

  static _decrypt(buffer, secretKey) {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = buffer.slice(0, 12);
    const tag = buffer.slice(12, 28);
    const ciphertext = buffer.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  async save() {
    const json = JSON.stringify(this._data, null, 2);
    const enc = Store._encrypt(json, this.secretKey);
    await fs.writeFile(this.filePath, enc);
  }

  // helpers
  defaultPhrases() {
    // 25 short phrases, easy to edit
    return [
      "Write a README", "Create a PR", "Fix a bug", "Add tests", "Publish your data in a repository",
      "Refactor a function", "Update documentation", "Deploy to staging", "Open an issue", "Pair program",
      "Write a blog post", "Share on social", "Give a demo", "Add CI", "Run a usability test",
      "Add accessibility fixes", "Optimize a query", "Create a new branch", "Migrate a dependency", "Write a script",
      "Review a design", "Prototype a feature", "Write a unit test", "Meet with a mentor", "Present a project"
    ];
  }

  getUserByEmail(email) {
    return this._data.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
  }

  addUser(user) {
    this._data.users.push(user);
  }

  updateUser(user) {
    const idx = this._data.users.findIndex(u => u.id === user.id);
    if (idx >= 0) this._data.users[idx] = user;
  }

  // sessions: sid -> userId
  createSessionForUser(userId) {
    const sid = crypto.randomBytes(16).toString('hex');
    this._data.sessions[sid] = { userId, createdAt: new Date().toISOString() };
    return sid;
  }

  getUserBySession(sid) {
    const s = this._data.sessions[sid];
    if (!s) return null;
    return this._data.users.find(u => u.id === s.userId) || null;
  }

  destroySession(sid) {
    delete this._data.sessions[sid];
  }

  addWinner(w) {
    // remove any existing winners for same userId
    if (w && w.userId) {
      this._data.winners = this._data.winners.filter(existing => existing.userId !== w.userId);
    }
    // add new winner at the front
    this._data.winners.unshift(w);
    // keep recent 100 winners
    this._data.winners = this._data.winners.slice(0, 100);
  }

  getWinners() {
    return this._data.winners;
  }
}

module.exports = Store;
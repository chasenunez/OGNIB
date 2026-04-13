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

  // 25 bingo task phrases in board order (positions 0-24)
  // Board order by task number: 9,22,24,2,13,17,25,21,16,15,4,3,1,5,6,23,14,12,7,19,11,8,18,20,10
  defaultPhrases() {
    return [
      "Publish your data online",                       // Task 9
      "Create a requirements file",                     // Task 22
      "Use a virtual or containerized environment",     // Task 24
      "Store your data in an open format",              // Task 2
      "Organize your repo in a logical structure",      // Task 13
      "Post your repo/code to social media",            // Task 17
      "Create and customize a .gitignore file",         // Task 25
      "Publish a reproducible visualization",    // Task 21
      "Refactor a function to be more reusable",        // Task 16
      "Document your environment",                      // Task 15
      "Separate rawdata from processed data",           // Task 4
      "Give your files understandable names",           // Task 3
      "Add a README",                                   // Task 1
      "Create a metadata file",                         // Task 5
      "Organize files in logical folder structure",     // Task 6
      "Collaborate on a code repository",               // Task 23
      "Setup a git repository and make a first commit", // Task 14
      "Link data to publication",                       // Task 12
      "Use a field-specific resource",         // Task 7
      "Publish data/code to supported infrastructure",  // Task 19
      "Use meaningful variable naming",                 // Task 11
      "Add a license",                                  // Task 8
      "Write a unit test for your code",                // Task 18
      "Adapt an existing project/code using a fork",    // Task 20
      "(re)Comment your code"                           // Task 10
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

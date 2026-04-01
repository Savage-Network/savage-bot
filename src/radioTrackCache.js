'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'radio-cache.json');
const MAX_ENTRIES = 200;
const DB_VERSION = 1;

function ensureDir() {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDb() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return { version: DB_VERSION, guilds: {} };
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { version: DB_VERSION, guilds: {} };
    if (!data.guilds || typeof data.guilds !== 'object') data.guilds = {};
    return data;
  } catch {
    return { version: DB_VERSION, guilds: {} };
  }
}

function writeDb(data) {
  ensureDir();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 0), 'utf8');
}

function normUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const x = new URL(u);
    x.search = '';
    x.hash = '';
    return x.href;
  } catch {
    return u.trim();
  }
}

/**
 * @param {string} guildId
 * @param {object} track
 */
function addFinishedTrack(guildId, track) {
  if (!track || !guildId) return;

  const db = readDb();
  const gid = String(guildId);
  if (!db.guilds[gid]) db.guilds[gid] = { entries: [] };

  const list = db.guilds[gid].entries;
  const fileKey = track.file;

  // Evita duplicados seguidos ou remove antiga entrada do mesmo ficheiro
  const idx = list.findIndex((e) => e.file === fileKey);
  if (idx !== -1) list.splice(idx, 1);

  list.push({
    title: String(track.title || 'Sem título').slice(0, 500),
    artist: String(track.artist || 'Desconhecido'),
    file: track.file,
    finishedAt: Date.now(),
  });

  while (list.length > MAX_ENTRIES) list.shift();

  try {
    writeDb(db);
  } catch (e) {
    console.warn('[radio-cache] Falha ao gravar:', e?.message || e);
  }
}

function getEntries(guildId) {
  const db = readDb();
  const g = db.guilds[String(guildId)];
  if (!g || !Array.isArray(g.entries)) return [];
  return g.entries;
}

function clearGuild(guildId) {
  const db = readDb();
  const gid = String(guildId);
  if (db.guilds[gid]) {
    db.guilds[gid] = { entries: [] };
    try {
      writeDb(db);
    } catch (e) {
      console.warn('[radio-cache] Falha ao limpar:', e?.message || e);
    }
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  addFinishedTrack,
  getEntries,
  clearGuild,
  shuffleInPlace,
  MAX_ENTRIES,
};

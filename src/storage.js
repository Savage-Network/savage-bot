'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const TICKET_COUNTER_FILE = path.join(DATA_DIR, 'ticket-counter.json');
const TICKET_META_FILE = path.join(DATA_DIR, 'ticket-meta.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Estrutura em disco: `{ users: { userId: channelId }, channels: { channelId: userId } }`.
 * Migra automaticamente o formato antigo `{ userId: channelId }`.
 */
function getTicketStore() {
  const raw = readJson(TICKETS_FILE, null);
  if (!raw || typeof raw !== 'object') {
    return { users: {}, channels: {} };
  }
  if (raw.users && typeof raw.users === 'object' && !Array.isArray(raw.users)) {
    return {
      users: { ...raw.users },
      channels: { ...(raw.channels || {}) },
    };
  }
  const users = { ...raw };
  const channels = {};
  for (const [uid, cid] of Object.entries(users)) {
    if (typeof cid === 'string' && cid) channels[cid] = uid;
  }
  const migrated = { users, channels };
  writeJson(TICKETS_FILE, migrated);
  return migrated;
}

function setTicketStore(store) {
  writeJson(TICKETS_FILE, {
    users: { ...store.users },
    channels: { ...store.channels },
  });
}

function setUserTicket(userId, channelId) {
  const s = getTicketStore();
  const oldCid = s.users[userId];
  if (oldCid && oldCid !== channelId) delete s.channels[oldCid];
  s.users[userId] = channelId;
  s.channels[channelId] = userId;
  setTicketStore(s);
}

function clearUserTicket(userId) {
  const s = getTicketStore();
  const cid = s.users[userId];
  delete s.users[userId];
  if (cid) delete s.channels[cid];
  setTicketStore(s);
}

function getChannelForUser(userId) {
  return getTicketStore().users[userId] || null;
}

function getUserByChannel(channelId) {
  return getTicketStore().channels[channelId] || null;
}

/** Próximo ID de ticket sequencial (1, 2, 3, …), persistido em disco. */
function getNextTicketSequentialId() {
  ensureDataDir();
  let nextId = 1;
  const data = readJson(TICKET_COUNTER_FILE, { nextId: 1 });
  const n = parseInt(data.nextId, 10);
  if (Number.isFinite(n) && n >= 1) nextId = n;
  writeJson(TICKET_COUNTER_FILE, { nextId: nextId + 1 });
  return nextId;
}

function getTicketMetaMap() {
  return readJson(TICKET_META_FILE, {});
}

function setTicketMetaMap(map) {
  writeJson(TICKET_META_FILE, map);
}

function getTicketMeta(channelId) {
  return getTicketMetaMap()[channelId] || null;
}

function setTicketMeta(channelId, data) {
  const m = getTicketMetaMap();
  m[channelId] = data;
  setTicketMetaMap(m);
}

function upsertTicketMeta(channelId, partial) {
  const m = getTicketMetaMap();
  m[channelId] = { ...(m[channelId] || {}), ...partial };
  setTicketMetaMap(m);
}

function deleteTicketMeta(channelId) {
  const m = getTicketMetaMap();
  delete m[channelId];
  setTicketMetaMap(m);
}

module.exports = {
  setUserTicket,
  clearUserTicket,
  getChannelForUser,
  getUserByChannel,
  getNextTicketSequentialId,
  getTicketMeta,
  setTicketMeta,
  upsertTicketMeta,
  deleteTicketMeta,
};

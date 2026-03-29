'use strict';

/** Cores § do Minecraft (0–9, a–f) → hex */
const mcHex = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
};

/** Tag exibida no servidor → código de cor § */
const tagToCode = {
  CHEFE: '4',
  CHIEF: '4',
  ADMIN: '4',
  'MOD+': '5',
  MOD: '5',
  TRIAL: '5',
  HELPER: '9',
  STUDIO: '2',
  BUILDER: '2',
  'MIDIA+': '3',
  'MEDIA+': '3',
  MIDIA: 'b',
  MEDIA: 'b',
  TIKTOKER: 'b',
  STREAMER: 'b',
  YOUTUBER: 'b',
  BETA: '1',
  CHAMPION: '6',
  SAVAGE: '2',
  EMBER: 'c',
  NATURE: 'e',
  VIP: 'a',
  GOAT: 'e',
  '2026': 'b',
  MEMBRO: '7',
};

function hexToDiscordInt(hex) {
  const s = String(hex).replace(/^#/, '');
  const n = parseInt(s, 16);
  return Number.isFinite(n) && s.length === 6 ? n : null;
}

/**
 * Cor do embed (inteiro 0xRRGGBB) a partir da tag/rank do jogador, ou null se desconhecido.
 * @param {string|null|undefined} tag
 */
function discordColorFromTag(tag) {
  if (tag == null || !String(tag).trim()) return null;
  const key = String(tag).trim().toUpperCase();
  const code = tagToCode[key];
  if (!code) return null;
  const hex = mcHex[code];
  if (!hex) return null;
  return hexToDiscordInt(hex);
}

module.exports = {
  discordColorFromTag,
  mcHex,
  tagToCode,
};

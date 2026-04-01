'use strict';

const fs = require('fs');
const path = require('path');

const MUSIC_DIR = path.join(__dirname, '..', 'music');
const LIBRARY_JSON = path.join(MUSIC_DIR, 'library.json');
const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.webm', '.opus'];

let _metadata = {};

function loadMetadata() {
  try {
    if (fs.existsSync(LIBRARY_JSON)) {
      const raw = fs.readFileSync(LIBRARY_JSON, 'utf8');
      const parsed = JSON.parse(raw);
      // Remove as chaves de comentário/exemplo
      _metadata = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (!key.startsWith('_')) _metadata[key] = val;
      }
    }
  } catch {
    _metadata = {};
  }
}

/**
 * Retorna todos os ficheiros de áudio da pasta music/.
 * @returns {{ file: string, title: string, artist: string, path: string }[]}
 */
function getAllTracks() {
  loadMetadata();

  if (!fs.existsSync(MUSIC_DIR)) return [];

  const files = fs.readdirSync(MUSIC_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return AUDIO_EXTENSIONS.includes(ext);
  });

  return files.map((file) => {
    const meta = _metadata[file] || {};
    const nameWithoutExt = path.basename(file, path.extname(file));
    return {
      file,
      path: path.join(MUSIC_DIR, file),
      title: meta.title || nameWithoutExt.replace(/[_-]/g, ' '),
      artist: meta.artist || 'Desconhecido',
    };
  });
}

/**
 * Escolhe uma faixa aleatória (excluindo a atual, se fornecida).
 */
function getRandomTrack(excludeFile = null) {
  const tracks = getAllTracks();
  if (tracks.length === 0) return null;

  const pool = tracks.length > 1
    ? tracks.filter((t) => t.file !== excludeFile)
    : tracks;

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Pesquisa na biblioteca por nome (insensível a maiúsculas).
 */
function searchTracks(query) {
  if (!query) return getAllTracks().slice(0, 25);
  const q = query.toLowerCase();
  return getAllTracks()
    .filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.file.toLowerCase().includes(q)
    )
    .slice(0, 25);
}

/**
 * Verifica se a biblioteca tem pelo menos uma música.
 */
function hasAnyTracks() {
  return getAllTracks().length > 0;
}

module.exports = {
  getAllTracks,
  getRandomTrack,
  searchTracks,
  hasAnyTracks,
  MUSIC_DIR,
};

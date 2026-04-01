'use strict';

/**
 * Rádio 24/7 — reprodução de ficheiros locais da pasta music/
 * Usa @discordjs/voice directamente para evitar problemas com streaming externo.
 */

const path = require('path');
const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  entersState,
  StreamType,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  getVoiceConnection,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const ffmpeg = require('ffmpeg-static');
const prism = require('prism-media');
const config = require('./config');
const { getRandomTrack, hasAnyTracks, MUSIC_DIR } = require('./musicLibrary');
const { addFinishedTrack } = require('./radioTrackCache');

let audioPlayer = null;
let currentTrackData = null;
let currentVolume = 0.8;
let clientRef = null;
let _nextTimer = null;

function getRadioPlayer() {
  return audioPlayer;
}

function getCurrentTrackData() {
  return currentTrackData;
}

function getVolume() {
  return currentVolume;
}

function setVolume(vol) {
  currentVolume = Math.max(0, Math.min(1, vol));
  if (audioPlayer && audioPlayer.state.resource) {
    audioPlayer.state.resource.volume?.setVolume(currentVolume);
  }
}

/**
 * Resolve o canal de voz configurado.
 */
async function resolveRadioVoiceChannel(client) {
  const id = config.voiceChannelId();
  if (!id) return null;
  const ch = await client.channels.fetch(id).catch(() => null);
  if (!ch || !ch.isVoiceBased()) return null;
  return ch;
}

/**
 * Garante uma VoiceConnection no canal.
 */
async function ensureVoiceConnection(channel) {
  const existing = getVoiceConnection(channel.guildId);
  if (existing && existing.state.status === VoiceConnectionStatus.Ready) {
    return existing;
  }

  const conn = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  try {
    await entersState(conn, VoiceConnectionStatus.Ready, 30_000);
    return conn;
  } catch (err) {
    console.error('[radio] Erro ao ligar ao canal:', err.message);
    conn.destroy();
    return null;
  }
}

/**
 * Toca a próxima música aleatória.
 */
async function playNext(channel) {
  if (!hasAnyTracks()) {
    console.warn('[radio] Nenhuma música na pasta music/');
    return;
  }

  const track = getRandomTrack();
  if (!track) return;

  currentTrackData = {
    title: track.title,
    artist: track.artist,
    file: track.file,
  };
  console.log(`[radio] A tocar: ${track.title} — ${track.artist} (${track.file})`);

  const conn = await ensureVoiceConnection(channel);
  if (!conn) {
    console.warn('[radio] Sem ligação de voz. Tentando novamente em 15s…');
    scheduleNext(15000);
    return;
  }

  let resource;
  try {
    const ffmpegProcess = new prism.FFmpeg({
      args: ['-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2'],
      shell: false,
      command: ffmpeg,
    });
    const stream = require('fs').createReadStream(track.path).pipe(ffmpegProcess).pipe(new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 }));

    resource = createAudioResource(stream, {
      inlineVolume: true,
      inputType: StreamType.Opus,
      metadata: { title: track.title, artist: track.artist, file: track.file },
    });
    resource.volume?.setVolume(currentVolume);
  } catch (e) {
    console.error('[radio] Erro ao criar AudioResource:', e.message);
    scheduleNext(3000);
    return;
  }

  conn.subscribe(audioPlayer);
  audioPlayer.play(resource);

  // Historico
  addFinishedTrack(channel.guildId, {
    title: track.title,
    artist: track.artist,
    file: track.file,
  });
}

/**
 * Agenda a próxima música.
 */
function scheduleNext(delayMs = 1500) {
  if (_nextTimer) clearTimeout(_nextTimer);
  _nextTimer = setTimeout(async () => {
    _nextTimer = null;
    if (!clientRef) return;
    const channel = await resolveRadioVoiceChannel(clientRef);
    if (!channel) return;
    await playNext(channel);
  }, delayMs);
}

/**
 * Toca uma faixa específica (usado pelo /radio tocar ou botões).
 */
async function playTrackByFile(channel, trackObj) {
  currentTrackData = {
    title: trackObj.title,
    artist: trackObj.artist,
    file: trackObj.file,
  };

  const conn = await ensureVoiceConnection(channel);
  if (!conn) {
    console.error('[radio] Sem ligação de voz para tocar faixa pedida.');
    return false;
  }

  let resource;
  try {
    const fullPath = path.join(MUSIC_DIR, trackObj.file);
    const ffmpegProcess = new prism.FFmpeg({
      args: ['-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2'],
      shell: false,
      command: ffmpeg,
    });
    const stream = require('fs').createReadStream(fullPath).pipe(ffmpegProcess).pipe(new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 }));

    resource = createAudioResource(stream, {
      inlineVolume: true,
      inputType: StreamType.Opus,
      metadata: { title: trackObj.title, artist: trackObj.artist, file: trackObj.file },
    });
    resource.volume?.setVolume(currentVolume);
  } catch (e) {
    console.error('[radio] Erro ao criar recurso:', e.message);
    return false;
  }

  conn.subscribe(audioPlayer);
  audioPlayer.play(resource);
  console.log(`[radio] A tocar (pedido): ${trackObj.title} — ${trackObj.artist}`);
  return true;
}

/**
 * Inicializa o player de rádio.
 */
async function initRadioPlayer(client) {
  clientRef = client;

  audioPlayer = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  audioPlayer.on('error', (err) => {
    console.error('[radio] Erro no AudioPlayer:', err.message);
    scheduleNext(3000);
  });

  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    console.log('[radio] Faixa terminada, a selecionar próxima…');
    scheduleNext(1500);
  });

  console.log('[radio] AudioPlayer local inicializado.');

  // Auto-join inicial
  if (config.voiceEnabled()) {
    setTimeout(async () => {
      const channel = await resolveRadioVoiceChannel(client);
      if (channel) {
        console.log('[radio] A iniciar reprodução automática inicial...');
        await playNext(channel);
      }
    }, 10_000);
  }

  return audioPlayer;
}

module.exports = {
  getRadioPlayer,
  initRadioPlayer,
  resolveRadioVoiceChannel,
  playNext,
  playTrackByFile,
  AudioPlayerStatus,
  getCurrentTrackData,
  getVolume,
  setVolume,
};

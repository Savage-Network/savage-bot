'use strict';

const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require('@discordjs/voice');
const config = require('./config');

let voiceInterval = null;
let lastGuildId = null;

async function connectVoice(client) {
  const channelId = config.voiceChannelId();
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) {
    console.warn('[voz] VOICE_CHANNEL_ID inválido ou canal inacessível.');
    return null;
  }

  lastGuildId = channel.guildId;

  const existing = getVoiceConnection(channel.guildId);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
    try {
      if (existing.joinConfig.channelId === channel.id) return existing;
    } catch {
      /* continuar */
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  connection.on('error', (err) => {
    console.error('[voz] Erro na ligação:', err?.message || err);
  });

  connection.on('stateChange', (oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      console.warn('[voz] Desligado da voz — a voltar a ligar em breve...');
      setTimeout(() => tryJoin(client), 4000);
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch (e) {
    console.error('[voz] Timeout ao entrar no canal:', e?.message || e);
  }

  return connection;
}

function tryJoin(client) {
  connectVoice(client).catch((e) => console.error('[voz] Falha ao reconectar:', e?.message || e));
}

function startVoiceWatch(client) {
  if (!config.voiceChannelId()) return;

  tryJoin(client);

  if (voiceInterval) clearInterval(voiceInterval);
  voiceInterval = setInterval(() => {
    tryJoin(client);
  }, config.voiceReconnectIntervalMs());
}

function stopVoiceWatch() {
  if (voiceInterval) {
    clearInterval(voiceInterval);
    voiceInterval = null;
  }
  if (lastGuildId) {
    const conn = getVoiceConnection(lastGuildId);
    try {
      conn?.destroy();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { connectVoice, startVoiceWatch, stopVoiceWatch, tryJoin };

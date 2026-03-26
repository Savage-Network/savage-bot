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
let reconnectTimeout = null;
let voiceListenersAttached = false;

function scheduleReconnect(client, delayMs = 600) {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    tryJoin(client);
  }, delayMs);
}

function isJoinInProgress(conn) {
  const s = conn?.state?.status;
  return (
    s === VoiceConnectionStatus.Signalling ||
    s === VoiceConnectionStatus.Connecting
  );
}

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
  if (existing && existing.joinConfig.channelId !== channel.id) {
    try {
      existing.destroy();
    } catch {
      /* ignore */
    }
  }

  const same = getVoiceConnection(channel.guildId);
  if (same && same.joinConfig.channelId === channel.id) {
    if (same.state.status === VoiceConnectionStatus.Ready) {
      return same;
    }
    if (isJoinInProgress(same)) {
      return same;
    }
    if (same.state.status === VoiceConnectionStatus.Disconnected) {
      try {
        const requested = same.rejoin();
        if (requested) {
          await entersState(same, VoiceConnectionStatus.Ready, 35_000);
          return same;
        }
      } catch (e) {
        console.warn('[voz] rejoin() falhou:', e?.message || e);
      }
    }
    try {
      same.destroy();
    } catch {
      /* ignore */
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
    scheduleReconnect(client, 800);
  });

  connection.on('stateChange', (oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      console.warn('[voz] Desligado da voz — a reconectar…');
      try {
        if (connection.state.status === VoiceConnectionStatus.Disconnected) {
          const ok = connection.rejoin();
          if (!ok) scheduleReconnect(client, 500);
        }
      } catch {
        scheduleReconnect(client, 500);
      }
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 35_000);
  } catch (e) {
    console.error('[voz] Timeout ao entrar no canal:', e?.message || e);
    try {
      connection.destroy();
    } catch {
      /* ignore */
    }
    scheduleReconnect(client, 1500);
  }

  return connection;
}

function tryJoin(client) {
  connectVoice(client).catch((e) => {
    console.error('[voz] Falha ao ligar:', e?.message || e);
    scheduleReconnect(client, 2000);
  });
}

/** Garante que o membro do bot está no canal configurado (ex.: kick da call, move). */
async function ensureMemberInChannel(client) {
  const channelId = config.voiceChannelId();
  if (!channelId || !client.user) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return;

  const guild = channel.guild;
  const member = await guild.members.fetch(client.user.id).catch(() => null);
  if (!member) return;

  if (member.voice.channelId === channelId) return;

  console.warn('[voz] Bot não está no canal configurado — a voltar a ligar…');
  scheduleReconnect(client, 400);
}

function attachVoiceGuards(client) {
  if (voiceListenersAttached) return;
  voiceListenersAttached = true;

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.member?.id !== client.user?.id) return;
    const target = config.voiceChannelId();
    if (!target) return;
    if (newState.channelId === target) return;
    console.warn('[voz] Estado de voz do bot mudou (saiu ou foi movido) — a reconectar…');
    scheduleReconnect(client, 300);
  });
}

function startVoiceWatch(client) {
  if (!config.voiceChannelId()) return;

  attachVoiceGuards(client);

  tryJoin(client);

  if (voiceInterval) clearInterval(voiceInterval);
  voiceInterval = setInterval(() => {
    ensureMemberInChannel(client).catch(() => {});
    tryJoin(client);
  }, config.voiceReconnectIntervalMs());
}

function stopVoiceWatch() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
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

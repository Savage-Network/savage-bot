'use strict';

/**
 * Coloca o bot num canal de voz como **enfeite** (aparece na lista de membros em call).
 * Uma ligação ao arranque (ou via `/dev voice`) — **sem** reconexão automática, sem forçar
 * reentrada se alguém mover o bot, para não haver sair/entrar em loop.
 */

const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require('@discordjs/voice');
const config = require('./config');

const JOIN_READY_TIMEOUT_MS = 120_000;

function isJoinInProgress(conn) {
  const s = conn?.state?.status;
  return (
    s === VoiceConnectionStatus.Signalling ||
    s === VoiceConnectionStatus.Connecting
  );
}

async function isStableInTargetChannel(client, channel) {
  const conn = getVoiceConnection(channel.guildId);
  if (
    !conn ||
    conn.joinConfig.channelId !== channel.id ||
    conn.state.status !== VoiceConnectionStatus.Ready
  ) {
    return false;
  }
  let member = channel.guild.members.cache.get(client.user.id);
  if (!member) {
    member = await channel.guild.members.fetch(client.user.id).catch(() => null);
  }
  return member?.voice?.channelId === channel.id;
}

/**
 * Liga o bot a um canal de voz (uma tentativa; sem watchdog de reconexão).
 * @param {{ joinReadyTimeoutMs?: number }} [opts]
 */
async function joinVoiceChannelById(client, channelId, opts = {}) {
  const joinTimeout =
    Number.isFinite(opts.joinReadyTimeoutMs) && opts.joinReadyTimeoutMs > 0
      ? opts.joinReadyTimeoutMs
      : JOIN_READY_TIMEOUT_MS;

  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) {
    console.warn('[voz] Canal inválido ou inacessível:', channelId);
    return null;
  }

  if (await isStableInTargetChannel(client, channel)) {
    return getVoiceConnection(channel.guildId);
  }

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
        if (same.rejoin()) {
          await entersState(same, VoiceConnectionStatus.Ready, joinTimeout);
          return same;
        }
      } catch (e) {
        console.warn('[voz] rejoin falhou:', e?.message || e);
      }
      try {
        same.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, joinTimeout);
  } catch (e) {
    console.warn('[voz] Não entrou na call:', e?.message || e);
    try {
      connection.destroy();
    } catch {
      /* ignore */
    }
    return null;
  }

  return connection;
}

async function connectVoice(client) {
  const channelId = config.voiceChannelId();
  if (!channelId) return null;
  return joinVoiceChannelById(client, channelId);
}

function startVoiceWatch(client) {
  if (!config.voiceChannelId()) return;
  connectVoice(client).catch((e) => console.warn('[voz]', e?.message || e));
}

function stopVoiceWatch() {
  /* Sem timers; o processo encerra a voz com client.destroy(). */
}

module.exports = {
  connectVoice,
  joinVoiceChannelById,
  startVoiceWatch,
  stopVoiceWatch,
};

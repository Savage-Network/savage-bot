'use strict';

/**
 * Mantém o bot **sempre** no canal de voz configurado (mesma stack que o discord-player / discord-voip).
 * Reconexão insistente em quedas, erros, gateway e se o bot for movido/saído da call.
 */

const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require('@discordjs/voice');
const config = require('./config');

const JOIN_READY_TIMEOUT_MS = 600_000;
const RECONNECT_DELAY_MS = 250;

let reconnectTimeout = null;
let gatewayListenersAttached = false;
let joinInFlight = false;

function scheduleReconnect(client, delayMs = RECONNECT_DELAY_MS) {
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
        const requested = same.rejoin();
        if (requested) {
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

  connection.on('error', (err) => {
    console.error('[voz] Erro na ligação:', err?.message || err);
    scheduleReconnect(client, RECONNECT_DELAY_MS);
  });

  connection.on('stateChange', (oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      console.warn('[voz] Desconectado — a reconectar…');
      try {
        if (connection.state.status === VoiceConnectionStatus.Disconnected) {
          const ok = connection.rejoin();
          if (!ok) scheduleReconnect(client, RECONNECT_DELAY_MS);
        }
      } catch {
        scheduleReconnect(client, RECONNECT_DELAY_MS);
      }
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, joinTimeout);
  } catch (e) {
    console.warn('[voz] Timeout / falha ao ficar Ready:', e?.message || e);
    try {
      const r = connection.rejoin();
      if (r) {
        await entersState(connection, VoiceConnectionStatus.Ready, joinTimeout);
        return connection;
      }
    } catch {
      /* ignore */
    }
    try {
      connection.destroy();
    } catch {
      /* ignore */
    }
    scheduleReconnect(client, RECONNECT_DELAY_MS);
  }

  return connection;
}

const { getRadioPlayer, AudioPlayerStatus } = require('./radioPlayer');

async function connectVoice(client) {
  const channelId = config.voiceChannelId();
  if (!channelId) return null;
  return joinVoiceChannelById(client, channelId);
}

async function tryJoin(client) {
  if (joinInFlight) return;

  // Se o rádio estiver ativo e já estiver a tratar da ligação, respeitamos.
  const audioPlayer = getRadioPlayer();
  if (audioPlayer) {
    const guildId = config.guildId(); 
    const conn = getVoiceConnection(guildId);
    if (conn && conn.state.status === VoiceConnectionStatus.Ready && audioPlayer.state.status === AudioPlayerStatus.Playing) {
      // Se já temos uma ligação pronta e o rádio está a tocar, não interferimos.
      return;
    }
  }

  joinInFlight = true;
  try {
    await connectVoice(client);
  } catch (e) {
    console.error('[voz] Falha ao ligar:', e?.message || e);
    scheduleReconnect(client, RECONNECT_DELAY_MS);
  } finally {
    joinInFlight = false;
  }
}

/**
 * Monitorização de eventos de estado de voz para garantir que o bot permanece no canal fixo.
 */
function onVoiceStateForStay(client, oldState, newState) {
  if (newState.member?.id !== client.user?.id) return;
  const target = config.voiceChannelId();
  if (!target) return;
  if (newState.channelId === target) return;
  console.warn('[voz] Bot saiu ou foi movido da call fixa — a reconectar…');
  scheduleReconnect(client, RECONNECT_DELAY_MS);
}

function attachGatewayGuards(client) {
  if (gatewayListenersAttached) return;
  gatewayListenersAttached = true;
  client.on('shardResume', (shardId, replayed) => {
    if (!config.voiceChannelId()) return;
    console.warn(`[voz] Gateway retomado (shard ${shardId}) — a garantir call…`);
    scheduleReconnect(client, RECONNECT_DELAY_MS);
  });
}

function startVoiceWatch(client) {
  if (!config.voiceChannelId()) return;
  attachGatewayGuards(client);
  tryJoin(client);
}

function stopVoiceWatch() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

module.exports = {
  connectVoice,
  joinVoiceChannelById,
  startVoiceWatch,
  stopVoiceWatch,
  tryJoin,
  onVoiceStateForStay,
};

'use strict';

/**
 * Mantém o bot no canal de voz configurado sem desligar à toa — evita reset do tempo na call.
 * O intervalo só verifica se o membro saiu; não força nova ligação se já estiver estável.
 */

const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require('@discordjs/voice');
const config = require('./config');

let voiceInterval = null;
let reconnectTimeout = null;
let voiceListenersAttached = false;
let gatewayListenersAttached = false;
/** Evita várias ligações em paralelo (reconexões duplicadas resetam o tempo na call). */
let joinInFlight = false;

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

/**
 * Ligação já estável + bot já está no canal certo → não faz nada (preserva tempo na call).
 */
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
 * Liga o bot a um canal de voz por ID.
 * @param {{ reconnectOnError?: boolean }} [opts] — se `true`, reconecta ao canal de voz principal (watch); use `false` para `/dev voice`.
 */
async function joinVoiceChannelById(client, channelId, opts = {}) {
  const reconnectOnError = !!opts.reconnectOnError;
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) {
    console.warn('[voz] Canal inválido ou inacessível:', channelId);
    return null;
  }

  if (await isStableInTargetChannel(client, channel)) {
    const conn = getVoiceConnection(channel.guildId);
    return conn;
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
    if (reconnectOnError) scheduleReconnect(client, 800);
  });

  connection.on('stateChange', (oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      console.warn('[voz] Desconectado da voz — reconectando…');
      try {
        if (connection.state.status === VoiceConnectionStatus.Disconnected) {
          const ok = connection.rejoin();
          if (!ok && reconnectOnError) scheduleReconnect(client, 500);
        }
      } catch {
        if (reconnectOnError) scheduleReconnect(client, 500);
      }
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 35_000);
  } catch (e) {
    console.error('[voz] Timeout ao entrar no canal:', e?.message || e);
    try {
      const r = connection.rejoin();
      if (r) {
        await entersState(connection, VoiceConnectionStatus.Ready, 35_000);
        return connection;
      }
    } catch {
      /* continuar */
    }
    try {
      connection.destroy();
    } catch {
      /* ignore */
    }
    if (reconnectOnError) scheduleReconnect(client, 1500);
  }

  return connection;
}

async function connectVoice(client) {
  const channelId = config.voiceChannelId();
  if (!channelId) return null;
  return joinVoiceChannelById(client, channelId, { reconnectOnError: true });
}

async function tryJoin(client) {
  if (joinInFlight) return;
  joinInFlight = true;
  try {
    await connectVoice(client);
  } catch (e) {
    console.error('[voz] Falha ao ligar:', e?.message || e);
    scheduleReconnect(client, 2000);
  } finally {
    joinInFlight = false;
  }
}

/** Só reconecta se o bot realmente não estiver no canal configurado. */
async function ensureMemberInChannel(client) {
  const channelId = config.voiceChannelId();
  if (!channelId || !client.user) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return;

  const guild = channel.guild;
  const member = await guild.members.fetch(client.user.id).catch(() => null);
  if (!member) return;

  if (member.voice.channelId === channelId) return;

  console.warn('[voz] Bot não está no canal configurado — reconectando…');
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
    console.warn('[voz] Estado de voz do bot mudou (saiu ou foi movido) — reconectando…');
    scheduleReconnect(client, 300);
  });
}

/** Após queda/reconexão do gateway WebSocket, a voz pode cair — volta a entrar no canal. */
function attachGatewayVoiceGuards(client) {
  if (gatewayListenersAttached) return;
  gatewayListenersAttached = true;

  client.on('shardResume', (shardId, replayed) => {
    if (!config.voiceChannelId()) return;
    console.warn(
      `[voz] Gateway retomado (shard ${shardId}, ${replayed} eventos) — garantindo canal de voz…`
    );
    scheduleReconnect(client, 1200);
  });

  client.on('shardDisconnect', (event, shardId) => {
    if (!config.voiceChannelId()) return;
    console.warn(`[voz] Gateway desconectado (shard ${shardId}, código ${event.code}) — aguardando retomada…`);
  });
}

function startVoiceWatch(client) {
  if (!config.voiceChannelId()) return;

  attachVoiceGuards(client);
  attachGatewayVoiceGuards(client);

  tryJoin(client);

  if (voiceInterval) clearInterval(voiceInterval);
  /** Só verifica presença no canal — não chama tryJoin em loop (evita reset do tempo). */
  voiceInterval = setInterval(() => {
    ensureMemberInChannel(client).catch(() => {});
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
  /** Não chamar destroy() aqui: evita sinal explícito de sair da call antes do encerramento;
   * o client.destroy() no shutdown encerra tudo. */
}

module.exports = {
  connectVoice,
  joinVoiceChannelById,
  startVoiceWatch,
  stopVoiceWatch,
  tryJoin,
};

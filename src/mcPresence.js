'use strict';

const { ActivityType } = require('discord.js');
const { status } = require('minecraft-server-util');
const config = require('./config');

let presenceTimer = null;
/** Evita chamadas à API quando o texto da atividade não mudou. */
let lastPresenceActivityName = null;

const MC_STATUS_CACHE_MS = 5000;
let mcStatusCache = { at: 0, data: null };
let inflightMcStatus = null;

async function queryMcStatusOnce() {
  const host = config.mcHost();
  const port = config.mcPort();
  try {
    // minecraft-server-util: status(host, port, options) — o 2.º argumento tem de ser número da porta
    const res = await status(host, port, {
      timeout: config.mcStatusTimeoutMs(),
      enableSRV: config.mcEnableSRV(),
    });
    const online = res.players?.online ?? 0;
    const max = res.players?.max ?? 0;
    const version = res.version?.name || '?';
    const sample = res.players?.sample ?? null;
    const latencyMs =
      typeof res.roundTripLatency === 'number' ? res.roundTripLatency : null;
    const protocol = res.version?.protocol ?? null;
    return {
      ok: true,
      online,
      max,
      version,
      motd: res.motd?.clean?.[0] || '',
      sample,
      latencyMs,
      protocol,
    };
  } catch (e) {
    if (process.env.DEBUG_MC === '1') {
      console.warn('[MC status]', e?.message || e);
    }
    return {
      ok: false,
      online: 0,
      max: 0,
      version: '?',
      motd: '',
      sample: null,
      latencyMs: null,
      protocol: null,
    };
  }
}

/** Ping ao servidor Java com cache curto e deduplicação de pedidos em voo. */
async function fetchMcStatus() {
  const now = Date.now();
  if (
    mcStatusCache.data != null &&
    now - mcStatusCache.at < MC_STATUS_CACHE_MS
  ) {
    return mcStatusCache.data;
  }
  if (inflightMcStatus) return inflightMcStatus;
  inflightMcStatus = (async () => {
    try {
      const data = await queryMcStatusOnce();
      mcStatusCache = { at: Date.now(), data };
      return data;
    } finally {
      inflightMcStatus = null;
    }
  })();
  return inflightMcStatus;
}

function textoJogadoresOnline(online) {
  const n = Math.max(0, Math.floor(Number(online)) || 0);
  if (n === 1) return '1 jogador online.';
  return `${n} jogadores online.`;
}

const { getCurrentTrackData, getRadioPlayer, AudioPlayerStatus } = require('./radioPlayer');

function startMcPresence(client) {
  if (presenceTimer) clearInterval(presenceTimer);

  async function tick() {
    if (!client.user) return;
    const s = await fetchMcStatus();
    let mcName = s.ok ? `SavageMC · ${textoJogadoresOnline(s.online)}` : 'SavageMC · servidor offline.';

    let activityName = mcName;
    let activityType = ActivityType.Watching;

    // Se estiver a tocar rádio, mostramos no status
    if (config.voiceEnabled()) {
      const radio = getRadioPlayer();
      const track = getCurrentTrackData();
      if (radio && radio.state.status === AudioPlayerStatus.Playing && track) {
        activityName = `Ouvindo: ${track.title} — ${track.artist} | ${mcName}`;
        activityType = ActivityType.Listening;
      }
    }

    if (activityName.length > 128) activityName = activityName.slice(0, 125) + '...';
    if (activityName === lastPresenceActivityName) return;
    lastPresenceActivityName = activityName;

    try {
      client.user.setPresence({
        activities: [
          {
            name: activityName,
            type: activityType,
          },
        ],
        status: 'online',
      });
    } catch {
      /* ignore */
    }
  }

  tick();
  presenceTimer = setInterval(tick, config.mcPresenceIntervalMs());
}

function stopMcPresence() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  lastPresenceActivityName = null;
}

module.exports = { startMcPresence, stopMcPresence, fetchMcStatus };

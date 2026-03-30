'use strict';

/**
 * Consulta periódica `GET /api/client/servers/{uuid}/resources` e envia log quando
 * `current_state` muda (inclui alterações feitas no painel, não só pelo bot).
 */

const config = require('./config');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  V2_FLAGS,
  footerTimestampLine,
} = require('./v2Helpers');
const { getResolvedPtero, fetchServerCurrentState } = require('./pteroPanel');

const lastStates = new Map();
let warmup = true;
let runningTick = false;

function describeTransition(prev, next) {
  if (next === 'running' && prev !== 'running') {
    return '**Iniciado** — servidor em execução.';
  }
  if (next === 'offline' && prev !== 'offline') {
    return '**Encerrado** — servidor parado.';
  }
  if (prev === 'running' && next === 'starting') {
    return '**Reinício** em curso (processo a arrancar).';
  }
  if (next === 'stopping') {
    return 'A **encerrar**…';
  }
  if (next === 'starting') {
    return 'A **iniciar**…';
  }
  return 'Estado atualizado no painel.';
}

function buildStateChangeMarkdown(serverName, panelUrl, prev, next) {
  const evento = describeTransition(prev, next);
  return (
    '## Pterodactyl · estado (painel)\n\n' +
    `**Servidor** · **${serverName}**\n` +
    `**Estado** · \`${prev}\` → \`${next}\`\n\n` +
    `${evento}\n\n` +
    `**Painel** · \`${panelUrl}\``
  );
}

async function sendStateChangeLog(client, channelId, serverName, panelUrl, prev, next) {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const md = buildStateChangeMarkdown(serverName, panelUrl, prev, next);
  const container = new ContainerBuilder()
    .setAccentColor(config.embedAccentColor())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(md.slice(0, 3800)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerTimestampLine(footer().text))
    );

  try {
    await ch.send({ flags: V2_FLAGS.public, components: [container] });
  } catch (e) {
    console.error('[ptero poll] falha ao enviar log:', e.message);
  }
}

async function pollTick(client) {
  const ms = config.pteroStatePollMs();
  if (!ms) return;

  const channelId = config.pteroLogChannelId();
  if (!channelId) return;

  const { panelUrl, apiKey, servers } = getResolvedPtero();
  if (!panelUrl || !apiKey) return;

  const entries = Object.entries(servers).filter(([, u]) => u && String(u).trim());

  const wasWarmup = warmup;

  for (const [name, uuidRaw] of entries) {
    const uuid = String(uuidRaw).trim();
    const state = await fetchServerCurrentState(panelUrl, apiKey, uuid);
    if (state == null) continue;

    const prev = lastStates.get(uuid);

    if (wasWarmup) {
      lastStates.set(uuid, state);
      continue;
    }

    if (prev === undefined) {
      lastStates.set(uuid, state);
      continue;
    }

    if (prev !== state) {
      lastStates.set(uuid, state);
      await sendStateChangeLog(client, channelId, name, panelUrl, prev, state);
    }
  }

  if (wasWarmup) warmup = false;
}

/**
 * @param {import('discord.js').Client} client
 */
function startPteroStatePoller(client) {
  const ms = config.pteroStatePollMs();
  if (!ms) {
    console.log('[ptero] Monitor de estado do painel desativado (pteroStatePollMs = 0).');
    return;
  }

  if (!config.pteroLogChannelId()) {
    console.warn(
      '[ptero] Monitor de estado: define pteroLogChannelId para registar mudanças de estado.'
    );
    return;
  }

  const { panelUrl, apiKey, servers } = getResolvedPtero();
  if (!panelUrl || !apiKey) {
    console.warn(
      '[ptero] Monitor de estado: falta panelUrl ou chave Client API (ptero.json / env).'
    );
    return;
  }

  const count = Object.keys(servers).filter((k) => k && String(servers[k]).trim()).length;
  if (count === 0) {
    console.warn('[ptero] Monitor de estado: nenhum servidor em ptero.json → servers.');
    return;
  }

  console.log(`[ptero] Monitor de estado ativo — ${count} servidor(es), intervalo ${ms} ms.`);

  const tick = async () => {
    if (runningTick) return;
    runningTick = true;
    try {
      await pollTick(client);
    } catch (e) {
      console.error('[ptero poll]', e);
    } finally {
      runningTick = false;
    }
  };

  tick();
  setInterval(tick, ms);
}

module.exports = { startPteroStatePoller };

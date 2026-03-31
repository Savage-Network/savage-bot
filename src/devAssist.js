'use strict';

/**
 * Textos e dados para o assistente de desenvolvimento (`/dev`).
 * Nunca expor segredos (tokens, chaves de API).
 */

const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');
const { getResolvedPtero } = require('./pteroPanel');

const pkg = require('../package.json');

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${m}m ${sec}s`);
  return parts.join(' ');
}

function discordJsVersion() {
  try {
    return require('discord.js/package.json').version;
  } catch {
    return '?';
  }
}

function buildersVersion() {
  try {
    return require('@discordjs/builders/package.json').version;
  } catch {
    return '?';
  }
}

function tryGitInfo() {
  try {
    const root = path.join(__dirname, '..');
    const head = execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
      timeout: 4000,
    }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      encoding: 'utf8',
      timeout: 4000,
    }).trim();
    return { branch, head };
  } catch {
    return null;
  }
}

/**
 * @param {object} o
 * @param {import('discord.js').Client} o.client
 * @param {number} o.botStartedAtMs
 */
function buildDiagnosticoMarkdown({ client, botStartedAtMs }) {
  const mem = process.memoryUsage();
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
  const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const uptimeBot = formatUptime(Date.now() - botStartedAtMs);
  const uptimeProc = formatUptime(process.uptime() * 1000);
  const git = tryGitInfo();
  const gitLine = git
    ? `**Git** · \`${git.branch}\` @ \`${git.head}\``
    : '**Git** · _(sem repositório ou git não disponível)_';

  return (
    '## Dev · diagnóstico\n\n' +
    '-# Snapshot do processo e da biblioteca — útil para reportar bugs ou comparar ambientes.\n\n' +
    `**Pacote** · \`${pkg.name}\` v${pkg.version}\n` +
    `**Node.js** · ${process.version} · **Plataforma** · ${process.platform} (${process.arch})\n` +
    `**discord.js** · ${discordJsVersion()} · **@discordjs/builders** · ${buildersVersion()}\n\n` +
    `**PID** · \`${process.pid}\`\n` +
    `**Uptime do processo** · ${uptimeProc}\n` +
    `**Uptime desde o arranque do bot** · ${uptimeBot}\n\n` +
    `**Memória RSS** · ${rssMb} MB · **Heap usado** · ${heapMb} MB\n` +
    `**Gateway (WS ping)** · ${client.ws.ping >= 0 ? `${client.ws.ping} ms` : '—'}\n\n` +
    `${gitLine}`
  );
}

function buildDocsMarkdown(repositoryUrl) {
  const repo =
    repositoryUrl && String(repositoryUrl).trim()
      ? String(repositoryUrl).trim()
      : null;
  const repoLine = repo
    ? `**Repositório (config)** · ${repo}\n\n`
    : '';

  return (
    '## Dev · documentação e referências\n\n' +
    '-# Ligações rápidas para desenvolver bots Discord e APIs.\n\n' +
    repoLine +
    '**discord.js (guia)** · [discordjs.guide](https://discordjs.guide/)\n' +
    '**discord.js (docs)** · [discord.js.org/docs](https://discord.js.org/docs/packages/discord.js/main)\n' +
    '**API Discord (developers)** · [discord.com/developers/docs](https://discord.com/developers/docs/intro)\n' +
    '**Components V2 (guia)** · [discordjs.guide/popular-topics/components-v2.html](https://discordjs.guide/popular-topics/components-v2.html)\n' +
    '**discord-api-types** · [npmjs.com/package/discord-api-types](https://www.npmjs.com/package/discord-api-types)\n\n' +
    '**Node.js** · [nodejs.org/docs](https://nodejs.org/docs/latest/api/)\n' +
    '**Pterodactyl (painel)** · [pterodactyl.io](https://pterodactyl.io/project/introduction.html)'
  );
}

/**
 * @param {import('discord.js').Guild} guild
 */
function buildGuildDebugMarkdown(guild) {
  let features = '—';
  if (guild.features && guild.features.size > 0) {
    features = [...guild.features].slice(0, 25).join(', ');
  }
  return (
    '## Dev · servidor (debug)\n\n' +
    '-# IDs e definições úteis para permissões, intents e integrações.\n\n' +
    `**Nome** · ${guild.name}\n` +
    `**ID do servidor** · \`${guild.id}\`\n` +
    `**Dono** · \`${guild.ownerId}\`\n` +
    `**Membros** · ${guild.memberCount}\n` +
    `**Boost** · tier ${guild.premiumTier} · ${guild.premiumSubscriptionCount} boosts\n` +
    `**Nível de verificação** · ${guild.verificationLevel}\n` +
    `**Filtro de conteúdo** · ${guild.explicitContentFilter}\n` +
    `**Locale** · ${guild.preferredLocale}\n\n` +
    `**Canais (cache)** · ${guild.channels.cache.size}\n` +
    `**Cargos** · ${guild.roles.cache.size}\n\n` +
    `**Features (primeiras 25)**\n\`${features}\``
  );
}

function buildSafeConfigMarkdown() {
  const ptero = getResolvedPtero();
  const pteroLine =
    ptero.panelUrl && ptero.apiKey
      ? `**Pterodactyl** · painel \`${ptero.panelUrl}\` · chave API definida · **${Object.keys(ptero.servers).length}** servidor(es) em \`ptero.json\``
      : ptero.panelUrl
        ? `**Pterodactyl** · painel \`${ptero.panelUrl}\` · _sem chave API (env ou ptero.json)_`
        : '**Pterodactyl** · _(opcional — copia `ptero.example.json` → `ptero.json`)_';

  const lines = [
    '## Dev · configuração (sem segredos)\n',
    '-# Valores efetivos que o bot lê do `config.json` / ambiente — **nunca** inclui `DISCORD_TOKEN` nem chaves API.\n',
    '',
    `**guildId** · \`${config.guildId() || '—'}\``,
    `**mcHost** · \`${config.mcHost()}\` · **mcPort** · ${config.mcPort()}`,
    `**mcPresenceIntervalMs** · ${config.mcPresenceIntervalMs()}`,
    `**statsSiteUrl** · ${config.statsSiteUrl()}`,
    `**savageApiBaseUrl** · ${config.savageApiBaseUrl()}`,
    `**embedAccentColor** · ${config.embedAccentColor()}`,
    `**voiceEnabled** · ${config.voiceEnabled()}`,
    `**devCommitChannelId** · \`${config.devCommitChannelId() || '—'}\``,
    `**pteroLogChannelId** · \`${config.pteroLogChannelId() || '—'}\` — log de \`/dev ptero\``,
    `**pteroRoleId** · \`${config.pteroRoleId() || '—'}\` — se definido, só este cargo usa \`/dev ptero\` (senão \`canaisDEV\`)`,
    `**pteroStatePollMs** · ${config.pteroStatePollMs()} — consulta ao painel para log quando o estado muda (0 = desativado)`,
    `**devVoiceChannelId** · \`${config.devVoiceChannelId() || '—'}\``,
    `**canaisDEV** · ${config.canaisDEV().length} mapeamento(s)`,
    '',
    pteroLine,
  ];
  return lines.join('\n');
}

/** Resumo do `package.json` do bot (sem segredos). */
function buildProjectMarkdown() {
  const deps = Object.keys(pkg.dependencies || {}).length;
  const devDeps = Object.keys(pkg.devDependencies || {}).length;
  const engines = pkg.engines || {};
  const engStr =
    typeof engines === 'object' && engines !== null && Object.keys(engines).length
      ? Object.entries(engines)
          .map(([k, v]) => `${k} ≥ ${v}`)
          .join(' · ')
      : '—';

  return (
    '## Dev · projeto (package.json)\n\n' +
    '-# Metadados do pacote em execução — útil para alinhar versões com o CI ou deploy.\n\n' +
    `**Nome** · \`${pkg.name}\`\n` +
    `**Versão** · \`${pkg.version}\`\n` +
    `**Descrição** · ${pkg.description ? String(pkg.description).slice(0, 200) : '—'}\n` +
    `**Dependências** · ${deps} (prod) · ${devDeps} (dev)\n` +
    `**engines** · ${engStr}\n` +
    `**main** · \`${pkg.main || '—'}\``
  );
}

module.exports = {
  buildDiagnosticoMarkdown,
  buildDocsMarkdown,
  buildGuildDebugMarkdown,
  buildSafeConfigMarkdown,
  buildProjectMarkdown,
};

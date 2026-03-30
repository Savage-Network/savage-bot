'use strict';

/**
 * Integração com a Client API do Pterodactyl Panel (energia dos servidores).
 * @see https://pterodactyl.io/project/introduction.html
 * Endpoint típico: POST /api/client/servers/{uuid}/power com body { "signal": "start"|"stop"|"restart" }
 */

const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');
const { fetch: undiciFetch, Agent } = require('undici');
const config = require('./config');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  V2_FLAGS,
  footerTimestampLine,
} = require('./v2Helpers');

const PTERO_LOG_FAIL_ACCENT = 15548997;

const PTERO_JSON = path.join(__dirname, '..', 'ptero.json');

function isDevUser(userId) {
  const id = String(userId).trim();
  return config.canaisDEV().some((e) => e.idDiscord === id);
}

/**
 * Quem pode usar `/dev ptero`: com `pteroRoleId` definido, só membros com esse cargo;
 * caso contrário, o mesmo critério que o resto do `/dev` (`canaisDEV`).
 * @param {import('discord.js').Interaction} interaction
 */
function canUsePteroCommand(interaction) {
  if (!interaction.inGuild()) return false;
  const roleId = config.pteroRoleId();
  if (roleId) {
    const member = interaction.member;
    if (!member || !member.roles) return false;
    return member.roles.cache.has(roleId);
  }
  return isDevUser(interaction.user.id);
}

function loadPteroFile() {
  if (!fs.existsSync(PTERO_JSON)) return null;
  try {
    const raw = fs.readFileSync(PTERO_JSON, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[ptero] Erro ao ler ptero.json:', e.message);
    return null;
  }
}

/**
 * Base do painel sem barra final.
 * `http://` → `https://` por defeito: redirecionamentos 301/302 fazem o fetch seguir com **GET**,
 * e o endpoint POST `/api/client/servers/.../power` devolve 405. Painel só HTTP: `PTERODACTYL_ALLOW_HTTP=1`.
 */
function normalizePanelBaseUrl(raw) {
  let u = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!u) return u;
  if (u.startsWith('http://') && process.env.PTERODACTYL_ALLOW_HTTP !== '1') {
    return `https://${u.slice('http://'.length)}`;
  }
  return u;
}

/** Resolve URL, chave e mapa `servers` (env sobrescreve ficheiro). */
function getResolvedPtero() {
  const file = loadPteroFile() || {};
  const panelUrl = normalizePanelBaseUrl(
    process.env.PTERODACTYL_PANEL_URL || file.panelUrl || ''
  );
  const apiKey = String(
    process.env.PTERODACTYL_API_KEY || file.apiKey || ''
  ).trim();
  const servers =
    file.servers && typeof file.servers === 'object' && !Array.isArray(file.servers)
      ? file.servers
      : {};
  return { panelUrl, apiKey, servers };
}

/** Cliente HTTP com timeouts configuráveis (o `fetch` global usa ~10s connect por defeito). */
let _pteroAgent;
function getPteroAgent() {
  if (!_pteroAgent) {
    const connectMs = Math.max(
      1000,
      Number(process.env.PTERO_CONNECT_TIMEOUT_MS || 30000)
    );
    const bodyMs = Math.max(
      connectMs,
      Number(process.env.PTERO_BODY_TIMEOUT_MS || 60000)
    );
    _pteroAgent = new Agent({
      connectTimeout: connectMs,
      bodyTimeout: bodyMs,
      headersTimeout: bodyMs,
    });
  }
  return _pteroAgent;
}

/**
 * @param {unknown} err
 * @param {string} panelBase
 */
function formatPteroNetworkError(err, panelBase) {
  const cause = err && err.cause;
  const code = cause && cause.code;
  const name = cause && cause.name;

  if (err && err.name === 'AbortError') {
    return (
      `Tempo limite total do pedido ao painel (\`${panelBase}\`). Aumenta \`PTERO_FETCH_TIMEOUT_MS\` ou verifica rede/firewall.`
    );
  }
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || name === 'ConnectTimeoutError') {
    return (
      `Timeout ao **abrir ligação** ao painel (\`${panelBase}\`). ` +
      `O processo do bot não conseguiu ligar a \`:443\` a tempo. ` +
      `Causas comuns: painel só na rede interna; firewall; VPN; IP não permitido; host em baixo. ` +
      `Ajusta \`PTERO_CONNECT_TIMEOUT_MS\` (ms) se a rede for lenta.`
    );
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `DNS: não foi possível resolver o host (\`${panelBase}\`). Verifica \`panelUrl\`.`;
  }
  if (code === 'ECONNREFUSED') {
    return `Ligação recusada em \`${panelBase}\` (serviço em baixo ou porta errada).`;
  }
  const msg = err && err.message ? String(err.message) : String(err);
  if (msg === 'fetch failed' && cause && cause.message) {
    return `${msg} — ${cause.message}`;
  }
  return msg;
}

/**
 * Mensagens claras para respostas JSON do painel (ex.: chave errada).
 * @param {number} status
 * @param {string} body
 */
function formatPteroHttpError(status, body) {
  const raw = String(body || '');
  let detail = '';
  try {
    const j = JSON.parse(raw);
    const first = j?.errors?.[0];
    if (first?.detail) detail = String(first.detail);
  } catch {
    /* ignore */
  }

  if (
    status === 403 &&
    detail.includes('application API key') &&
    detail.includes('client API key')
  ) {
    return (
      '**Chave API errada:** estás a usar uma chave de **Application API** (`ptla_…`). ' +
      'Este comando precisa de uma chave **Client API** (`ptlc_…`). ' +
      'No painel: **Account** (canto superior direito) → **API Credentials** → criar chave **Client** com permissão nos servidores que queres controlar. ' +
      'Não uses a chave de administrador (Application) do painel.'
    );
  }

  const snippet = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  return `HTTP ${status}: ${snippet || status}`;
}

/**
 * @param {string} panelUrl
 * @param {string} apiKey
 * @param {string} serverUuid — identificador do servidor no painel (UUID)
 * @param {'start'|'stop'|'restart'} signal
 */
async function sendPowerSignal(panelUrl, apiKey, serverUuid, signal) {
  const base = normalizePanelBaseUrl(panelUrl);
  const url = `${base}/api/client/servers/${encodeURIComponent(serverUuid)}/power`;
  const totalMs = Math.max(
    5000,
    Number(process.env.PTERO_FETCH_TIMEOUT_MS || 90000)
  );
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), totalMs);
  try {
    let res;
    try {
      res = await undiciFetch(url, {
        method: 'POST',
        redirect: 'manual',
        dispatcher: getPteroAgent(),
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signal }),
      });
    } catch (err) {
      throw new Error(formatPteroNetworkError(err, base));
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      throw new Error(
        `Redirecionamento HTTP ${res.status} — define \`panelUrl\` com o URL final (normalmente **https://** sem redirecionamento).` +
          (loc ? ` Location: ${loc}` : '')
      );
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(formatPteroHttpError(res.status, text));
    }
    return { ok: true };
  } finally {
    clearTimeout(t);
  }
}

/**
 * `GET …/resources` — estado e métricas do processo no painel.
 * @returns {Promise<{ ok: true, attributes: object } | { ok: false, error: string }>}
 */
async function getServerResources(panelUrl, apiKey, serverUuid) {
  const base = normalizePanelBaseUrl(panelUrl);
  const url = `${base}/api/client/servers/${encodeURIComponent(serverUuid)}/resources`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      redirect: 'manual',
      dispatcher: getPteroAgent(),
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, error: `Redirecionamento HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: formatPteroHttpError(res.status, text) };
    }
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Resposta inválida do painel (não é JSON).' };
    }
    return { ok: true, attributes: j.attributes && typeof j.attributes === 'object' ? j.attributes : {} };
  } catch (err) {
    return { ok: false, error: formatPteroNetworkError(err, base) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Estado atual (`attributes.current_state`).
 * @returns {Promise<string|null>}
 */
async function fetchServerCurrentState(panelUrl, apiKey, serverUuid) {
  const r = await getServerResources(panelUrl, apiKey, serverUuid);
  if (!r.ok) return null;
  const s = r.attributes?.current_state;
  return typeof s === 'string' ? s : null;
}

function formatBytes(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const b = Number(n);
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KiB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MiB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
}

function formatUptimeResourceSec(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '—';
  const s = Math.floor(Number(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function pteroDevFooterLine() {
  return footerTimestampLine(footer({ text: 'Dev · Pterodactyl' }).text);
}

async function replyPteroMarkdown(interaction, markdown, { edit = false } = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(config.embedAccentColor())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(String(markdown).slice(0, 3800)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(pteroDevFooterLine()));
  const payload = { flags: V2_FLAGS.ephemeral, components: [container] };
  if (edit) await interaction.editReply(payload);
  else await interaction.reply(payload);
}

async function pingPteroClientApi(panelUrl, apiKey) {
  const base = normalizePanelBaseUrl(panelUrl);
  const url = `${base}/api/client`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      redirect: 'manual',
      dispatcher: getPteroAgent(),
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(
        `Redirecionamento HTTP ${res.status} — verifica \`panelUrl\` (HTTPS direto).`
      );
    }
    const text = await res.text();
    if (!res.ok) {
      throw new Error(formatPteroHttpError(res.status, text));
    }
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error('Resposta inválida do painel.');
    }
    const total = j?.meta?.pagination?.total;
    const n = typeof total === 'number' ? total : Array.isArray(j?.data) ? j.data.length : null;
    return { total: n };
  } finally {
    clearTimeout(t);
  }
}

async function handlePteroListaDev(interaction) {
  if (!canUsePteroCommand(interaction)) {
    const roleId = config.pteroRoleId();
    return interaction.reply({
      content: roleId
        ? `Não tens permissão: precisas do cargo <@&${roleId}>.`
        : 'Não tens permissão: o teu ID não está em `canaisDEV`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { panelUrl, apiKey, servers } = getResolvedPtero();
  if (!panelUrl || !apiKey) {
    return interaction.reply({
      content:
        'Configura **Pterodactyl** em `ptero.json` ou env (`PTERODACTYL_PANEL_URL`, `PTERODACTYL_API_KEY`).',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const entries = Object.entries(servers).filter(([, u]) => u && String(u).trim());
  if (entries.length === 0) {
    return interaction.editReply({
      content: 'Nenhum servidor em `ptero.json → servers`.',
    });
  }

  const rows = await Promise.all(
    entries.map(async ([name, uuidRaw]) => {
      const uuid = String(uuidRaw).trim();
      const r = await getServerResources(panelUrl, apiKey, uuid);
      if (!r.ok) {
        const errShort = String(r.error).slice(0, 120);
        return `· **${name}** · _${errShort}_`;
      }
      const st = r.attributes.current_state || '?';
      const res = r.attributes.resources || {};
      const cpu =
        res.cpu_absolute != null ? `${(Number(res.cpu_absolute) * 100).toFixed(0)}%` : '—';
      const mem = res.memory_bytes != null ? formatBytes(res.memory_bytes) : '—';
      return `· **${name}** · \`${st}\` · CPU ${cpu} · RAM ${mem}`;
    })
  );

  const md =
    '## Pterodactyl · lista\n\n' +
    `-# Painel \`${panelUrl}\` · GET /resources por servidor\n\n` +
    rows.join('\n');

  await replyPteroMarkdown(interaction, md, { edit: true });
}

async function handlePteroInfoDev(interaction) {
  if (!canUsePteroCommand(interaction)) {
    const roleId = config.pteroRoleId();
    return interaction.reply({
      content: roleId
        ? `Não tens permissão: precisas do cargo <@&${roleId}>.`
        : 'Não tens permissão: o teu ID não está em `canaisDEV`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { panelUrl, apiKey, servers } = getResolvedPtero();
  if (!panelUrl || !apiKey) {
    return interaction.reply({
      content:
        'Configura **Pterodactyl** em `ptero.json` ou env (`PTERODACTYL_PANEL_URL`, `PTERODACTYL_API_KEY`).',
      flags: MessageFlags.Ephemeral,
    });
  }

  const nome = interaction.options.getString('servidor', true).trim();
  const uuid = servers[nome];
  if (!uuid || !String(uuid).trim()) {
    return interaction.reply({
      content: `Servidor \`${nome}\` não está em \`ptero.json → servers\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const r = await getServerResources(panelUrl, apiKey, String(uuid).trim());
  if (!r.ok) {
    return interaction.editReply({
      content: `Erro ao ler recursos: ${r.error}`,
    });
  }

  const res = r.attributes.resources || {};
  const st = r.attributes.current_state || '?';
  const cpu =
    res.cpu_absolute != null ? `${(Number(res.cpu_absolute) * 100).toFixed(2)}%` : '—';
  const mem = res.memory_bytes != null ? formatBytes(res.memory_bytes) : '—';
  const disk = res.disk_bytes != null ? formatBytes(res.disk_bytes) : '—';
  const up = formatUptimeResourceSec(res.uptime);
  const rx =
    res.network_rx_bytes != null ? formatBytes(res.network_rx_bytes) : '—';
  const tx =
    res.network_tx_bytes != null ? formatBytes(res.network_tx_bytes) : '—';

  const md =
    '## Pterodactyl · recursos\n\n' +
    `**Servidor** · **${nome}**\n` +
    `**Estado** · \`${st}\`\n` +
    `**CPU** · ${cpu}\n` +
    `**RAM** · ${mem}\n` +
    `**Disco** · ${disk}\n` +
    `**Uptime (processo)** · ${up}\n` +
    `**Rede RX / TX** · ${rx} / ${tx}\n\n` +
    `**Painel** · \`${panelUrl}\``;

  await replyPteroMarkdown(interaction, md, { edit: true });
}

async function handlePteroPingDev(interaction) {
  if (!canUsePteroCommand(interaction)) {
    const roleId = config.pteroRoleId();
    return interaction.reply({
      content: roleId
        ? `Não tens permissão: precisas do cargo <@&${roleId}>.`
        : 'Não tens permissão: o teu ID não está em `canaisDEV`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { panelUrl, apiKey } = getResolvedPtero();
  if (!panelUrl || !apiKey) {
    return interaction.reply({
      content:
        'Configura **Pterodactyl** em `ptero.json` ou env (`PTERODACTYL_PANEL_URL`, `PTERODACTYL_API_KEY`).',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { total } = await pingPteroClientApi(panelUrl, apiKey);
    const md =
      '## Pterodactyl · ligação\n\n' +
      `**Painel** · \`${panelUrl}\`\n` +
      `**Client API** · OK · \`GET /api/client\`\n` +
      (total != null ? `**Servidores visíveis pela chave** · **${total}**\n\n` : '\n') +
      '_A chave Client API (`ptlc_`) está válida e o painel respondeu._';

    await replyPteroMarkdown(interaction, md, { edit: true });
  } catch (err) {
    const msg = err?.message || String(err);
    await interaction.editReply({
      content: `Falha ao contactar o painel: ${msg}`,
    });
  }
}

const ACAO_LABEL = {
  start: 'Ligar',
  stop: 'Desligar',
  restart: 'Reiniciar',
};

/** Rótulos para logs (pedido Discord). */
const ACAO_LOG_HUMANO = {
  start: 'Iniciar',
  stop: 'Encerrar',
  restart: 'Reiniciar',
};

function truncateLog(str, max) {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Envia auditoria de `/dev ptero` para `pteroLogChannelId` (se definido).
 * Mesmo servidor que a interação; ignora se o canal for noutro guild.
 */
async function trySendPteroAuditLog(interaction, { ok, label, nome, acao, panelUrl, err }) {
  const channelId = config.pteroLogChannelId();
  if (!channelId) return;
  if (!interaction.inGuild()) return;

  const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) {
    console.warn('[ptero log] canal inválido ou inacessível:', channelId);
    return;
  }
  if (ch.guildId !== interaction.guildId) {
    console.warn('[ptero log] o canal não pertence a este servidor.');
    return;
  }

  const statusLine = ok
    ? '**Estado** · Pedido enviado ao painel (HTTP OK)'
    : '**Estado** · Falha ao contactar o painel';

  const acaoHum = ACAO_LOG_HUMANO[acao] || label;
  let body =
    '## Pterodactyl · pedido (Discord)\n\n' +
    statusLine +
    '\n\n' +
    `**Ação pedida** · **${acaoHum}** (\`${acao}\`)\n` +
    `**Servidor** · **${nome}**\n` +
    `**Painel** · \`${panelUrl}\`\n` +
    `**Autor** · ${interaction.user} · \`${interaction.user.tag}\`\n`;

  if (!ok && err) {
    body += `\n**Erro**\n\`\`\`\n${truncateLog(err, 900)}\n\`\`\``;
  }

  const container = new ContainerBuilder()
    .setAccentColor(ok ? config.embedAccentColor() : PTERO_LOG_FAIL_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerTimestampLine(footer().text))
    );

  try {
    await ch.send({ flags: V2_FLAGS.public, components: [container] });
  } catch (e) {
    console.error('[ptero log] falha ao enviar:', e);
  }
}

async function handlePteroDev(interaction) {
  if (!canUsePteroCommand(interaction)) {
    const roleId = config.pteroRoleId();
    return interaction.reply({
      content: roleId
        ? `Não tens permissão: precisas do cargo <@&${roleId}> para usar \`/dev ptero\`.`
        : 'Não tens permissão: o teu ID não está em `canaisDEV` no config.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { panelUrl, apiKey, servers } = getResolvedPtero();

  if (!panelUrl || !apiKey) {
    return interaction.reply({
      content:
        'Configura o **Pterodactyl**: cria `ptero.json` na raiz (ou define `PTERODACTYL_PANEL_URL` e `PTERODACTYL_API_KEY` no `.env`). Vê `ptero.example.json`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const acao = interaction.options.getString('acao', true);
  const nome = interaction.options.getString('servidor', true).trim();
  const uuid = servers[nome];

  if (!uuid || !String(uuid).trim()) {
    return interaction.reply({
      content: `Servidor \`${nome}\` não está definido em \`ptero.json → servers\` ou o UUID está vazio.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const serverUuid = String(uuid).trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const label = ACAO_LABEL[acao] || acao;

  try {
    await sendPowerSignal(panelUrl, apiKey, serverUuid, acao);
    await interaction.editReply({
      content:
        `**Pterodactyl** · ${label}\n` +
        `Servidor: **${nome}** · pedido enviado ao painel (\`${panelUrl}\`).\n` +
        '_A ação pode demorar alguns segundos a refletir no servidor._',
    });
    await trySendPteroAuditLog(interaction, {
      ok: true,
      label,
      nome,
      acao,
      panelUrl,
    });
  } catch (err) {
    console.error('[ptero]', err);
    const msg = err?.message || String(err);
    await interaction.editReply({
      content:
        `Falha ao contactar o painel: ${msg}\n` +
        'Confirma URL, chave **Client API** (ptlc_…), UUID do servidor e permissões da chave.',
    });
    await trySendPteroAuditLog(interaction, {
      ok: false,
      label,
      nome,
      acao,
      panelUrl,
      err: msg,
    });
  }
}

async function handlePteroAutocomplete(interaction) {
  if (!canUsePteroCommand(interaction)) {
    return interaction.respond([]);
  }

  const sub = interaction.options.getSubcommand(false);
  if (sub !== 'ptero' && sub !== 'ptero-info') {
    return interaction.respond([]);
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'servidor') {
    return interaction.respond([]);
  }

  const { servers } = getResolvedPtero();
  const keys = Object.keys(servers).filter((k) => k && String(servers[k]).trim());
  const q = String(focused.value).toLowerCase();
  const filtered = keys
    .filter((k) => !q || k.toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));

  await interaction.respond(filtered);
}

module.exports = {
  getResolvedPtero,
  getServerResources,
  normalizePanelBaseUrl,
  sendPowerSignal,
  fetchServerCurrentState,
  trySendPteroAuditLog,
  canUsePteroCommand,
  handlePteroDev,
  handlePteroListaDev,
  handlePteroInfoDev,
  handlePteroPingDev,
  handlePteroAutocomplete,
};

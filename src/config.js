'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadFileConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[config] Não foi possível ler config.json:', e.message);
    return {};
  }
}

const fileConfig = loadFileConfig();

/**
 * Valores de config.json podem ser sobrescritos por variáveis de ambiente (útil no Pterodactyl).
 * IDs do Discord devem ser strings no JSON (evita perda de precisão em números grandes).
 */
function pick(key, envKey, fallback = '') {
  const env = process.env[envKey];
  if (env != null && String(env).trim() !== '') return String(env).trim();
  const v = fileConfig[key];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s !== '' ? s : fallback;
}

function req(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return String(v).trim();
}

function opt(name, fallback = '') {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

module.exports = {
  token: () => req('DISCORD_TOKEN'),
  clientId: () => req('DISCORD_CLIENT_ID'),
  guildId: () => opt('GUILD_ID') || null,
  mcHost: () => opt('MC_HOST', '127.0.0.1'),
  mcPort: () => {
    const p = parseInt(opt('MC_PORT', '25565'), 10);
    return Number.isFinite(p) && p > 0 ? p : 25565;
  },
  mcPresenceIntervalMs: () => {
    const n = parseInt(opt('MC_PRESENCE_INTERVAL_MS', '45000'), 10);
    return Number.isFinite(n) && n >= 15000 ? n : 45000;
  },
  /** Timeout (ms) para ping ao servidor Java em `/status` e na presence. */
  mcStatusTimeoutMs: () => {
    const n = parseInt(opt('MC_STATUS_TIMEOUT_MS', '15000'), 10);
    return Number.isFinite(n) && n >= 3000 ? n : 15000;
  },
  /** Resolução SRV (_minecraft._tcp) para domínios. Se o servidor usar IP direto, podes desativar. */
  mcEnableSRV: () => {
    const v = opt('MC_ENABLE_SRV', '1').toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
  },
  voiceChannelId: () => opt('VOICE_CHANNEL_ID') || null,
  /** Intervalo só para checar se o bot ainda está no canal (não força reconexão). Mín. 5s. */
  voiceReconnectIntervalMs: () => {
    const n = parseInt(opt('VOICE_RECONNECT_INTERVAL_MS', '30000'), 10);
    return Number.isFinite(n) && n >= 5000 ? n : 30000;
  },
  /** Canal de texto onde o painel de tickets deve ser publicado (vazio = qualquer canal). */
  ticketPanelChannelId: () => pick('ticketPanelChannelId', 'TICKET_PANEL_CHANNEL_ID') || null,
  /** Categoria onde são criados os canais de tickets abertos. */
  ticketCategoryId: () => {
    const v = pick('ticketCategoryId', 'TICKET_CATEGORY_ID');
    if (!v) {
      throw new Error(
        'Defina ticketCategoryId em config.json (ou TICKET_CATEGORY_ID no ambiente).'
      );
    }
    return v;
  },
  /** Cargo da staff para tickets (vazio = só Administradores). */
  staffRoleId: () => pick('staffRoleId', 'STAFF_ROLE_ID') || null,
  ticketLogChannelId: () => opt('TICKET_LOG_CHANNEL_ID') || null,
  ticketEmbedColor: () => parseInt(opt('TICKET_EMBED_COLOR', '15158332'), 10) || 15158332,

  /** Canal de texto para logs gerais do servidor (mensagens, auditoria, voz, comandos). */
  discordLogChannelId: () =>
    pick('discordLogChannelId', 'DISCORD_LOG_CHANNEL_ID') || null,
  /** `1` = regista cada mensagem nova (pode gerar muito volume). */
  discordLogMessageCreate: () => {
    const v = opt('DISCORD_LOG_MESSAGE_CREATE', '0').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  },
  /** `1` = reações adicionadas/removidas. */
  discordLogReactions: () => {
    const v = opt('DISCORD_LOG_REACTIONS', '0').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  },
  /** `1` = incluir mensagens/reações de bots nos logs opcionais. */
  discordLogBotMessages: () => {
    const v = opt('DISCORD_LOG_BOT_MESSAGES', '0').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  },
};

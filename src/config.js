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
 * Ambiente sobrescreve config.json (útil no Pterodactyl / Docker).
 * IDs grandes do Discord devem ser strings no JSON.
 */
function pick(key, envKey, fallback = '') {
  const env = process.env[envKey];
  if (env != null && String(env).trim() !== '') return String(env).trim();
  const v = fileConfig[key];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s !== '' ? s : fallback;
}

function pickNum(key, envKey, defaultNum, { min, max } = {}) {
  let n = NaN;
  const env = process.env[envKey];
  if (env != null && String(env).trim() !== '') {
    n = parseInt(String(env).trim(), 10);
  } else if (fileConfig[key] != null && fileConfig[key] !== '') {
    const v = fileConfig[key];
    n = typeof v === 'number' ? v : parseInt(String(v), 10);
  }
  if (!Number.isFinite(n)) n = defaultNum;
  if (min != null && n < min) n = min;
  if (max != null && n > max) n = max;
  return n;
}

function pickBool(key, envKey, defaultBool = false) {
  const env = process.env[envKey];
  if (env != null && String(env).trim() !== '') {
    const v = String(env).toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }
  const v = fileConfig[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  return defaultBool;
}

function req(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(
      `Token ausente: defina ${name} no .env (não coloque o token no config.json).`
    );
  }
  return String(v).trim();
}

function parseCanaisDEV() {
  const raw = fileConfig.canaisDEV;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      idDiscord: e?.idDiscord != null ? String(e.idDiscord).trim() : '',
      idCanal: e?.idCanal != null ? String(e.idCanal).trim() : '',
    }))
    .filter((e) => e.idDiscord && e.idCanal);
}

/**
 * Lê `config.json` → objeto `ticket` (recomendado) ou chaves antigas na raiz.
 * @param {string} nestedKey — ex.: panelChannelId
 * @param {string} [legacyFlatKey] — ex.: ticketPanelChannelId
 */
function readTicketField(nestedKey, legacyFlatKey) {
  const t = fileConfig.ticket;
  if (t && typeof t === 'object' && Object.prototype.hasOwnProperty.call(t, nestedKey)) {
    const v = t[nestedKey];
    if (v !== undefined && v !== null) {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v;
      return v;
    }
  }
  if (legacyFlatKey && fileConfig[legacyFlatKey] !== undefined && fileConfig[legacyFlatKey] !== null) {
    return fileConfig[legacyFlatKey];
  }
  return undefined;
}

module.exports = {
  /** Só via .env — nunca commite o token no repositório. */
  token: () => req('DISCORD_TOKEN'),

  clientId: () => {
    const v = pick('clientId', 'DISCORD_CLIENT_ID');
    if (!v) {
      throw new Error(
        'Defina clientId em config.json ou DISCORD_CLIENT_ID no ambiente.'
      );
    }
    return v;
  },

  guildId: () => pick('guildId', 'GUILD_ID') || null,

  mcHost: () => pick('mcHost', 'MC_HOST', '127.0.0.1'),

  mcPort: () => pickNum('mcPort', 'MC_PORT', 25565, { min: 1, max: 65535 }),

  mcPresenceIntervalMs: () =>
    pickNum('mcPresenceIntervalMs', 'MC_PRESENCE_INTERVAL_MS', 45000, {
      min: 15000,
    }),

  mcStatusTimeoutMs: () =>
    pickNum('mcStatusTimeoutMs', 'MC_STATUS_TIMEOUT_MS', 15000, { min: 3000 }),

  mcEnableSRV: () => {
    if (process.env.MC_ENABLE_SRV != null && String(process.env.MC_ENABLE_SRV).trim() !== '') {
      const v = String(process.env.MC_ENABLE_SRV).toLowerCase();
      return v !== '0' && v !== 'false' && v !== 'no';
    }
    if (typeof fileConfig.mcEnableSRV === 'boolean') return fileConfig.mcEnableSRV;
    if (fileConfig.mcEnableSRV == null) return true;
    const v = String(fileConfig.mcEnableSRV).toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
  },

  voiceChannelId: () => pick('voiceChannelId', 'VOICE_CHANNEL_ID') || null,

  /** Mantém o bot num canal de voz fixo. `false` desativa (não liga à call). */
  voiceEnabled: () => pickBool('voiceEnabled', 'VOICE_ENABLED', true),

  voiceReconnectIntervalMs: () =>
    pickNum('voiceReconnectIntervalMs', 'VOICE_RECONNECT_INTERVAL_MS', 30000, {
      min: 5000,
    }),

  ticketPanelChannelId: () => {
    const env = process.env.TICKET_PANEL_CHANNEL_ID;
    if (env != null && String(env).trim() !== '') return String(env).trim();
    const v = readTicketField('panelChannelId', 'ticketPanelChannelId');
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s !== '' ? s : null;
  },

  ticketCategoryId: () => {
    const env = process.env.TICKET_CATEGORY_ID;
    if (env != null && String(env).trim() !== '') return String(env).trim();
    const v = readTicketField('categoryId', 'ticketCategoryId');
    const s = v != null ? String(v).trim() : '';
    if (!s) {
      throw new Error(
        'Defina ticket.categoryId em config.json (ou ticketCategoryId na raiz) ou TICKET_CATEGORY_ID no ambiente.'
      );
    }
    return s;
  },

  staffRoleId: () => {
    const env = process.env.STAFF_ROLE_ID;
    if (env != null && String(env).trim() !== '') return String(env).trim();
    const v = readTicketField('staffRoleId', 'staffRoleId');
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s !== '' ? s : null;
  },

  ticketLogChannelId: () => {
    const env = process.env.TICKET_LOG_CHANNEL_ID;
    if (env != null && String(env).trim() !== '') return String(env).trim();
    const v = readTicketField('logChannelId', 'ticketLogChannelId');
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s !== '' ? s : null;
  },

  ticketEmbedColor: () => {
    let n = NaN;
    const env = process.env.TICKET_EMBED_COLOR;
    if (env != null && String(env).trim() !== '') {
      n = parseInt(String(env).trim(), 10);
    } else {
      const v = readTicketField('embedColor', 'ticketEmbedColor');
      if (v !== undefined && v !== null && v !== '') {
        n = typeof v === 'number' ? v : parseInt(String(v), 10);
      }
    }
    if (!Number.isFinite(n)) n = 15158332;
    if (n < 0) n = 0;
    if (n > 0xffffff) n = 0xffffff;
    return n;
  },

  /** URL da imagem grande (banner) do painel de tickets — vazio omite a imagem. */
  ticketPanelBannerUrl: () => {
    const env = process.env.TICKET_PANEL_BANNER_URL;
    if (env != null && String(env).trim() !== '') return String(env).trim();
    const v = readTicketField('panelBannerUrl', 'ticketPanelBannerUrl');
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s !== '' ? s : null;
  },

  /** Texto do rodapé do embed do painel (ex.: domínio). */
  ticketPanelFooterText: () => {
    const env = process.env.TICKET_PANEL_FOOTER_TEXT;
    if (env != null && String(env).trim() !== '') return String(env).trim();
    const v = readTicketField('panelFooterText', 'ticketPanelFooterText');
    if (v === undefined || v === null) return 'SavageMC';
    const s = String(v).trim();
    return s !== '' ? s : 'SavageMC';
  },

  discordLogChannelId: () =>
    pick('discordLogChannelId', 'DISCORD_LOG_CHANNEL_ID') || null,

  discordLogMessageCreate: () =>
    pickBool('discordLogMessageCreate', 'DISCORD_LOG_MESSAGE_CREATE', false),

  discordLogReactions: () =>
    pickBool('discordLogReactions', 'DISCORD_LOG_REACTIONS', false),

  discordLogBotMessages: () =>
    pickBool('discordLogBotMessages', 'DISCORD_LOG_BOT_MESSAGES', false),

  /** Cargo atribuído automaticamente a novos membros (vazio = desativado). */
  autoroleRoleId: () => pick('autoroleRoleId', 'AUTOROLE_ROLE_ID') || null,

  /**
   * Respostas automáticas por palavra/frase (estilo Loritta).
   * Cada item: `{ "trigger", "response", "wholeWord"?, "caseSensitive"? }`
   */
  autoResponses: () => {
    if (process.env.AUTO_RESPONSES_JSON != null && String(process.env.AUTO_RESPONSES_JSON).trim() !== '') {
      try {
        const parsed = JSON.parse(process.env.AUTO_RESPONSES_JSON);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    const raw = fileConfig.autoResponses;
    return Array.isArray(raw) ? raw : [];
  },

  /**
   * Lista de devs: `{ "idDiscord", "idCanal" }` — canal de texto para `/dev anotar`.
   */
  canaisDEV: () => parseCanaisDEV(),

  /** Canal de texto de anotações para este utilizador (canaisDEV), ou null. */
  devNoteChannelIdForUser: (userId) => {
    const id = String(userId).trim();
    for (const e of parseCanaisDEV()) {
      if (e.idDiscord === id) return e.idCanal;
    }
    return null;
  },

  /** Canal de voz para `/dev voice` (independente de voiceEnabled). */
  devVoiceChannelId: () => pick('devVoiceChannelId', 'DEV_VOICE_CHANNEL_ID') || null,

  /** Canal de texto para registos `/dev commit`. */
  devCommitChannelId: () =>
    pick('devCommitChannelId', 'DEV_COMMIT_CHANNEL_ID') || null,

  /**
   * Base da API Savage (sem barra final), ex.: jogadores → UUID para thumbnail do `/stats`.
   */
  savageApiBaseUrl: () => {
    const v = pick(
      'savageApiBaseUrl',
      'SAVAGE_API_BASE_URL',
      'https://savage-api-one.vercel.app'
    );
    return String(v).trim().replace(/\/$/, '');
  },

  /**
   * Base do site SavageMC STATS (sem barra final).
   * @see https://stats.savagemc.net/
   */
  statsSiteUrl: () => {
    const env = process.env.STATS_SITE_URL;
    if (env != null && String(env).trim() !== '') {
      return String(env).trim().replace(/\/$/, '');
    }
    const v = pick('statsSiteUrl', 'STATS_SITE_URL');
    const raw =
      v && String(v).trim() ? String(v).trim() : 'https://stats.savagemc.net';
    return raw.replace(/\/$/, '');
  },

  /** URL da página de perfil (`perfil.html?jogador=`). */
  statsProfileUrlForNick: (nick) => {
    const base = module.exports.statsSiteUrl();
    return `${base}/perfil.html?jogador=${encodeURIComponent(String(nick).trim())}`;
  },
};

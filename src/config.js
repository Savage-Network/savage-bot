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

  ticketPanelChannelId: () =>
    pick('ticketPanelChannelId', 'TICKET_PANEL_CHANNEL_ID') || null,

  ticketCategoryId: () => {
    const v = pick('ticketCategoryId', 'TICKET_CATEGORY_ID');
    if (!v) {
      throw new Error(
        'Defina ticketCategoryId em config.json ou TICKET_CATEGORY_ID no ambiente.'
      );
    }
    return v;
  },

  staffRoleId: () => pick('staffRoleId', 'STAFF_ROLE_ID') || null,

  ticketLogChannelId: () =>
    pick('ticketLogChannelId', 'TICKET_LOG_CHANNEL_ID') || null,

  ticketEmbedColor: () =>
    pickNum('ticketEmbedColor', 'TICKET_EMBED_COLOR', 15158332, {
      min: 0,
      max: 0xffffff,
    }),

  discordLogChannelId: () =>
    pick('discordLogChannelId', 'DISCORD_LOG_CHANNEL_ID') || null,

  discordLogMessageCreate: () =>
    pickBool('discordLogMessageCreate', 'DISCORD_LOG_MESSAGE_CREATE', false),

  discordLogReactions: () =>
    pickBool('discordLogReactions', 'DISCORD_LOG_REACTIONS', false),

  discordLogBotMessages: () =>
    pickBool('discordLogBotMessages', 'DISCORD_LOG_BOT_MESSAGES', false),
};

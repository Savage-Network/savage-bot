'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');
const { footer } = require('./embedCopyright');

/** Avatar 100px — https://mc-heads.net/ */
const MC_HEADS_AVATAR_SIZE = 100;

/** Normaliza para UUID com hífenes (32 hex). */
function normalizeMinecraftUuid(raw) {
  if (raw == null) return null;
  const hex = String(raw)
    .trim()
    .replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function extractUuidFromPlayerPayload(data) {
  if (!data || typeof data !== 'object' || data.erro) return null;
  const tryVal = (v) => normalizeMinecraftUuid(v);
  const candidates = [
    tryVal(data.uuid),
    tryVal(data.UUID),
    tryVal(data.id),
    data.jogador && tryVal(data.jogador.uuid),
    data.data && tryVal(data.data.uuid),
    data.player && tryVal(data.player.uuid),
  ];
  return candidates.find(Boolean) || null;
}

async function fetchPlayerUuidForNick(nick) {
  const base = config.savageApiBaseUrl();
  const segment = encodeURIComponent(String(nick).trim());
  const url = `${base}/api/v1/jogadores/${segment}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    let json;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    if (!res.ok) return null;
    return extractUuidFromPlayerPayload(json);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function handleStats(interaction) {
  const nick = interaction.options.getString('nick');
  const base = config.statsSiteUrl();
  const home = `${base}/`;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · STATS')
    .setFooter(footer());

  if (nick && String(nick).trim()) {
    const trimmed = String(nick).trim();
    const profileUrl = config.statsProfileUrlForNick(trimmed);
    embed.setDescription(
      `Perfil de **${trimmed}** no site de estatísticas.\n\n` +
        `[Abrir perfil](${profileUrl})`
    );
    embed.addFields({
      name: 'STATS geral',
      value: `[stats.savagemc.net](${home})`,
    });
    const uuid = await fetchPlayerUuidForNick(trimmed);
    if (uuid) {
      embed.setThumbnail(
        `https://mc-heads.net/avatar/${uuid}/100`
      );
    }
  } else {
    embed.setDescription(
      'Consulta pública de jogadores, leaderboard e perfis no **SavageMC STATS**.'
    );
    embed.addFields(
      {
        name: 'Início / busca',
        value: `[stats.savagemc.net](${home})`,
      },
      {
        name: 'Perfil por nick',
        value:
          'Usa `/stats nick:` com o **nick no Minecraft** para receber o link direto do perfil.',
      }
    );
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleStats };

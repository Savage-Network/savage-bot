'use strict';

const { MessageFlags } = require('discord.js');
const config = require('./config');
const { discordColorFromTag } = require('./mcTagColors');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  V2_FLAGS,
  footerTimestampLine,
} = require('./v2Helpers');

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

async function fetchPlayerForNick(nick) {
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
    if (!res.ok || !json || typeof json !== 'object' || json.erro) {
      return null;
    }
    const uuid = extractUuidFromPlayerPayload(json);
    const rawTag = json.tag != null ? String(json.tag).trim() : '';
    const rawRank = json.rank != null ? String(json.rank).trim() : '';
    const tag = rawTag || rawRank || null;
    return { uuid, tag };
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

  const defaultAccent = config.ticketEmbedColor();
  const foot = footerTimestampLine(footer().text);

  if (nick && String(nick).trim()) {
    const trimmed = String(nick).trim();
    const profileUrl = config.statsProfileUrlForNick(trimmed);
    const player = await fetchPlayerForNick(trimmed);
    let accent = defaultAccent;
    if (player?.tag) {
      const c = discordColorFromTag(player.tag);
      if (c != null) accent = c;
    }

    const mainText =
      `## SavageMC · STATS\n\n` +
      `Perfil de **${trimmed}** no site de estatísticas.\n\n` +
      `[Abrir perfil](${profileUrl})\n\n` +
      `**STATS geral**\n` +
      `[stats.savagemc.net](${home})`;

    let container;
    if (player?.uuid) {
      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(mainText)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`https://mc-heads.net/avatar/${player.uuid}/100`)
            .setDescription(`Skin · ${trimmed}`)
        );
      container = new ContainerBuilder()
        .setAccentColor(accent)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    } else {
      container = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(mainText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    }

    await interaction.editReply({
      flags: V2_FLAGS.ephemeral,
      components: [container],
    });
    return;
  }

  const noNickText =
    `## SavageMC · STATS\n\n` +
    'Consulta pública de jogadores, leaderboard e perfis no **SavageMC STATS**.\n\n' +
    `**Início / busca**\n` +
    `[stats.savagemc.net](${home})\n\n` +
    '**Perfil por nick**\n' +
    'Usa `/stats nick:` com o **nick no Minecraft** para receber o link direto do perfil.';

  const container = new ContainerBuilder()
    .setAccentColor(defaultAccent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(noNickText))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));

  await interaction.editReply({
    flags: V2_FLAGS.ephemeral,
    components: [container],
  });
}

module.exports = { handleStats };

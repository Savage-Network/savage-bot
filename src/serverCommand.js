'use strict';

const { MessageFlags } = require('discord.js');
const config = require('./config');
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

async function handleServidor(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: 'Este comando só funciona em um servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();
  const g = interaction.guild;

  const owner = await g.fetchOwner().catch(() => null);
  const iconUrl = g.iconURL({ size: 256, extension: 'png' });

  let lines =
    `## ${g.name}\n\n` +
    `**Membros** · ${g.memberCount}\n` +
    `**Boost** · Nível ${g.premiumTier} · ${g.premiumSubscriptionCount} boosts\n` +
    `**Canais** · ${g.channels.cache.size}\n` +
    `**Criado** · <t:${Math.floor(g.createdTimestamp / 1000)}:R>\n`;

  if (owner) {
    lines += `**Dono** · ${owner.user.tag}\n`;
  }
  if (g.description) {
    lines += `\n${g.description.slice(0, 2000)}\n`;
  }

  const foot = footerTimestampLine(footer().text);
  let container;

  if (iconUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(iconUrl).setDescription(g.name)
      );
    container = new ContainerBuilder()
      .setAccentColor(config.embedAccentColor())
      .addSectionComponents(section)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
  } else {
    container = new ContainerBuilder()
      .setAccentColor(config.embedAccentColor())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
  }

  await interaction.editReply({
    flags: V2_FLAGS.public,
    components: [container],
  });
}

module.exports = { handleServidor };

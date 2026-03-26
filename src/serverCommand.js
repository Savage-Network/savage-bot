'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');
const { footer } = require('./embedCopyright');

async function handleServidor(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: 'Este comando só funciona em um servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();
  const g = interaction.guild;
  await g.members.fetch({ withPresences: false }).catch(() => {});

  const owner = await g.fetchOwner().catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle(g.name)
    .setThumbnail(g.iconURL({ size: 256, extension: 'png' }))
    .addFields(
      {
        name: 'Membros',
        value: `${g.memberCount}`,
        inline: true,
      },
      {
        name: 'Boost',
        value: `Nível ${g.premiumTier} · ${g.premiumSubscriptionCount} boosts`,
        inline: true,
      },
      {
        name: 'Canais',
        value: `${g.channels.cache.size}`,
        inline: true,
      },
      {
        name: 'Criado',
        value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`,
        inline: true,
      }
    )
    .setFooter(footer())
    .setTimestamp();

  if (owner) {
    embed.addFields({
      name: 'Dono',
      value: `${owner.user.tag}`,
      inline: true,
    });
  }

  if (g.description) {
    embed.setDescription(g.description.slice(0, 4096));
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleServidor };

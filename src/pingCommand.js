'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');

async function handlePing(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const apiMs = Date.now() - t0;
  const ws = interaction.client.ws.ping;

  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · latência')
    .addFields(
      { name: 'Discord API', value: `~${apiMs} ms`, inline: true },
      { name: 'Gateway (WebSocket)', value: `${ws >= 0 ? ws : '—'} ms`, inline: true }
    )
    .setFooter({ text: 'Valores aproximados' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { handlePing };

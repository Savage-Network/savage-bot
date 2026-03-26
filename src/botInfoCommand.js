'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');

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

async function handleBotInfo(interaction, startedAtMs) {
  const uptime = formatUptime(Date.now() - startedAtMs);
  const mem = process.memoryUsage();
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
  const guild = interaction.guild;

  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · bot')
    .setDescription(`**${pkg.name}** v${pkg.version}`)
    .addFields(
      { name: 'Uptime', value: uptime, inline: true },
      { name: 'Memória (RSS)', value: `${rssMb} MB`, inline: true },
      {
        name: 'Gateway',
        value: `${interaction.client.ws.ping >= 0 ? interaction.client.ws.ping : '—'} ms`,
        inline: true,
      },
      {
        name: 'Servidor',
        value: guild
          ? `${guild.name} · ${guild.memberCount} membros`
          : '_DM / sem guild_',
      }
    )
    .setFooter({ text: 'Node.js ' + process.version })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleBotInfo };

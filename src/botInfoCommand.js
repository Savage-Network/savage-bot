'use strict';

const { MessageFlags } = require('discord.js');
const config = require('./config');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  V2_FLAGS,
  footerTimestampLine,
} = require('./v2Helpers');

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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const uptime = formatUptime(Date.now() - startedAtMs);
  const mem = process.memoryUsage();
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
  const guild = interaction.guild;

  const text =
    '## SavageMC · bot\n\n' +
    `**${pkg.name}** v${pkg.version}\n\n` +
    `**Uptime** · ${uptime}\n` +
    `**Memória (RSS)** · ${rssMb} MB\n` +
    `**Gateway** · ${interaction.client.ws.ping >= 0 ? interaction.client.ws.ping : '—'} ms\n\n` +
    `**Servidor** · ${
      guild
        ? `${guild.name} · ${guild.memberCount} membros`
        : '_DM / sem servidor_'
    }\n\n` +
    '**Créditos** · desenhar · henqks · zrwfa';

  const container = new ContainerBuilder()
    .setAccentColor(config.ticketEmbedColor())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        footerTimestampLine(footer({ text: 'Node.js ' + process.version }).text)
      )
    );

  await interaction.editReply({
    flags: V2_FLAGS.ephemeral,
    components: [container],
  });
}

module.exports = { handleBotInfo };

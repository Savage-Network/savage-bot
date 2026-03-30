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

async function handlePing(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const apiMs = Date.now() - t0;
  const ws = interaction.client.ws.ping;

  const text =
    '## SavageMC · latência\n\n' +
    `**Discord API** · ~${apiMs} ms\n` +
    `**Gateway (WebSocket)** · ${ws >= 0 ? ws : '—'} ms`;

  const container = new ContainerBuilder()
    .setAccentColor(config.embedAccentColor())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        footerTimestampLine(`${footer({ text: 'Valores aproximados' }).text}`)
      )
    );

  await interaction.editReply({
    flags: V2_FLAGS.ephemeral,
    components: [container],
  });
}

module.exports = { handlePing };

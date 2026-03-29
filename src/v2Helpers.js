'use strict';

/**
 * Components V2 — {@link https://discord.com/developers/docs/components/reference}
 * Requer {@link MessageFlags.IsComponentsV2} em reply/editReply/send.
 */

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');

const V2_FLAGS = Object.freeze({
  ephemeral: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  public: MessageFlags.IsComponentsV2,
});

/** Texto de rodapé com horário Discord (substitui embed.setTimestamp). */
function footerTimestampLine(footerText) {
  const t = Math.floor(Date.now() / 1000);
  return `_${footerText} · <t:${t}:F>_`;
}

module.exports = {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  V2_FLAGS,
  footerTimestampLine,
};

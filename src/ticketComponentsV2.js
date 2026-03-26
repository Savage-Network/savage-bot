'use strict';

/**
 * Components V2 — ver {@link https://discord.builders/ discord.builders}
 * Requer {@link MessageFlags.IsComponentsV2}.
 */

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require('@discordjs/builders');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

/** Ícone neutro quando o servidor não tem imagem */
const FALLBACK_GUILD_ICON =
  'https://cdn.discordapp.com/embed/avatars/2.png';

/**
 * @param {object} opts
 * @param {string} opts.selectCustomId
 * @param {number} opts.accentColor decimal
 * @param {string} [opts.guildName]
 * @param {string | null} [opts.guildIconUrl]
 */
function buildTicketPanel({ selectCustomId, accentColor, guildName, guildIconUrl }) {
  const name = guildName && String(guildName).trim() ? String(guildName).trim() : 'SavageMC';
  const thumbUrl = guildIconUrl && String(guildIconUrl).trim() ? String(guildIconUrl).trim() : FALLBACK_GUILD_ICON;

  const select = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId)
    .setPlaceholder('Escolha o tipo de ticket')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Loja')
        .setValue('loja')
        .setDescription('Compras, itens, economia')
        .setEmoji('🛒'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Bugs')
        .setValue('bugs')
        .setDescription('Erros ou comportamento estranho no servidor')
        .setEmoji('🐛'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Denúncia')
        .setValue('denuncia')
        .setDescription('Reportar outro jogador')
        .setEmoji('⚠️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Suporte')
        .setValue('suporte')
        .setDescription('Dúvidas gerais e ajuda')
        .setEmoji('💬')
    );

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${name}\n**Central de suporte**`
      ),
      new TextDisplayBuilder().setContent(
        'Escolha abaixo o **tipo de ticket**. Será pedido o seu **nick no Minecraft**.\n\n' +
          'Em **Denúncia** também pedimos o nick de **quem você está denunciando**.\n\n' +
          '- Canal privado só para você e a staff\n' +
          '- Resposta o mais rápido possível'
      )
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(thumbUrl)
        .setDescription(`${name} · ícone do servidor`)
    );

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string | null} [opts.staffRoleId]
 * @param {string} opts.assumeCustomId
 * @param {string} opts.closeCustomId
 * @param {number} opts.accentColor
 * @param {string} opts.ticketTypeLabel ex.: "Loja"
 * @param {string} opts.ticketId identificador único do ticket (canal)
 * @param {string} opts.minecraftNick
 * @param {string | null} [opts.reportedNick] só em denúncias
 * @param {string | null} [opts.claimedById] staff que assumiu o ticket
 */
function buildTicketWelcome({
  userId,
  staffRoleId,
  assumeCustomId,
  closeCustomId,
  accentColor,
  ticketTypeLabel,
  ticketId,
  minecraftNick,
  reportedNick,
  claimedById,
}) {
  const mentionLine =
    staffRoleId && String(staffRoleId).length > 0
      ? `Olá <@${userId}> · <@&${staffRoleId}>`
      : `Olá <@${userId}>`;

  let info =
    `**ID do ticket:** \`${ticketId}\`\n` +
    `**Tipo:** ${ticketTypeLabel}\n**Nick no Minecraft:** \`${minecraftNick}\``;
  if (reportedNick != null && String(reportedNick).trim() !== '') {
    info += `\n**Denunciado (nick):** \`${reportedNick}\``;
  }
  info += `\n**Assumido por:** ${
    claimedById && String(claimedById).length > 0
      ? `<@${claimedById}>`
      : '*Ninguém ainda*'
  }`;

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Ticket SavageMC')
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${mentionLine}\n\n${info}\n\n` +
          'Explique seu caso com o máximo de detalhes.\n' +
          '**Staff:** use **Assumir ticket** para marcar que está atendendo; **Fechar ticket** quando estiver resolvido.\n\n' +
          '*SavageMC · sistema de suporte · © SavageMC*'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(assumeCustomId)
          .setLabel('Assumir ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji({ name: '✋' }),
        new ButtonBuilder()
          .setCustomId(closeCustomId)
          .setLabel('Fechar ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji({ name: '🔒' })
      )
    );
}

module.exports = {
  buildTicketPanel,
  buildTicketWelcome,
};

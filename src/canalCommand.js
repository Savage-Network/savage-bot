'use strict';

const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const MAX_LIMPAR = 1000;

async function bulkDeleteMessages(channel, requested) {
  const target = Math.min(Math.max(1, requested), MAX_LIMPAR);
  let total = 0;
  let remaining = target;

  while (remaining > 0) {
    const batch = Math.min(remaining, 100);
    const deleted = await channel.bulkDelete(batch, true);
    const n = deleted?.size ?? 0;
    total += n;
    if (n === 0) break;
    remaining -= n;
    if (n < batch) break;
  }

  return total;
}

async function handleCanal(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Use este comando só em um servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = interaction.channel;
  if (!channel.isTextBased()) {
    return interaction.reply({
      content: 'Só funciona em canais de texto.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const sub = interaction.options.getSubcommand();
  const me = interaction.guild.members.me;

  if (sub === 'limpar') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'Precisas da permissão **Gerir mensagens** para usar este comando.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content:
          'O bot precisa da permissão **Gerir mensagens** neste canal para apagar mensagens.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const qtd = interaction.options.getInteger('qtdmsgs', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const apagadas = await bulkDeleteMessages(channel, qtd);
      await interaction.editReply({
        content:
          apagadas === 0
            ? 'Não foi possível apagar mensagens (pode não haver mensagens recentes ou são demasiado antigas — o Discord só permite apagar em massa mensagens com menos de 14 dias).'
            : `**${apagadas}** mensagem(ns) apagada(s). (Pedido: até ${Math.min(qtd, MAX_LIMPAR)}; mensagens com mais de 14 dias são ignoradas pelo Discord.)`,
      });
    } catch (err) {
      console.error('[canal limpar]', err);
      await interaction.editReply({
        content: 'Não foi possível apagar as mensagens. Verifica as permissões do bot e do canal.',
      });
    }
    return;
  }

  if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content:
        'O bot precisa da permissão **Gerir canais** neste canal para bloquear/desbloquear.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: 'Precisas da permissão **Gerir canais** para bloquear ou desbloquear o canal.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const everyone = interaction.guild.roles.everyone;

  try {
    if (sub === 'bloquear') {
      await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      await interaction.reply({
        content:
          'Canal **bloqueado**: @everyone não pode enviar mensagens aqui.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      await interaction.reply({
        content:
          'Canal **desbloqueado**: as permissões de envio de @everyone voltaram ao padrão.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    console.error('[canal]', err);
    const msg = 'Não foi possível alterar as permissões deste canal.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { handleCanal };

'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { VoiceConnectionStatus } = require('@discordjs/voice');
const config = require('./config');
const { joinVoiceChannelById } = require('./voiceStay');
const { footer } = require('./embedCopyright');

function isDevUser(userId) {
  const id = String(userId).trim();
  return config.canaisDEV().some((e) => e.idDiscord === id);
}

async function handleDev(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Usa este comando só no servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!isDevUser(interaction.user.id)) {
    return interaction.reply({
      content:
        'Não tens permissão: o teu ID de utilizador não está em `canaisDEV` no config.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'voice') {
    const vid = config.devVoiceChannelId() || config.voiceChannelId();
    if (!vid) {
      return interaction.reply({
        content:
          'Define `devVoiceChannelId` no config.json (ou `voiceChannelId` / `VOICE_CHANNEL_ID` como fallback).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const vch = await interaction.client.channels.fetch(vid).catch(() => null);
    if (!vch || !vch.isVoiceBased()) {
      return interaction.reply({
        content: 'Canal de voz inválido ou inacessível.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (vch.guildId !== interaction.guildId) {
      return interaction.reply({
        content: 'O canal de voz não pertence a este servidor.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const conn = await joinVoiceChannelById(interaction.client, vid, {
      reconnectOnError: false,
    });

    const ok = conn && conn.state.status === VoiceConnectionStatus.Ready;

    if (ok) {
      await interaction.editReply({
        content: `Bot ligado à call de desenvolvimento: <#${vch.id}>.`,
      });
    } else {
      await interaction.editReply({
        content:
          'Não foi possível entrar na call. Verifica permissões do bot (Ligar, Falar) e se o canal é de voz.',
      });
    }
    return;
  }

  if (sub === 'anotar') {
    const noteChannelId = config.devNoteChannelIdForUser(interaction.user.id);
    if (!noteChannelId) {
      return interaction.reply({
        content:
          'Não há `idCanal` mapeado para o teu utilizador em `canaisDEV`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const texto = interaction.options.getString('anotacao', true).trim();
    if (!texto) {
      return interaction.reply({
        content: 'Escreve uma anotação.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ch = await interaction.client.channels.fetch(noteChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      return interaction.editReply({
        content: 'Canal de anotações inválido ou inacessível.',
      });
    }
    if (ch.guildId !== interaction.guildId) {
      return interaction.editReply({
        content: 'O canal de anotações não pertence a este servidor.',
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.ticketEmbedColor())
      .setTitle('Anotação (dev)')
      .setDescription(texto.slice(0, 4096))
      .addFields({
        name: 'Autor',
        value: `${interaction.user} · ${interaction.user.tag}`,
      })
      .setFooter(footer())
      .setTimestamp();

    try {
      await ch.send({ embeds: [embed] });
    } catch (err) {
      console.error('[dev anotar]', err);
      return interaction.editReply({
        content: 'Não foi possível enviar no canal. Verifica permissões do bot.',
      });
    }

    await interaction.editReply({
      content: `Anotação enviada em <#${ch.id}>.`,
    });
  }
}

module.exports = { handleDev };

'use strict';

const {
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { VoiceConnectionStatus } = require('@discordjs/voice');
const config = require('./config');
const { joinVoiceChannelById } = require('./voiceStay');
const { footer } = require('./embedCopyright');

const DEV_COMMIT_MODAL_ID = 'dev_commit_modal';
const DEV_COMMIT_FIELD_SISTEMA = 'dev_commit_sistema';
const DEV_COMMIT_FIELD_ATUAL = 'dev_commit_atualizacoes';

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

  if (sub === 'commit') {
    const modal = new ModalBuilder()
      .setCustomId(DEV_COMMIT_MODAL_ID)
      .setTitle('Commit — SavageMC');

    const sistemaInput = new TextInputBuilder()
      .setCustomId(DEV_COMMIT_FIELD_SISTEMA)
      .setLabel('Sistema')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)
      .setPlaceholder('Área ou sistema (ex.: tickets, bot, site)');

    const atualInput = new TextInputBuilder()
      .setCustomId(DEV_COMMIT_FIELD_ATUAL)
      .setLabel('Atualizações')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)
      .setPlaceholder('O que foi feito ou alterado?');

    modal.addComponents(
      new ActionRowBuilder().addComponents(sistemaInput),
      new ActionRowBuilder().addComponents(atualInput)
    );

    return interaction.showModal(modal);
  }

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

function truncateEmbedField(s, max = 1024) {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

/** Campo embed com conteúdo em bloco de código: \`\`\`\n…\n\`\`\` */
function atualizacoesAsCodeBlock(text) {
  const maxTotal = 1024;
  const fence = '```';
  const overhead = fence.length + 1 + 1 + fence.length;
  let inner = String(text ?? '').trim().replace(/```/g, '`\u200b``');
  const maxInner = maxTotal - overhead;
  if (inner.length > maxInner) inner = inner.slice(0, maxInner - 1) + '…';
  return `${fence}\n${inner}\n${fence}`;
}

async function handleDevCommitModal(interaction) {
  if (interaction.customId !== DEV_COMMIT_MODAL_ID) return;

  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Usa este comando só no servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!isDevUser(interaction.user.id)) {
    return interaction.reply({
      content:
        'Não tens permissão: o teu ID não está em `canaisDEV` no config.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channelId = config.devCommitChannelId();
  if (!channelId) {
    return interaction.reply({
      content:
        'Define `devCommitChannelId` em config.json (ou `DEV_COMMIT_CHANNEL_ID` no ambiente).',
      flags: MessageFlags.Ephemeral,
    });
  }

  const sistema = interaction.fields.getTextInputValue(DEV_COMMIT_FIELD_SISTEMA).trim();
  const atual = interaction.fields.getTextInputValue(DEV_COMMIT_FIELD_ATUAL).trim();
  if (!sistema || !atual) {
    return interaction.reply({
      content: 'Preenche **Sistema** e **Atualizações**.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) {
    return interaction.reply({
      content: 'Canal de commit inválido ou inacessível.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (ch.guildId !== interaction.guildId) {
    return interaction.reply({
      content: 'O canal de commit não pertence a este servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('Commit')
    .addFields(
      { name: 'Sistema', value: truncateEmbedField(sistema) },
      { name: 'Atualizações', value: atualizacoesAsCodeBlock(atual) },
      {
        name: 'Autor',
        value: `${interaction.user} · ${interaction.user.tag}`,
      }
    )
    .setFooter(footer())
    .setTimestamp();

  try {
    await ch.send({ embeds: [embed] });
  } catch (err) {
    console.error('[dev commit]', err);
    return interaction.reply({
      content: 'Não foi possível enviar no canal. Verifica permissões do bot.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: `Commit registado em <#${ch.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { handleDev, handleDevCommitModal };

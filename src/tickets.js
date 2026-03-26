'use strict';

const {
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const config = require('./config');
const storage = require('./storage');
const { buildTicketPanel, buildTicketWelcome } = require('./ticketComponentsV2');

const BTN_CLOSE = 'savage_ticket_close';
const BTN_ASSUME = 'savage_ticket_assume';
const SELECT_TICKET = 'savage_ticket_select';
const MODAL_PREFIX = 'savage_ticket_modal_';

const TICKET_TYPE_LABELS = {
  loja: 'Loja',
  bugs: 'Bugs',
  denuncia: 'Denúncia',
  suporte: 'Suporte',
};

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const rid = config.staffRoleId();
  if (rid && member.roles.cache.has(rid)) return true;
  return false;
}

function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  return channel.parentId === config.ticketCategoryId();
}

async function refreshTicketWelcomeMessage(channel) {
  const meta = storage.getTicketMeta(channel.id);
  if (!meta || !meta.welcomeMessageId || !meta.ownerId) return;
  const staffRoleId = config.staffRoleId();
  const ticketTypeLabel = TICKET_TYPE_LABELS[meta.ticketType] || meta.ticketType;
  const welcome = buildTicketWelcome({
    userId: meta.ownerId,
    staffRoleId,
    assumeCustomId: BTN_ASSUME,
    closeCustomId: BTN_CLOSE,
    accentColor: config.ticketEmbedColor(),
    ticketTypeLabel,
    ticketId: meta.ticketIdNum,
    minecraftNick: meta.minecraftNick,
    reportedNick: meta.reportedNick,
    claimedById: meta.claimedById || null,
  });
  const msg = await channel.messages.fetch(meta.welcomeMessageId).catch(() => null);
  if (!msg) return;
  const users = [meta.ownerId];
  if (meta.claimedById) users.push(meta.claimedById);
  await msg.edit({
    flags: MessageFlags.IsComponentsV2,
    components: [welcome],
    allowedMentions: {
      users: [...new Set(users)],
      roles: staffRoleId ? [staffRoleId] : [],
    },
  });
}

async function runAssumeTicket(interaction) {
  if (!interaction.guild || !interaction.channel) return;
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Isto só funciona dentro de um canal de ticket.',
    });
  }
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Apenas staff pode assumir tickets.',
    });
  }
  storage.upsertTicketMeta(interaction.channel.id, {
    claimedById: interaction.user.id,
  });
  const metaAfter = storage.getTicketMeta(interaction.channel.id);
  await refreshTicketWelcomeMessage(interaction.channel);
  if (!metaAfter?.welcomeMessageId) {
    const embed = new EmbedBuilder()
      .setColor(config.ticketEmbedColor())
      .setTitle('Ticket assumido')
      .setDescription(`${interaction.user} assumiu este ticket e vai acompanhá-lo.`)
      .setFooter({ text: interaction.user.tag })
      .setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
  }
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: metaAfter?.welcomeMessageId
      ? 'Assunção registada. A mensagem de boas-vindas mostra **Assumido por** com o teu nome.'
      : 'Assunção registada no canal (ticket antigo sem painel editável).',
  });
}

async function runTicketInfo(interaction) {
  if (!interaction.channel || !interaction.guild) return;
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Usa este comando dentro de um canal de ticket.',
    });
  }
  const meta = storage.getTicketMeta(interaction.channel.id);
  const ownerId = storage.getUserByChannel(interaction.channel.id);
  const ownerLine = ownerId ? `<@${ownerId}>` : '_Desconhecido_';
  const claimedLine =
    meta?.claimedById && String(meta.claimedById).length > 0
      ? `<@${meta.claimedById}>`
      : '_Ninguém_';
  const tipo =
    (meta?.ticketType && TICKET_TYPE_LABELS[meta.ticketType]) ||
    meta?.ticketType ||
    '—';
  const idStr =
    meta?.ticketIdNum != null ? String(meta.ticketIdNum) : '—';
  const nick = meta?.minecraftNick ? `\`${meta.minecraftNick}\`` : '—';
  const reported =
    meta?.reportedNick && String(meta.reportedNick).trim()
      ? `\`${meta.reportedNick}\``
      : '—';
  let criado = '—';
  if (meta?.createdAt) {
    try {
      criado = `<t:${Math.floor(new Date(meta.createdAt).getTime() / 1000)}:F>`;
    } catch {
      criado = meta.createdAt;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('Informação do ticket')
    .addFields(
      { name: 'ID', value: idStr, inline: true },
      { name: 'Tipo', value: tipo, inline: true },
      { name: 'Canal', value: `\`${interaction.channel.name}\``, inline: true },
      { name: 'Dono', value: ownerLine, inline: true },
      { name: 'Assumido por', value: claimedLine, inline: true },
      { name: 'Criado', value: criado, inline: true },
      { name: 'Nick Minecraft', value: nick, inline: true },
      { name: 'Denunciado (nick)', value: reported, inline: true }
    )
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

async function runPinWelcome(interaction) {
  if (!interaction.channel || !interaction.guild) return;
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Usa este comando dentro de um canal de ticket.',
    });
  }
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Apenas staff pode fixar a mensagem de boas-vindas.',
    });
  }
  const meta = storage.getTicketMeta(interaction.channel.id);
  if (!meta?.welcomeMessageId) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        'Não há mensagem de boas-vindas registada (ticket antigo). Abre um ticket novo para usar esta função.',
    });
  }
  const msg = await interaction.channel.messages
    .fetch(meta.welcomeMessageId)
    .catch(() => null);
  if (!msg) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Não foi possível encontrar a mensagem de boas-vindas.',
    });
  }
  try {
    await msg.pin('Boas-vindas do ticket fixadas pela staff');
  } catch (e) {
    console.error('[ticket fixar]', e);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        'Não foi possível fixar. Confirma que o bot tem **Gerir mensagens** neste canal.',
    });
  }
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: 'Mensagem de boas-vindas fixada no topo do canal.',
  });
}

async function runTransferTicket(interaction) {
  if (!interaction.guild || !interaction.channel) return;
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Isto só funciona dentro de um canal de ticket.',
    });
  }
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Apenas staff pode transferir tickets.',
    });
  }
  const target = interaction.options.getUser('staff', true);
  if (target.id === interaction.user.id) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Escolhe outro membro da equipa para transferir.',
    });
  }
  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!targetMember || !isStaff(targetMember)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'O destinatário tem de ser staff (cargo ou administrador).',
    });
  }
  storage.upsertTicketMeta(interaction.channel.id, {
    claimedById: target.id,
  });
  await refreshTicketWelcomeMessage(interaction.channel);
  await interaction.channel.send({
    content: `${interaction.user} transferiu este ticket para ${target}.`,
    allowedMentions: { users: [interaction.user.id, target.id] },
  });
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: 'Ticket transferido.',
  });
}

function safeNickForDisplay(raw) {
  return String(raw || '')
    .trim()
    .replace(/`/g, "'")
    .slice(0, 16);
}

/** Segmento válido para nome de canal Discord (minúsculas, números, hífens). */
function slugChannelSegment(raw, maxLen) {
  const s = String(raw || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
  return s || 'x';
}

/** Nome de canal completo a partir do input da staff (renomear). */
function nameForRename(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'ticket';
}

/** Formato: `<label>-<nick>-<id_do_ticket>` (id sequencial 1, 2, 3…; máx. 100 caracteres). */
function channelNameForTicket(ticketType, minecraftNick, ticketId) {
  const label = slugChannelSegment(ticketType, 16);
  const nick = slugChannelSegment(minecraftNick, 16);
  const id = String(Math.floor(Number(ticketId)) || 0);
  return `${label}-${nick}-${id}`.slice(0, 100);
}

async function dmTranscriptToOwner(client, ownerId, transcript, closeReason) {
  if (!ownerId) return;
  const u = await client.users.fetch(ownerId).catch(() => null);
  if (!u) return;
  const msg = closeReason
    ? `O teu ticket foi fechado.\n**Motivo:** ${closeReason}\nSegue a transcrição.`
    : 'O teu ticket foi fechado. Segue a transcrição.';
  await u
    .send({
      content: msg,
      files: [
        new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: 'transcript.txt' }),
      ],
    })
    .catch(() => {});
}

async function runCloseTicket(interaction, channel, guild, closeReason) {
  const transcript = await collectTranscript(channel);
  const buf = Buffer.from(transcript, 'utf8');
  const att = new AttachmentBuilder(buf, {
    name: `transcript-${channel.name}.txt`,
  });

  const reason =
    closeReason && String(closeReason).trim()
      ? String(closeReason).trim().slice(0, 500)
      : null;

  const logId = config.ticketLogChannelId();
  if (logId) {
    const logCh = await guild.channels.fetch(logId).catch(() => null);
    if (logCh && logCh.isTextBased()) {
      let logText = `Ticket fechado · ${channel.name} · por ${interaction.user.tag}`;
      if (reason) logText += `\n**Motivo:** ${reason}`;
      await logCh.send({
        content: logText,
        files: [att],
      });
    }
  }

  const ownerId = storage.getUserByChannel(channel.id);
  await dmTranscriptToOwner(interaction.client, ownerId, transcript, reason);

  if (ownerId) storage.clearUserTicket(ownerId);
  storage.deleteTicketMeta(channel.id);
}

async function collectTranscript(channel, maxMessages = 400) {
  const lines = [];
  let before = undefined;
  let total = 0;
  while (total < maxMessages) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    const sorted = [...batch.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );
    for (const m of sorted) {
      const ts = m.createdAt.toISOString();
      const tag = m.author?.tag || 'unknown';
      const content = m.content || '';
      const extra =
        m.embeds.length > 0 ? ` [embeds:${m.embeds.length}]` : '';
      const files = m.attachments.size
        ? ` [anexos:${[...m.attachments.values()].map((a) => a.name).join(', ')}]`
        : '';
      lines.push(`[${ts}] ${tag}: ${content}${extra}${files}`);
      total += 1;
    }
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return lines.join('\n') || '(sem mensagens)';
}

async function createTicketChannel(guild, user, meta) {
  const categoryId = config.ticketCategoryId();
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('Categoria de tickets inválida (TICKET_CATEGORY_ID).');
  }

  const staffRoleId = config.staffRoleId();
  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (staffRoleId) {
    overwrites.push({
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const ticketTypeLabel = TICKET_TYPE_LABELS[meta.ticketType] || meta.ticketType;
  const ticketId = storage.getNextTicketSequentialId();
  const name = channelNameForTicket(meta.ticketType, meta.minecraftNick, ticketId);
  let topic =
    `SavageMC · ticket \`${ticketId}\` · ${ticketTypeLabel} · nick \`${meta.minecraftNick}\` · ${user.user.tag} (${user.id})`;
  if (meta.reportedNick) {
    topic += ` · denunciado \`${meta.reportedNick}\``;
  }
  if (topic.length > 1024) topic = topic.slice(0, 1021) + '...';

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic,
  });

  storage.setUserTicket(user.id, channel.id);

  const welcome = buildTicketWelcome({
    userId: user.id,
    staffRoleId,
    assumeCustomId: BTN_ASSUME,
    closeCustomId: BTN_CLOSE,
    accentColor: config.ticketEmbedColor(),
    ticketTypeLabel,
    ticketId,
    minecraftNick: meta.minecraftNick,
    reportedNick: meta.reportedNick,
    claimedById: null,
  });

  const welcomeMsg = await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [welcome],
    allowedMentions: {
      users: [user.id],
      roles: staffRoleId ? [staffRoleId] : [],
    },
  });

  storage.setTicketMeta(channel.id, {
    welcomeMessageId: welcomeMsg.id,
    ownerId: user.id,
    ticketType: meta.ticketType,
    ticketIdNum: ticketId,
    minecraftNick: meta.minecraftNick,
    reportedNick: meta.reportedNick || null,
    claimedById: null,
    createdAt: new Date().toISOString(),
  });

  return channel;
}

async function handleSelectMenu(interaction) {
  if (interaction.customId !== SELECT_TICKET) return;
  const value = interaction.values[0];
  if (!TICKET_TYPE_LABELS[value]) return;

  const modalId = `${MODAL_PREFIX}${value}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Abrir ticket');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('minecraft_nick')
        .setLabel('O teu nick no Minecraft')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex.: henqks')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(16)
    )
  );

  if (value === 'denuncia') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reported_nick')
          .setLabel('Nick de quem denuncias')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Nick do jogador que quer denunciar')
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(16)
      )
    );
  }

  return interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  if (!interaction.customId.startsWith(MODAL_PREFIX)) return;
  const ticketType = interaction.customId.slice(MODAL_PREFIX.length);
  if (!TICKET_TYPE_LABELS[ticketType]) return;
  if (!interaction.guild) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Este pedido só pode ser usado num servidor.',
    });
  }

  const minecraftNick = safeNickForDisplay(
    interaction.fields.getTextInputValue('minecraft_nick')
  );
  let reportedNick = null;
  if (ticketType === 'denuncia') {
    reportedNick = safeNickForDisplay(
      interaction.fields.getTextInputValue('reported_nick')
    );
  }

  if (minecraftNick.length < 3) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Indica um nick no Minecraft válido (mínimo 3 caracteres).',
    });
  }
  if (ticketType === 'denuncia' && (!reportedNick || reportedNick.length < 3)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Indica o nick de quem estás a denunciar (mínimo 3 caracteres).',
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existingId = storage.getChannelForUser(interaction.user.id);
  if (existingId) {
    const ch = await interaction.guild.channels.fetch(existingId).catch(() => null);
    if (ch && isTicketChannel(ch)) {
      return interaction.editReply({
        content: `Já tens um ticket aberto: ${ch.toString()}`,
      });
    }
    storage.clearUserTicket(interaction.user.id);
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = await createTicketChannel(interaction.guild, member, {
      ticketType,
      minecraftNick,
      reportedNick,
    });
    return interaction.editReply({
      content: `Ticket criado: ${channel}`,
    });
  } catch (e) {
    console.error(e);
    return interaction.editReply({
      content:
        'Não foi possível criar o ticket. Verifica permissões do bot na categoria e no servidor.',
    });
  }
}

async function handleCloseButton(interaction) {
  if (!interaction.guild || !interaction.channel) return;
  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Este comando só funciona dentro de um canal de ticket.',
    });
  }

  const ownerId = storage.getUserByChannel(interaction.channel.id);
  const can =
    isStaff(interaction.member) ||
    interaction.user.id === ownerId;
  if (!can) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Não tens permissão para fechar este ticket.',
    });
  }

  await interaction.deferReply();
  await runCloseTicket(interaction, interaction.channel, interaction.guild, null);
  await interaction.editReply({ content: 'Ticket fechado.' });
  await interaction.channel.delete('Ticket fechado').catch(() => null);
}

async function handleSlash(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'painel') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Apenas staff pode usar este comando.',
      });
    }
    const panelCh = config.ticketPanelChannelId();
    if (panelCh && interaction.channelId !== panelCh) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content:
          'O painel de tickets só pode ser publicado no canal configurado em `config.json` (ticketPanelChannelId).',
      });
    }
    const guild = interaction.guild;
    const panel = buildTicketPanel({
      selectCustomId: SELECT_TICKET,
      accentColor: config.ticketEmbedColor(),
      guildName: guild?.name ?? undefined,
      guildIconUrl: guild?.iconURL({ size: 256, extension: 'png' }) ?? null,
    });

    const ch = interaction.channel;
    if (!ch || !ch.isTextBased()) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Canal inválido para publicar o painel.',
      });
    }

    try {
      await ch.send({
        flags: MessageFlags.IsComponentsV2,
        components: [panel],
      });
    } catch (e) {
      console.error('[ticket painel]', e);
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content:
          'Não foi possível enviar o painel. Confirma que o bot pode **Enviar mensagens** e **Usar componentes** neste canal.',
      });
    }

    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Painel publicado neste canal.',
    });
  }

  if (sub === 'fechar') {
    if (!interaction.channel || !interaction.guild) return;
    if (!isTicketChannel(interaction.channel)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Usa este comando dentro de um canal de ticket.',
      });
    }
    const ownerId = storage.getUserByChannel(interaction.channel.id);
    const can =
      isStaff(interaction.member) ||
      interaction.user.id === ownerId;
    if (!can) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Não tens permissão para fechar este ticket.',
      });
    }

    const motivo = interaction.options.getString('motivo');
    const closeReason = motivo?.trim() ? motivo.trim().slice(0, 500) : null;

    await interaction.deferReply();
    const ch = interaction.channel;
    const g = interaction.guild;
    await runCloseTicket(interaction, ch, g, closeReason);
    await interaction.editReply({
      content: closeReason
        ? `Ticket fechado. Motivo registado nos logs.`
        : 'Ticket fechado.',
    });
    await ch.delete('Ticket fechado').catch(() => null);
    return;
  }

  if (sub === 'adicionar' || sub === 'remover') {
    if (!interaction.channel || !interaction.guild) return;
    if (!isTicketChannel(interaction.channel)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Usa isto dentro de um canal de ticket.',
      });
    }
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Apenas staff pode adicionar ou remover membros.',
      });
    }

    const target = interaction.options.getUser('membro', true);
    if (sub === 'adicionar') {
      await interaction.channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });
      await interaction.reply({
        content: `${target} foi adicionado ao ticket.`,
      });
    } else {
      await interaction.channel.permissionOverwrites.delete(target.id).catch(() => null);
      await interaction.reply({
        content: `${target} foi removido do ticket.`,
      });
    }
  }

  if (sub === 'assumir') {
    return runAssumeTicket(interaction);
  }

  if (sub === 'info') {
    return runTicketInfo(interaction);
  }

  if (sub === 'fixar') {
    return runPinWelcome(interaction);
  }

  if (sub === 'transferir') {
    return runTransferTicket(interaction);
  }

  if (sub === 'transcricao') {
    if (!interaction.channel || !interaction.guild) return;
    if (!isTicketChannel(interaction.channel)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Usa este comando dentro de um canal de ticket.',
      });
    }
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Apenas staff pode pedir transcrição.',
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await collectTranscript(interaction.channel);
    const buf = Buffer.from(t, 'utf8');
    return interaction.editReply({
      content: 'Transcrição até ao momento (o canal **não** foi fechado).',
      files: [
        new AttachmentBuilder(buf, {
          name: `transcript-${interaction.channel.name}.txt`,
        }),
      ],
    });
  }

  if (sub === 'renomear') {
    if (!interaction.channel || !interaction.guild) return;
    if (!isTicketChannel(interaction.channel)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Usa este comando dentro de um canal de ticket.',
      });
    }
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Apenas staff pode renomear o canal.',
      });
    }
    const novo = nameForRename(interaction.options.getString('nome', true));
    try {
      await interaction.channel.setName(novo, 'Ticket renomeado pela staff');
    } catch (e) {
      console.error(e);
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Não foi possível renomear. Verifica permissões do bot (Gerir canais).',
      });
    }
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `Canal renomeado para \`${novo}\`.`,
    });
  }

  if (sub === 'listar') {
    if (!interaction.guild) return;
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Apenas staff pode listar tickets.',
      });
    }
    const categoryId = config.ticketCategoryId();
    const children = interaction.guild.channels.cache.filter(
      (c) =>
        c.parentId === categoryId && c.type === ChannelType.GuildText
    );
    const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
    const lines = sorted.slice(0, 40).map((c) => `• ${c}`);
    const extra =
      sorted.length > 40 ? `\n_…e mais ${sorted.length - 40}._` : '';
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        `**Tickets abertos:** ${sorted.length}\n\n` +
        (lines.length ? lines.join('\n') : '_Nenhum canal na categoria._') +
        extra,
    });
  }

  if (sub === 'nota') {
    if (!interaction.channel || !interaction.guild) return;
    if (!isTicketChannel(interaction.channel)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Usa este comando dentro de um canal de ticket.',
      });
    }
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Apenas staff pode publicar notas.',
      });
    }
    const texto = interaction.options.getString('texto', true).trim().slice(0, 1000);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder()
      .setColor(0xfaa61a)
      .setTitle('Nota da equipa')
      .setDescription(texto)
      .setFooter({ text: interaction.user.tag })
      .setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    return interaction.editReply({ content: 'Nota publicada no ticket.' });
  }
}

async function routeComponent(interaction) {
  if (interaction.customId === BTN_CLOSE) {
    return handleCloseButton(interaction);
  }
  if (interaction.customId === BTN_ASSUME) {
    return runAssumeTicket(interaction);
  }
}

module.exports = {
  handleSlash,
  routeComponent,
  handleSelectMenu,
  handleModalSubmit,
  BTN_CLOSE,
  BTN_ASSUME,
  SELECT_TICKET,
};

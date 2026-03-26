'use strict';

/**
 * Logs de atividade do servidor para um canal de texto.
 * Requer no servidor: **Ver registo de auditoria** (View Audit Log) para `guildAuditLogEntryCreate`.
 */

const { EmbedBuilder } = require('discord.js');
const { AuditLogEvent } = require('discord-api-types/v10');
const config = require('./config');

const LOG_COLOR_AUDIT = 0x5865f2;
const LOG_COLOR_MSG = 0x57f287;
const LOG_COLOR_MSG_EDIT = 0xfee75c;
const LOG_COLOR_MSG_DEL = 0xed4245;
const LOG_COLOR_MEMBER = 0x57f287;
const LOG_COLOR_LEAVE = 0x99aab5;
const LOG_COLOR_VOICE = 0x9b59b6;
const LOG_COLOR_CMD = 0xfaa61a;
const LOG_COLOR_REACTION = 0x3498db;

const MAX_FIELD = 1024;
const MAX_DESC = 3900;

let sendChain = Promise.resolve();

function shouldLogGuild(guild) {
  if (!guild) return false;
  const only = config.guildId();
  if (!only) return true;
  return guild.id === only;
}

function truncate(str, max = MAX_FIELD) {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

function enqueueSend(client, buildEmbed) {
  sendChain = sendChain
    .then(async () => {
      const id = config.discordLogChannelId();
      if (!id) return;
      let ch = client.channels.cache.get(id);
      if (!ch) ch = await client.channels.fetch(id).catch(() => null);
      if (!ch || !ch.isTextBased()) return;
      const embed = buildEmbed();
      if (!embed) return;
      await ch.send({ embeds: [embed] }).catch((e) => {
        console.error('[discordLog] Falha ao enviar:', e?.message || e);
      });
      await new Promise((r) => setTimeout(r, 350));
    })
    .catch(() => {});
  return sendChain;
}

function resolveAuditActionName(action) {
  for (const [k, v] of Object.entries(AuditLogEvent)) {
    if (v === action && Number.isNaN(Number(k))) return k;
  }
  return `Action_${action}`;
}

function formatTarget(entry) {
  const t = entry.target;
  if (!t) return entry.targetId ? `\`${entry.targetId}\`` : '—';
  if (typeof t === 'string') return t;
  if (t.tag) return `${t.tag} (\`${t.id}\`)`;
  if (t.name != null && t.id) return `${t.name} (\`${t.id}\`)`;
  if (t.username) return `${t.username} (\`${t.id}\`)`;
  if (t.id) return `\`${t.id}\``;
  return truncate(JSON.stringify(t), 200);
}

function formatChanges(changes) {
  if (!changes?.length) return '—';
  const lines = changes.map((c) => {
    const key = c.key;
    const oldV = c.old !== undefined ? JSON.stringify(c.old) : '—';
    const newV = c.new !== undefined ? JSON.stringify(c.new) : '—';
    return `**${key}:** ${truncate(oldV, 80)} → ${truncate(newV, 80)}`;
  });
  return truncate(lines.join('\n'), MAX_DESC);
}

function formatExtra(entry) {
  if (!entry.extra) return null;
  try {
    const e = entry.extra;
    if (e.channel && e.messageId) {
      return `Canal: ${e.channel}\nMensagem: \`${e.messageId}\``;
    }
    if (e.channel && e.count != null) {
      return `Canal: ${e.channel}\nContagem: ${e.count}`;
    }
    if (e.count != null && !e.channel) return `Contagem: ${e.count}`;
    if (e.removed != null) return `Removidos: ${e.removed} (${e.days} dias)`;
    return truncate(JSON.stringify(e), MAX_FIELD);
  } catch {
    return null;
  }
}

function buildAuditEmbed(entry, guild) {
  const actionName = resolveAuditActionName(entry.action);
  const exec = entry.executor
    ? `${entry.executor.tag} (\`${entry.executor.id}\`)`
    : entry.executorId
      ? `\`${entry.executorId}\``
      : '—';

  const embed = new EmbedBuilder()
    .setColor(LOG_COLOR_AUDIT)
    .setTitle(`📋 Auditoria · ${actionName}`)
    .setDescription(`**Tipo:** ${entry.actionType} · **Alvo:** ${entry.targetType}`)
    .addFields(
      { name: 'Executor', value: truncate(exec, MAX_FIELD), inline: true },
      { name: 'Alvo', value: truncate(formatTarget(entry), MAX_FIELD), inline: true }
    )
    .setFooter({ text: guild.name })
    .setTimestamp();

  const ch = formatChanges(entry.changes);
  if (ch && ch !== '—') {
    embed.addFields({ name: 'Alterações', value: ch });
  }

  const ex = formatExtra(entry);
  if (ex) embed.addFields({ name: 'Extra', value: truncate(ex, MAX_FIELD) });

  if (entry.reason) {
    embed.addFields({ name: 'Motivo', value: truncate(entry.reason, MAX_FIELD) });
  }

  return embed;
}

function startDiscordLogging(client) {
  if (!config.discordLogChannelId()) {
    console.log('[discordLog] Desativado (define DISCORD_LOG_CHANNEL_ID ou discordLogChannelId).');
    return;
  }

  console.log('[discordLog] Ativo — canal:', config.discordLogChannelId());

  client.on('guildAuditLogEntryCreate', (entry, guild) => {
    if (!shouldLogGuild(guild)) return;
    enqueueSend(client, () => buildAuditEmbed(entry, guild));
  });

  client.on('guildMemberAdd', (member) => {
    if (!shouldLogGuild(member.guild)) return;
    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_MEMBER)
        .setTitle('➕ Membro entrou')
        .setDescription(`${member.user.tag} (\`${member.user.id}\`)`)
        .addFields({
          name: 'Conta criada',
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          inline: true,
        })
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setTimestamp()
    );
  });

  client.on('guildMemberRemove', (member) => {
    if (!shouldLogGuild(member.guild)) return;
    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_LEAVE)
        .setTitle('➖ Membro saiu')
        .setDescription(`${member.user.tag} (\`${member.user.id}\`)`)
        .addFields(
          {
            name: 'Entrou no servidor',
            value: member.joinedAt
              ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
              : '—',
            inline: true,
          },
          { name: 'Cargos', value: truncate(member.roles.cache.map((r) => r.name).join(', ') || '—', MAX_FIELD) }
        )
        .setTimestamp()
    );
  });

  client.on('messageUpdate', (oldMsg, newMsg) => {
    if (!newMsg.guild || !shouldLogGuild(newMsg.guild)) return;
    if (newMsg.author?.bot && !config.discordLogBotMessages()) return;
    if (oldMsg.content === newMsg.content && newMsg.embeds?.length === oldMsg.embeds?.length)
      return;
    const oldC = oldMsg.content || '_(vazio ou não em cache)_';
    const newC = newMsg.content || '_(vazio)_';
    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_MSG_EDIT)
        .setTitle('✏️ Mensagem editada')
        .setAuthor({
          name: newMsg.author?.tag || 'Desconhecido',
          iconURL: newMsg.author?.displayAvatarURL({ size: 64 }) ?? undefined,
        })
        .addFields(
          { name: 'Canal', value: `${newMsg.channel}`, inline: true },
          { name: 'ID mensagem', value: `\`${newMsg.id}\``, inline: true },
          { name: 'Antes', value: truncate(oldC, MAX_FIELD) },
          { name: 'Depois', value: truncate(newC, MAX_FIELD) }
        )
        .setTimestamp()
    );
  });

  client.on('messageDelete', (message) => {
    if (!message.guild || !shouldLogGuild(message.guild)) return;
    if (message.author?.bot && !config.discordLogBotMessages()) return;
    const content = message.content || '_(sem texto — só anexos/embeds ou não em cache)_';
    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_MSG_DEL)
        .setTitle('🗑️ Mensagem apagada')
        .setAuthor({
          name: message.author?.tag || 'Desconhecido',
          iconURL: message.author?.displayAvatarURL({ size: 64 }) ?? undefined,
        })
        .addFields(
          { name: 'Canal', value: `${message.channel}`, inline: true },
          { name: 'ID', value: `\`${message.id}\``, inline: true },
          { name: 'Conteúdo', value: truncate(content, MAX_FIELD) }
        )
        .setTimestamp()
    );
  });

  client.on('messageDeleteBulk', (messages) => {
    const first = messages.first();
    if (!first?.guild || !shouldLogGuild(first.guild)) return;
    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_MSG_DEL)
        .setTitle('🗑️ Mensagens apagadas em massa')
        .setDescription(`**${messages.size}** mensagens em ${first.channel}`)
        .setTimestamp()
    );
  });

  client.on('voiceStateUpdate', (oldS, newS) => {
    if (!newS.guild || !shouldLogGuild(newS.guild)) return;
    const member = newS.member;
    if (!member) return;

    const uid = member.user.tag;
    let title;
    let detail = '';

    if (!oldS.channelId && newS.channelId) {
      title = '🔊 Entrou na call';
      detail = newS.channel ? `${newS.channel.name} (\`${newS.channel.id}\`)` : '';
    } else if (oldS.channelId && !newS.channelId) {
      title = '🔇 Saiu da call';
      detail = oldS.channel ? `${oldS.channel.name}` : '';
    } else if (oldS.channelId !== newS.channelId && newS.channelId) {
      title = '🔀 Mudou de canal de voz';
      detail = `${oldS.channel || '?'} → ${newS.channel || '?'}`;
    } else if (oldS.mute !== newS.mute || oldS.deaf !== newS.deaf) {
      title = '🔇 Estado de voz';
      detail = `mute: ${newS.mute} · deaf: ${newS.deaf} · stream: ${newS.streaming}`;
    } else {
      return;
    }

    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_VOICE)
        .setTitle(title)
        .setDescription(`**${uid}** (\`${member.id}\`)\n${detail}`)
        .setTimestamp()
    );
  });

  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild || !shouldLogGuild(interaction.guild)) return;
    const user = interaction.user.tag;
    const cmd = `/${interaction.commandName}`;
    const sub = interaction.options?.getSubcommand(false);
    const full = sub ? `${cmd} ${sub}` : cmd;
    enqueueSend(client, () =>
      new EmbedBuilder()
        .setColor(LOG_COLOR_CMD)
        .setTitle('⌨️ Comando')
        .setDescription(`**${full}**`)
        .addFields(
          { name: 'Utilizador', value: `${user} (\`${interaction.user.id}\`)`, inline: true },
          { name: 'Canal', value: `${interaction.channel || '—'}`, inline: true }
        )
        .setTimestamp()
    );
  });

  if (config.discordLogMessageCreate()) {
    client.on('messageCreate', (message) => {
      if (!message.guild || !shouldLogGuild(message.guild)) return;
      if (message.author?.bot && !config.discordLogBotMessages()) return;
      const text = message.content || '_(anexo/embed)_';
      enqueueSend(client, () =>
        new EmbedBuilder()
          .setColor(LOG_COLOR_MSG)
          .setTitle('💬 Mensagem nova')
          .setAuthor({
            name: message.author?.tag || '?',
            iconURL: message.author?.displayAvatarURL({ size: 64 }) ?? undefined,
          })
          .addFields(
            { name: 'Canal', value: `${message.channel}`, inline: true },
            { name: 'Texto', value: truncate(text, MAX_FIELD) }
          )
          .setTimestamp()
      );
    });
  }

  if (config.discordLogReactions()) {
    client.on('messageReactionAdd', (reaction, user) => {
      if (!reaction.message.guild || !shouldLogGuild(reaction.message.guild)) return;
      if (user.bot && !config.discordLogBotMessages()) return;
      const emoji = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      enqueueSend(client, () =>
        new EmbedBuilder()
          .setColor(LOG_COLOR_REACTION)
          .setTitle('➕ Reação adicionada')
          .setDescription(
            `${user.tag} → ${emoji} em ${reaction.message.channel}\nMensagem: \`${reaction.message.id}\``
          )
          .setTimestamp()
      );
    });

    client.on('messageReactionRemove', (reaction, user) => {
      if (!reaction.message.guild || !shouldLogGuild(reaction.message.guild)) return;
      const emoji = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      enqueueSend(client, () =>
        new EmbedBuilder()
          .setColor(LOG_COLOR_REACTION)
          .setTitle('➖ Reação removida')
          .setDescription(
            `${user.tag} → ${emoji} em ${reaction.message.channel}\nMensagem: \`${reaction.message.id}\``
          )
          .setTimestamp()
      );
    });
  }
}

module.exports = { startDiscordLogging };

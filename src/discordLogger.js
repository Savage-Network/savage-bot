'use strict';

/**
 * Logs de atividade do servidor para um canal de texto.
 * Requer no servidor: **Ver registro de auditoria** (View Audit Log) para `guildAuditLogEntryCreate`.
 */

const { MessageFlags } = require('discord.js');
const { AuditLogEvent } = require('discord-api-types/v10');
const config = require('./config');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  footerTimestampLine,
} = require('./v2Helpers');

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

const V2 = MessageFlags.IsComponentsV2;

/** Nomes técnicos da API → texto legível (auditoria). */
const AUDIT_ACTION_PT = {
  GuildUpdate: 'Servidor editado',
  ChannelCreate: 'Canal criado',
  ChannelUpdate: 'Canal editado',
  ChannelDelete: 'Canal apagado',
  ChannelOverwriteCreate: 'Permissões do canal criadas',
  ChannelOverwriteUpdate: 'Permissões do canal editadas',
  ChannelOverwriteDelete: 'Permissões do canal removidas',
  MemberKick: 'Membro expulso',
  MemberPrune: 'Membros removidos (prune)',
  MemberBanAdd: 'Membro banido',
  MemberBanRemove: 'Banimento revogado',
  MemberUpdate: 'Membro editado',
  MemberRoleUpdate: 'Cargos do membro alterados',
  MemberMove: 'Membro movido de canal de voz',
  MemberDisconnect: 'Membro desligado da voz',
  BotAdd: 'Bot adicionado ao servidor',
  RoleCreate: 'Cargo criado',
  RoleUpdate: 'Cargo editado',
  RoleDelete: 'Cargo apagado',
  InviteCreate: 'Convite criado',
  InviteUpdate: 'Convite editado',
  InviteDelete: 'Convite apagado',
  WebhookCreate: 'Webhook criado',
  WebhookUpdate: 'Webhook editado',
  WebhookDelete: 'Webhook apagado',
  EmojiCreate: 'Emoji criado',
  EmojiUpdate: 'Emoji editado',
  EmojiDelete: 'Emoji apagado',
  MessageDelete: 'Mensagem apagada (auditoria)',
  MessageBulkDelete: 'Mensagens apagadas em massa',
  MessagePin: 'Mensagem fixada',
  MessageUnpin: 'Mensagem desafixada',
  IntegrationCreate: 'Integração criada',
  IntegrationUpdate: 'Integração editada',
  IntegrationDelete: 'Integração removida',
  StageInstanceCreate: 'Palco criado',
  StageInstanceUpdate: 'Palco editado',
  StageInstanceDelete: 'Palco apagado',
  StickerCreate: 'Sticker criado',
  StickerUpdate: 'Sticker editado',
  StickerDelete: 'Sticker apagado',
  ThreadCreate: 'Tópico criado',
  ThreadUpdate: 'Tópico editado',
  ThreadDelete: 'Tópico apagado',
  ApplicationCommandPermissionUpdate: 'Permissões de comando alteradas',
  AutoModerationRuleCreate: 'Regra de AutoMod criada',
  AutoModerationRuleUpdate: 'Regra de AutoMod editada',
  AutoModerationRuleDelete: 'Regra de AutoMod apagada',
  AutoModerationBlockMessage: 'Mensagem bloqueada (AutoMod)',
  AutoModerationFlagToChannel: 'Mensagem sinalizada (AutoMod)',
  AutoModerationUserCommunicationDisabled: 'Utilizador silenciado (AutoMod)',
};

const TARGET_TYPE_PT = {
  Guild: 'Servidor',
  Channel: 'Canal',
  User: 'Utilizador',
  Role: 'Cargo',
  Invite: 'Convite',
  Webhook: 'Webhook',
  Emoji: 'Emoji',
  Message: 'Mensagem',
  Integration: 'Integração',
  Unknown: 'Desconhecido',
};

let sendChain = Promise.resolve();

function shouldLogGuild(guild) {
  if (!guild) return false;
  const only = config.guildId();
  if (!only) return true;
  return guild.id === only;
}

function truncate(str, max = MAX_FIELD) {
  const s = String(str ?? '');
  if (s.length > max) return s.slice(0, max - 3) + '...';
  return s;
}

function enqueueSend(client, buildContainer) {
  sendChain = sendChain
    .then(async () => {
      const id = config.discordLogChannelId();
      if (!id) return;
      let ch = client.channels.cache.get(id);
      if (!ch) ch = await client.channels.fetch(id).catch(() => null);
      if (!ch || !ch.isTextBased()) return;
      const container = await Promise.resolve(buildContainer());
      if (!container) return;
      await ch.send({ flags: V2, components: [container] }).catch((e) => {
        console.error('[discordLog] Falha ao enviar:', e?.message || e);
      });
      await new Promise((r) => setTimeout(r, 250));
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

function auditActionLabelPt(actionKey) {
  return AUDIT_ACTION_PT[actionKey] || actionKey.replace(/([A-Z])/g, ' $1').trim();
}

function targetTypeLabelPt(t) {
  if (t == null) return '—';
  const s = String(t);
  return TARGET_TYPE_PT[s] || s;
}

function formatTarget(entry) {
  const t = entry.target;
  if (!t) return entry.targetId ? `\`${entry.targetId}\`` : '—';
  if (typeof t === 'string') return t;
  if (t.tag) return `${t.tag} (\`${t.id}\`)`;
  if (t.name != null && t.id) return `${t.name} (\`${t.id}\`)`;
  if (t.username != null && t.id) return `${t.username} (\`${t.id}\`)`;
  if (t.globalName && t.id) return `${t.globalName} (\`${t.id}\`)`;
  if (t.id) return `\`${t.id}\``;
  return truncate(JSON.stringify(t), 200);
}

/** Evita "null" no log quando a API devolve executor parcial (sem tag). */
async function formatAuditExecutor(entry, client) {
  const id = entry.executorId ?? entry.executor?.id;
  if (!id) return '—';

  const ex = entry.executor;
  if (ex) {
    if (ex.tag) return `${ex.tag} (\`${id}\`)`;
    if (ex.username != null && String(ex.username).trim() !== '') {
      const disc = ex.discriminator;
      const disp =
        disc && disc !== '0' && disc !== '0000'
          ? `${ex.username}#${disc}`
          : String(ex.username);
      return `${disp} (\`${id}\`)`;
    }
    if (ex.globalName) return `${ex.globalName} (\`${id}\`)`;
  }

  try {
    const u = await client.users.fetch(id);
    return `${u.tag} (\`${id}\`)`;
  } catch {
    return `\`${id}\` _(executor não resolvido)_`;
  }
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

function buildAuditContainer(entry, guild, executorDisplay) {
  const actionKey = resolveAuditActionName(entry.action);
  const actionPt = auditActionLabelPt(actionKey);
  const exec =
    executorDisplay ??
    (entry.executorId ? `\`${entry.executorId}\`` : '—');

  const lines = [
    `-# Registo oficial do Discord: moderador/ação e alvo (ban, cargos, canais, etc.).`,
    '',
    `**Ação** · ${actionPt}`,
    `_${actionKey}_ · tipo API: \`${entry.actionType}\` · alvo: **${targetTypeLabelPt(entry.targetType)}**`,
    '',
    `**Quem executou** · ${truncate(exec, MAX_FIELD)}`,
    `**Alvo** · ${truncate(formatTarget(entry), MAX_FIELD)}`,
  ];

  const ch = formatChanges(entry.changes);
  if (ch && ch !== '—') {
    lines.push('', '**Alterações**', ch);
  }

  const ex = formatExtra(entry);
  if (ex) {
    lines.push('', '**Extra**', truncate(ex, MAX_FIELD));
  }

  if (entry.reason) {
    lines.push('', '**Motivo declarado**', truncate(entry.reason, MAX_FIELD));
  }

  const main = `## Registo de auditoria\n\n${lines.join('\n')}`;

  return new ContainerBuilder()
    .setAccentColor(LOG_COLOR_AUDIT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(main.slice(0, 3800)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        footerTimestampLine(footer({ text: `${guild.name} · auditoria` }).text)
      )
    );
}

function startDiscordLogging(client) {
  if (!config.discordLogChannelId()) {
    console.log('[discordLog] Desativado (defina discordLogChannelId em config.json ou DISCORD_LOG_CHANNEL_ID).');
    return;
  }

  console.log('[discordLog] Ativo — canal:', config.discordLogChannelId());

  client.on('guildAuditLogEntryCreate', (entry, guild) => {
    if (!shouldLogGuild(guild)) return;
    enqueueSend(client, async () => {
      const executorDisplay = await formatAuditExecutor(entry, guild.client);
      return buildAuditContainer(entry, guild, executorDisplay);
    });
  });

  client.on('guildMemberAdd', (member) => {
    if (!shouldLogGuild(member.guild)) return;
    enqueueSend(client, () => {
      const avatarUrl = member.user.displayAvatarURL({ size: 128 });
      const foot = footerTimestampLine(footer({ text: 'Membros · entrada' }).text);
      const body =
        `## Membros · nova entrada\n` +
        `-# Alguém acabou de entrar no servidor.\n\n` +
        `**Utilizador** · ${member.user.tag} (\`${member.user.id}\`)\n` +
        `**Conta criada** · <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(avatarUrl)
            .setDescription(member.user.tag)
        );
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_MEMBER)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  client.on('guildMemberRemove', (member) => {
    if (!shouldLogGuild(member.guild)) return;
    enqueueSend(client, () => {
      const foot = footerTimestampLine(footer({ text: 'Membros · saída' }).text);
      const text =
        '## Membros · saída\n' +
        '-# Alguém saiu, foi expulso ou banido (ou a conta foi apagada).\n\n' +
        `**Utilizador** · ${member.user.tag} (\`${member.user.id}\`)\n` +
        `**Entrou no servidor** · ${
          member.joinedAt
            ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
            : '—'
        }\n` +
        `**Cargos antes de sair** · ${truncate(member.roles.cache.map((r) => r.name).join(', ') || '—', MAX_FIELD)}`;
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_LEAVE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  client.on('messageUpdate', (oldMsg, newMsg) => {
    if (!newMsg.guild || !shouldLogGuild(newMsg.guild)) return;
    if (newMsg.author?.bot && !config.discordLogBotMessages()) return;
    if (oldMsg.content === newMsg.content && newMsg.embeds?.length === oldMsg.embeds?.length)
      return;
    const oldC = oldMsg.content || '_(vazio ou não em cache)_';
    const newC = newMsg.content || '_(vazio)_';
    const authorTag = newMsg.author?.tag || 'Desconhecido';
    const iconUrl = newMsg.author?.displayAvatarURL({ size: 64 });
    enqueueSend(client, () => {
      const foot = footerTimestampLine(footer({ text: 'Mensagens · edição' }).text);
      const main =
        `## Mensagens · mensagem editada\n` +
        `-# O texto (ou anexos visíveis) de uma mensagem foi alterado.\n\n` +
        `**Autor** · ${authorTag}\n` +
        `**Canal** · ${newMsg.channel}\n` +
        `**ID da mensagem** · \`${newMsg.id}\`\n\n` +
        `**Antes**\n${truncate(oldC, MAX_FIELD)}\n\n` +
        `**Depois**\n${truncate(newC, MAX_FIELD)}`;
      if (iconUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(iconUrl).setDescription(authorTag)
          );
        return new ContainerBuilder()
          .setAccentColor(LOG_COLOR_MSG_EDIT)
          .addSectionComponents(section)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
      }
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_MSG_EDIT)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  client.on('messageDelete', (message) => {
    if (!message.guild || !shouldLogGuild(message.guild)) return;
    if (message.author?.bot && !config.discordLogBotMessages()) return;
    const content = message.content || '_(sem texto — só anexos/embeds ou não em cache)_';
    const authorTag = message.author?.tag || 'Desconhecido';
    const iconUrl = message.author?.displayAvatarURL({ size: 64 });
    enqueueSend(client, () => {
      const foot = footerTimestampLine(footer({ text: 'Mensagens · apagada' }).text);
      const main =
        '## Mensagens · mensagem apagada\n' +
        '-# Uma mensagem deixou de existir neste canal (apagada por utilizador, mod ou bot).\n\n' +
        `**Autor** · ${authorTag}\n` +
        `**Canal** · ${message.channel}\n` +
        `**ID** · \`${message.id}\`\n\n` +
        `**Conteúdo conhecido**\n${truncate(content, MAX_FIELD)}`;
      if (iconUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(iconUrl).setDescription(authorTag)
          );
        return new ContainerBuilder()
          .setAccentColor(LOG_COLOR_MSG_DEL)
          .addSectionComponents(section)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
      }
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_MSG_DEL)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  client.on('messageDeleteBulk', (messages) => {
    const first = messages.first();
    if (!first?.guild || !shouldLogGuild(first.guild)) return;
    enqueueSend(client, () => {
      const foot = footerTimestampLine(footer({ text: 'Mensagens · limpeza em massa' }).text);
      const text =
        '## Mensagens · apagadas em massa\n' +
        '-# Várias mensagens foram removidas de uma vez (mod, bot ou limpeza nativa).\n\n' +
        `**Quantidade** · **${messages.size}** mensagens\n` +
        `**Canal** · ${first.channel}`;
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_MSG_DEL)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  client.on('voiceStateUpdate', (oldS, newS) => {
    if (!newS.guild || !shouldLogGuild(newS.guild)) return;
    const member = newS.member;
    if (!member) return;

    const uid = member.user.tag;
    let title;
    let hint;
    let detail = '';

    if (!oldS.channelId && newS.channelId) {
      title = 'Voz · entrou num canal de voz';
      hint = 'O utilizador ligou o microfone/entrada a um canal de voz.';
      detail = newS.channel
        ? `**Canal** · ${newS.channel.name} (\`${newS.channel.id}\`)`
        : '';
    } else if (oldS.channelId && !newS.channelId) {
      title = 'Voz · saiu da chamada';
      hint = 'O utilizador desligou-se do canal de voz.';
      detail = oldS.channel ? `**Último canal** · ${oldS.channel.name}` : '';
    } else if (oldS.channelId !== newS.channelId && newS.channelId) {
      title = 'Voz · mudou de canal';
      hint = 'O utilizador mudou de um canal de voz para outro.';
      const from = oldS.channel ? oldS.channel.name : '?';
      const to = newS.channel ? newS.channel.name : '?';
      detail = `**De** · ${from}\n**Para** · ${to}`;
    } else if (oldS.mute !== newS.mute || oldS.deaf !== newS.deaf) {
      title = 'Voz · estado (mute / surdo / stream)';
      hint = 'Alteração ao estado de microfone, som ou transmissão.';
      detail =
        `**Microfone mutado** · ${newS.mute ? 'sim' : 'não'}\n` +
        `**Som desligado (deaf)** · ${newS.deaf ? 'sim' : 'não'}\n` +
        `**A transmitir** · ${newS.streaming ? 'sim' : 'não'}`;
    } else {
      return;
    }

    enqueueSend(client, () => {
      const foot = footerTimestampLine(footer({ text: 'Voz' }).text);
      const text =
        `## ${title}\n` +
        `-# ${hint}\n\n` +
        `**Utilizador** · ${uid} (\`${member.id}\`)\n` +
        (detail ? `${detail}` : '');
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_VOICE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild || !shouldLogGuild(interaction.guild)) return;
    const user = interaction.user.tag;
    const cmd = `/${interaction.commandName}`;
    const sub = interaction.options?.getSubcommand(false);
    const full = sub ? `${cmd} ${sub}` : cmd;
    enqueueSend(client, () => {
      const foot = footerTimestampLine(footer({ text: 'Comandos · slash' }).text);
      const text =
        '## Comandos · slash usado\n' +
        '-# Alguém executou um comando de barra neste servidor.\n\n' +
        `**Comando** · \`${full}\`\n` +
        `**Quem** · ${user} (\`${interaction.user.id}\`)\n` +
        `**Onde** · ${interaction.channel || '—'}`;
      return new ContainerBuilder()
        .setAccentColor(LOG_COLOR_CMD)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
    });
  });

  if (config.discordLogMessageCreate()) {
    client.on('messageCreate', (message) => {
      if (!message.guild || !shouldLogGuild(message.guild)) return;
      if (message.author?.bot && !config.discordLogBotMessages()) return;
      const text = message.content || '_(anexo/embed)_';
      const tag = message.author?.tag || '?';
      const iconUrl = message.author?.displayAvatarURL({ size: 64 });
      enqueueSend(client, () => {
        const foot = footerTimestampLine(footer({ text: 'Mensagens · nova' }).text);
        const main =
          '## Mensagens · mensagem nova\n' +
          '-# Nova mensagem de texto (ou com anexos) neste canal — útil para auditoria de conversas.\n\n' +
          `**Autor** · ${tag}\n` +
          `**Canal** · ${message.channel}\n\n` +
          `**Conteúdo**\n${truncate(text, MAX_FIELD)}`;
        if (iconUrl) {
          const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(iconUrl).setDescription(tag)
            );
          return new ContainerBuilder()
            .setAccentColor(LOG_COLOR_MSG)
            .addSectionComponents(section)
            .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
        }
        return new ContainerBuilder()
          .setAccentColor(LOG_COLOR_MSG)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
      });
    });
  }

  if (config.discordLogReactions()) {
    client.on('messageReactionAdd', (reaction, user) => {
      if (!reaction.message.guild || !shouldLogGuild(reaction.message.guild)) return;
      if (user.bot && !config.discordLogBotMessages()) return;
      const emoji = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      enqueueSend(client, () => {
        const foot = footerTimestampLine(footer({ text: 'Reações · adicionada' }).text);
        const text =
          '## Reações · emoji adicionado\n' +
          '-# Alguém reagiu a uma mensagem com um emoji.\n\n' +
          `**Quem reagiu** · ${user.tag} (\`${user.id}\`)\n` +
          `**Emoji** · ${emoji}\n` +
          `**Canal** · ${reaction.message.channel}\n` +
          `**ID da mensagem** · \`${reaction.message.id}\``;
        return new ContainerBuilder()
          .setAccentColor(LOG_COLOR_REACTION)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
      });
    });

    client.on('messageReactionRemove', (reaction, user) => {
      if (!reaction.message.guild || !shouldLogGuild(reaction.message.guild)) return;
      const emoji = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      enqueueSend(client, () => {
        const foot = footerTimestampLine(footer({ text: 'Reações · removida' }).text);
        const text =
          '## Reações · emoji removido\n' +
          '-# Alguém tirou a própria reação (ou foi removida por mod/bot).\n\n' +
          `**Quem** · ${user.tag} (\`${user.id}\`)\n` +
          `**Emoji** · ${emoji}\n` +
          `**Canal** · ${reaction.message.channel}\n` +
          `**ID da mensagem** · \`${reaction.message.id}\``;
        return new ContainerBuilder()
          .setAccentColor(LOG_COLOR_REACTION)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));
      });
    });
  }
}

module.exports = { startDiscordLogging };

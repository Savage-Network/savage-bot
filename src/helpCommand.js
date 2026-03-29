'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');
const { footer } = require('./embedCopyright');

async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · comandos')
    .setDescription(
      'Bot de suporte, status Minecraft, moderação leve e respostas automáticas.'
    )
    .addFields(
      {
        name: 'Geral',
        value:
          '`/ajuda` — esta mensagem\n' +
          '`/ping` — latência do bot (só você vê)\n' +
          '`/status` — status detalhado do Minecraft\n' +
          '`/minecraft` — endereço e dados rápidos para conectar\n' +
          '`/servidor` — info deste Discord (membros, boost, etc.)\n' +
          '`/stats` — links do [SavageMC STATS](https://stats.savagemc.net/) (opcional: `nick`)\n' +
          '`/botinfo` — uptime, memória e latência do bot',
      },
      {
        name: 'Moderação (canal)',
        value:
          '`/canal bloquear` — lock: @everyone não envia mensagens (precisa **Gerir canais**)\n' +
          '`/canal desbloquear` — unlock: reverte o bloqueio\n' +
          '`/canal limpar` qtdmsgs — apaga até 1000 mensagens recentes (**Gerir mensagens**)',
      },
      {
        name: 'Dev (canaisDEV)',
        value:
          '`/dev voice` — bot entra na call (`devVoiceChannelId` ou `voiceChannelId`)\n' +
          '`/dev anotar` — envia anotação para o teu `idCanal` (só IDs em `canaisDEV`)\n' +
          '`/dev commit` — modal Sistema + Atualizações → `devCommitChannelId`',
      },
      {
        name: 'Automático (config)',
        value:
          '**Autorole** — cargo ao entrar: `autoroleRoleId` em `config.json` (ou `AUTOROLE_ROLE_ID`)\n' +
          '**Palavras** — mensagens que disparam texto: lista `autoResponses` no JSON (ou `AUTO_RESPONSES_JSON`)',
      },
      {
        name: 'Tickets',
        value:
          '`/ticket painel` — publica o painel (staff)\n' +
          '`/ticket fechar` — fecha (motivo opcional)\n' +
          '`/ticket adicionar` / `remover` — membros (staff)\n' +
          '`/ticket assumir` — marca que você assumiu (staff)\n' +
          '`/ticket info` — dados do ticket atual (só você vê)\n' +
          '`/ticket fixar` — fixa boas-vindas no topo (staff)\n' +
          '`/ticket transferir` — passa o ticket para outro staff\n' +
          '`/ticket transcricao` — .txt sem fechar (staff)\n' +
          '`/ticket renomear` — nome do canal (staff)\n' +
          '`/ticket listar` — lista abertos na categoria (staff)\n' +
          '`/ticket nota` — nota visível no ticket (staff)',
      },
      {
        name: 'Painel',
        value:
          'Painel **Central de Atendimento** (container V2 + menu). Categorias: Loja, Bugs, Denúncia, Suporte, Solicitar Tag.',
      }
    )
    .setFooter(footer())
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleHelp };

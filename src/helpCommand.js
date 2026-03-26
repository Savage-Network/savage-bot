'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');

async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · comandos')
    .setDescription('Bot de suporte, estado do servidor Minecraft e voz.')
    .addFields(
      {
        name: 'Geral',
        value:
          '`/ajuda` — esta mensagem\n' +
          '`/ping` — latência do bot (só tu vês)\n' +
          '`/status` — estado detalhado do Minecraft\n' +
          '`/minecraft` — endereço e dados rápidos para ligar\n' +
          '`/servidor` — info deste Discord (membros, boost, etc.)\n' +
          '`/botinfo` — uptime, memória e latência do bot',
      },
      {
        name: 'Tickets',
        value:
          '`/ticket painel` — publica o painel (staff)\n' +
          '`/ticket fechar` — fecha (motivo opcional)\n' +
          '`/ticket adicionar` / `remover` — membros (staff)\n' +
          '`/ticket assumir` — marcas que assumiste (staff)\n' +
          '`/ticket info` — dados do ticket atual (só tu vês)\n' +
          '`/ticket fixar` — fixa boas-vindas no topo (staff)\n' +
          '`/ticket transferir` — passa o ticket a outro staff\n' +
          '`/ticket transcricao` — .txt sem fechar (staff)\n' +
          '`/ticket renomear` — nome do canal (staff)\n' +
          '`/ticket listar` — lista abertos na categoria (staff)\n' +
          '`/ticket nota` — nota visível no ticket (staff)',
      },
      {
        name: 'Painel',
        value:
          'Escolhe **Loja**, **Bugs**, **Denúncia** ou **Suporte**, indica o nick no Minecraft e abre-se um canal privado.',
      }
    )
    .setFooter({ text: 'SavageMC' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleHelp };

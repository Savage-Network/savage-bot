'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');
const { footer } = require('./embedCopyright');

async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · comandos')
    .setDescription(
      'Bot de suporte, status do servidor Minecraft e voz.'
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
          '`/botinfo` — uptime, memória e latência do bot',
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
          'Escolha **Loja**, **Bugs**, **Denúncia** ou **Suporte**, informe o nick no Minecraft e um canal privado será aberto.',
      }
    )
    .setFooter(footer())
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleHelp };

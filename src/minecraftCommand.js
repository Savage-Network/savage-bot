'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const { fetchMcStatus } = require('./mcPresence');

function textoJogadores(online, max) {
  const o = Math.max(0, Math.floor(Number(online)) || 0);
  const m = Math.max(0, Math.floor(Number(max)) || 0);
  if (m > 0) return `${o} / ${m}`;
  return String(o);
}

/** Informação rápida para ligar ao Minecraft (sem duplicar o /status completo). */
async function handleMinecraft(interaction) {
  await interaction.deferReply();

  const host = config.mcHost();
  const addr = host;
  const s = await fetchMcStatus();

  const embed = new EmbedBuilder()
    .setColor(config.ticketEmbedColor())
    .setTitle('SavageMC · ligar ao servidor')
    .setDescription(
      `**Endereço:**\n\`\`\`\n${addr}\n\`\`\`\n` +
        '_Copia o texto acima para o teu cliente Minecraft (Java)._'
    );
  if (s.ok) {
    embed.addFields(
      {
        name: 'Estado',
        value: 'Online',
        inline: true,
      },
      {
        name: 'Jogadores',
        value: textoJogadores(s.online, s.max),
        inline: true,
      },
      {
        name: 'Versão',
        value: String(s.version),
        inline: true,
      }
    );
    if (s.latencyMs != null) {
      embed.setFooter({ text: `Ping lista ~${s.latencyMs} ms` });
    }
  } else {
    embed.addFields({
      name: 'Estado',
      value: 'Não foi possível confirmar (offline ou rede). Usa `/status` para detalhes.',
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleMinecraft };

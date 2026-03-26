'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const { fetchMcStatus } = require('./mcPresence');
const { footer } = require('./embedCopyright');

function textoJogadores(online, max) {
  const o = Math.max(0, Math.floor(Number(online)) || 0);
  const m = Math.max(0, Math.floor(Number(max)) || 0);
  if (m > 0) return `${o} / ${m}`;
  return String(o);
}

async function handleStatus(interaction) {
  await interaction.deferReply();

  const s = await fetchMcStatus();
  const host = config.mcHost();

  if (s.ok) {
    const lines = [
      `**Jogadores:** ${textoJogadores(s.online, s.max)}`,
      `**Versão:** ${s.version}`,
    ];
    if (s.latencyMs != null) lines.push(`**Ping (lista):** ~${s.latencyMs} ms`);
    if (s.protocol != null) lines.push(`**Protocolo:** ${s.protocol}`);
    if (s.motd) lines.push(`**MOTD:** ${s.motd}`);

    let sampleBlock = '';
    if (Array.isArray(s.sample) && s.sample.length > 0) {
      const names = s.sample
        .map((p) => p?.name)
        .filter(Boolean)
        .slice(0, 12);
      if (names.length > 0) {
        sampleBlock = names.map((n) => `\`${n}\``).join(', ');
      }
    }
    if (!sampleBlock) {
      sampleBlock =
        '_Nenhuma amostra (o servidor pode não enviar lista de nomes)._';
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('SavageMC · online')
      .setDescription(lines.join('\n'))
      .addFields({
        name: 'Amostra de jogadores',
        value: sampleBlock.slice(0, 1024),
      })
      .addFields({
        name: 'Endereço',
        value: `\`${host}\``,
      })
      .setFooter(footer())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embedOff = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('SavageMC · offline ou inacessível')
    .setDescription(
      `Não foi possível obter o status em \`${host}\`.\n\n` +
        'Verifique **MC_HOST** e **MC_ENABLE_SRV** (e **MC_PORT** no ambiente do bot se o servidor não usar SRV). ' +
        'Com **DEBUG_MC=1** você vê o erro no log do bot.'
    )
    .setFooter(footer())
    .setTimestamp();

  await interaction.editReply({ embeds: [embedOff] });
}

module.exports = { handleStatus };

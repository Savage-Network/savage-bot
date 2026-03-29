'use strict';

const config = require('./config');
const { fetchMcStatus } = require('./mcPresence');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  V2_FLAGS,
  footerTimestampLine,
} = require('./v2Helpers');

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

    const main =
      '## SavageMC · online\n\n' +
      lines.join('\n') +
      `\n\n**Amostra de jogadores**\n${sampleBlock.slice(0, 3500)}\n\n` +
      `**Endereço** · \`${host}\``;

    const container = new ContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footerTimestampLine(footer().text))
      );

    await interaction.editReply({
      flags: V2_FLAGS.public,
      components: [container],
    });
    return;
  }

  const offText =
    '## SavageMC · offline ou inacessível\n\n' +
    `Não foi possível obter o status em \`${host}\`.\n\n` +
    'Verifique **mcHost**, **mcEnableSRV** e **mcPort** em `config.json` (ou variáveis de ambiente). ' +
    'Com **DEBUG_MC=1** você vê o erro no log do bot.';

  const containerOff = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(offText))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerTimestampLine(footer().text))
    );

  await interaction.editReply({
    flags: V2_FLAGS.public,
    components: [containerOff],
  });
}

module.exports = { handleStatus };

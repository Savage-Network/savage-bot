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

/** Informação rápida para conectar ao Minecraft (sem duplicar o /status completo). */
async function handleMinecraft(interaction) {
  await interaction.deferReply();

  const host = config.mcHost();
  const addr = host;
  const s = await fetchMcStatus();

  let main =
    '## SavageMC · conectar ao servidor\n\n' +
    `**Endereço**\n\`\`\`\n${addr}\n\`\`\`\n` +
    '_Copie o texto acima para o seu cliente Minecraft (Java)._';

  let footLine;
  if (s.ok) {
    main +=
      `\n\n**Status** · Online\n` +
      `**Jogadores** · ${textoJogadores(s.online, s.max)}\n` +
      `**Versão** · ${String(s.version)}`;
    footLine =
      s.latencyMs != null
        ? footerTimestampLine(
            footer({ text: `Ping lista ~${s.latencyMs} ms` }).text
          )
        : footerTimestampLine(footer().text);
  } else {
    main +=
      '\n\n**Status** · Não foi possível confirmar (offline ou rede). Use `/status` para detalhes.';
    footLine = footerTimestampLine(footer().text);
  }

  const container = new ContainerBuilder()
    .setAccentColor(config.ticketEmbedColor())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(main))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footLine));

  await interaction.editReply({
    flags: V2_FLAGS.public,
    components: [container],
  });
}

module.exports = { handleMinecraft };

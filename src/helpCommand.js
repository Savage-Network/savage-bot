'use strict';

const config = require('./config');
const { footer } = require('./embedCopyright');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  V2_FLAGS,
  footerTimestampLine,
} = require('./v2Helpers');

async function handleHelp(interaction) {
  const foot = footerTimestampLine(footer().text);

  const body =
    '## SavageMC · comandos\n\n' +
    'Status Minecraft, assistente de **dev** (`canaisDEV`), moderação leve e respostas automáticas.\n\n' +
    '### Geral\n' +
    '`/ajuda` — esta mensagem\n' +
    '`/ping` — latência do bot (só você vê)\n' +
    '`/status` — status detalhado do Minecraft\n' +
    '`/minecraft` — endereço e dados rápidos para conectar\n' +
    '`/servidor` — info deste Discord (membros, boost, etc.)\n' +
    '`/stats` — links do [SavageMC STATS](https://stats.savagemc.net/) (opcional: `nick`)\n' +
    '`/botinfo` — uptime, memória e latência do bot\n\n' +
    '### Moderação (canal)\n' +
    '`/canal bloquear` — lock: @everyone não envia mensagens (precisa **Gerir canais**)\n' +
    '`/canal desbloquear` — unlock: reverte o bloqueio\n' +
    '`/canal limpar` qtdmsgs — apaga até 1000 mensagens recentes (**Gerir mensagens**)\n\n' +
    '### Dev — assistente (`canaisDEV`)\n' +
    '`/dev diagnostico` — Node, RAM, ping, versões d.js, commit git\n' +
    '`/dev docs` — links úteis (discord.js, API, Components V2)\n' +
    '`/dev guild` — IDs e flags do servidor (debug)\n' +
    '`/dev config` — opções carregadas sem segredos\n' +
    '`/dev voice` — bot na call (`devVoiceChannelId` / `voiceChannelId`)\n' +
    '`/dev anotar` — nota no teu canal (`idCanal` em `canaisDEV`)\n' +
    '`/dev commit` — modal → canal `devCommitChannelId`\n\n' +
    '### Automático (config)\n' +
    '**Autorole** — cargo ao entrar: `autoroleRoleId` em `config.json` (ou `AUTOROLE_ROLE_ID`)\n' +
    '**Palavras** — mensagens que disparam texto: lista `autoResponses` no JSON (ou `AUTO_RESPONSES_JSON`)';

  const container = new ContainerBuilder()
    .setAccentColor(config.embedAccentColor())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(foot));

  await interaction.reply({
    flags: V2_FLAGS.ephemeral,
    components: [container],
  });
}

module.exports = { handleHelp };

'use strict';

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  MessageFlags,
  Events,
} = require('discord.js');
const config = require('./config');
const { startMcPresence, stopMcPresence } = require('./mcPresence');
const { startVoiceWatch, stopVoiceWatch } = require('./voiceStay');
const { handleStatus } = require('./statusCommand');
const { handlePing } = require('./pingCommand');
const { handleHelp } = require('./helpCommand');
const { handleServidor } = require('./serverCommand');
const { handleMinecraft } = require('./minecraftCommand');
const { handleBotInfo } = require('./botInfoCommand');
const { handleCanal } = require('./canalCommand');
const { registerAutoResponses } = require('./autoResponses');
const { handleDev, handleDevCommitModal } = require('./devCommand');
const { handlePteroAutocomplete } = require('./pteroPanel');
const { startPteroStatePoller } = require('./pteroStatePoller');
const { handleStats } = require('./statsCommand');

const BOT_STARTED_AT_MS = Date.now();

const chatCommandHandlers = {
  status: (i) => handleStatus(i),
  ping: (i) => handlePing(i),
  ajuda: (i) => handleHelp(i),
  servidor: (i) => handleServidor(i),
  minecraft: (i) => handleMinecraft(i),
  botinfo: (i) => handleBotInfo(i, BOT_STARTED_AT_MS),
  canal: (i) => handleCanal(i),
  dev: (i) => handleDev(i, { botStartedAtMs: BOT_STARTED_AT_MS }),
  stats: (i) => handleStats(i),
};

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
      Partials.GuildMember,
    ],
  });

  registerAutoResponses(client);

  client.once(Events.ClientReady, async () => {
    console.log(`[SavageMC] Ligado como ${client.user.tag}`);
    startMcPresence(client);
    if (config.voiceEnabled()) startVoiceWatch(client);
    startPteroStatePoller(client);
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'dev') {
          const sub = interaction.options.getSubcommand(false);
          if (sub === 'ptero' || sub === 'ptero-info') {
            return await handlePteroAutocomplete(interaction);
          }
        }
        return;
      }
      if (interaction.isChatInputCommand()) {
        const run = chatCommandHandlers[interaction.commandName];
        if (run) return await run(interaction);
      }
      if (
        interaction.isModalSubmit() &&
        interaction.customId === 'dev_commit_modal'
      ) {
        return await handleDevCommitModal(interaction);
      }
    } catch (err) {
      const code = err?.code ?? err?.rawError?.code;
      // 10062 = interação expirada / token inválido; 40060 = já reconhecida.
      // Situações normais (ex.: componente antigo, duplicado) — não vale log.
      if (code === 10062 || code === 40060) return;
      console.error('[interação]', err);
      const msg = 'Ocorreu um erro ao processar a solicitação.';
      if (interaction.deferred || interaction.replied) {
        await interaction
          .followUp({ content: msg, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      } else {
        await interaction
          .reply({ content: msg, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });

  function shutdown() {
    stopMcPresence();
    if (config.voiceEnabled()) stopVoiceWatch();
    client.destroy();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return client;
}

async function registerSlashCommands() {
  const { SlashCommandBuilder } = require('discord.js');
  const commands = [
    new SlashCommandBuilder()
      .setName('ajuda')
      .setDescription('Lista comandos úteis do SavageMC')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Latência do bot (API e gateway)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Mostra o status do servidor Minecraft SavageMC')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('servidor')
      .setDescription('Informações sobre este servidor Discord')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('minecraft')
      .setDescription('Endereço e dados rápidos para conectar ao SavageMC')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Links para o SavageMC STATS (perfil e site)')
      .addStringOption((o) =>
        o
          .setName('nick')
          .setDescription('Nick no Minecraft — abre o perfil em stats.savagemc.net')
          .setRequired(false)
          .setMaxLength(16)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('botinfo')
      .setDescription('Estatísticas do bot (uptime, memória, latência)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('canal')
      .setDescription('Bloquear, desbloquear ou limpar mensagens neste canal')
      .setDMPermission(false)
      .addSubcommand((s) =>
        s
          .setName('bloquear')
          .setDescription('Impede @everyone de enviar mensagens aqui (lock)')
      )
      .addSubcommand((s) =>
        s
          .setName('desbloquear')
          .setDescription('Permite novamente o envio para @everyone (unlock)')
      )
      .addSubcommand((s) =>
        s
          .setName('limpar')
          .setDescription('Apaga mensagens recentes (máx. 1000; só últimos 14 dias)')
          .addIntegerOption((o) =>
            o
              .setName('qtdmsgs')
              .setDescription('Quantidade de mensagens a apagar (1 a 1000)')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(1000)
          )
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('dev')
      .setDescription(
        'Assistente de desenvolvimento (canaisDEV; Pterodactyl também com pteroRoleId)'
      )
      .setDMPermission(false)
      .addSubcommand((s) =>
        s
          .setName('diagnostico')
          .setDescription(
            'Snapshot técnico: Node, memória, discord.js, git (só você vê)'
          )
      )
      .addSubcommand((s) =>
        s
          .setName('docs')
          .setDescription('Links: discord.js, API Discord, Components V2, Node')
      )
      .addSubcommand((s) =>
        s
          .setName('guild')
          .setDescription('IDs e flags do servidor para debug de permissões')
      )
      .addSubcommand((s) =>
        s
          .setName('config')
          .setDescription('Config não sensível (sem token) carregada pelo bot')
      )
      .addSubcommand((s) =>
        s
          .setName('ptero')
          .setDescription(
            'Pterodactyl: ligar, desligar ou reiniciar servidor (ptero.json)'
          )
          .addStringOption((o) =>
            o
              .setName('acao')
              .setDescription('Ação de energia no painel')
              .setRequired(true)
              .addChoices(
                { name: 'Ligar', value: 'start' },
                { name: 'Desligar', value: 'stop' },
                { name: 'Reiniciar', value: 'restart' }
              )
          )
          .addStringOption((o) =>
            o
              .setName('servidor')
              .setDescription('Nome do servidor (chave em ptero.json → servers)')
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('ptero-lista')
          .setDescription('Pterodactyl: estado e uso (CPU/RAM) de todos os servidores em ptero.json')
      )
      .addSubcommand((s) =>
        s
          .setName('ptero-info')
          .setDescription('Pterodactyl: detalhe de um servidor (estado, CPU, RAM, disco, rede, uptime)')
          .addStringOption((o) =>
            o
              .setName('servidor')
              .setDescription('Nome do servidor (ptero.json → servers)')
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('ptero-ping')
          .setDescription('Pterodactyl: testar ligação ao painel (GET /api/client)')
      )
      .addSubcommand((s) =>
        s
          .setName('projeto')
          .setDescription('Metadados do package.json (nome, versão, dependências, engines)')
      )
      .addSubcommand((s) =>
        s
          .setName('voice')
          .setDescription('Ligar o bot à call de desenvolvimento (registo de sessão)')
      )
      .addSubcommand((s) =>
        s
          .setName('anotar')
          .setDescription('Enviar anotação do dia para o teu canal de dev')
          .addStringOption((o) =>
            o
              .setName('anotacao')
              .setDescription('Texto da anotação')
              .setRequired(true)
              .setMaxLength(4000)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('commit')
          .setDescription('Formulário de commit (Sistema e Atualizações → canal commit)')
      )
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(config.token());
  const clientId = config.clientId();
  const guildId = config.guildId();

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`Comandos registrados no servidor (guild) ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Comandos registrados globalmente (até ~1 h para propagar).');
    }
  } catch (err) {
    const code = err?.code ?? err?.rawError?.code;
    if (code === 50001) {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=0&scope=bot%20applications.commands`;
      console.error(
        '\n[register] Discord API 50001 — Missing Access neste servidor.\n\n' +
          'Causas comuns:\n' +
          '  • O bot **não está** no servidor cujo ID está em `guildId` (config.json ou `GUILD_ID`).\n' +
          '  • O `guildId` está **errado** (confirma: Modo desenvolvedor → servidor → Copiar ID).\n' +
          '  • O convite foi feito **sem** o scope **applications.commands** (só com `bot` não chega para registar slash no guild).\n\n' +
          `Convite com comandos (substitui se precisares de permissões):\n  ${inviteUrl}\n`
      );
    }
    throw err;
  }
}

module.exports = {
  createClient,
  registerSlashCommands,
  getBotStartedAt: () => BOT_STARTED_AT_MS,
};

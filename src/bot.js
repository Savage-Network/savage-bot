'use strict';

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  MessageFlags,
} = require('discord.js');
const config = require('./config');
const { startMcPresence, stopMcPresence } = require('./mcPresence');
const { startVoiceWatch, stopVoiceWatch } = require('./voiceStay');
const tickets = require('./tickets');
const { handleStatus } = require('./statusCommand');
const { handlePing } = require('./pingCommand');
const { handleHelp } = require('./helpCommand');
const { handleServidor } = require('./serverCommand');
const { handleMinecraft } = require('./minecraftCommand');
const { handleBotInfo } = require('./botInfoCommand');
const { startDiscordLogging } = require('./discordLogger');

const BOT_STARTED_AT_MS = Date.now();

const chatCommandHandlers = {
  ticket: (i) => tickets.handleSlash(i),
  status: (i) => handleStatus(i),
  ping: (i) => handlePing(i),
  ajuda: (i) => handleHelp(i),
  servidor: (i) => handleServidor(i),
  minecraft: (i) => handleMinecraft(i),
  botinfo: (i) => handleBotInfo(i, BOT_STARTED_AT_MS),
};

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
      Partials.GuildMember,
      Partials.Reaction,
    ],
  });

  client.commands = new Collection();

  client.once('ready', async () => {
    console.log(`[SavageMC] Ligado como ${client.user.tag}`);
    startDiscordLogging(client);
    startMcPresence(client);
    startVoiceWatch(client);
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const run = chatCommandHandlers[interaction.commandName];
        if (run) return run(interaction);
      }
      if (interaction.isStringSelectMenu()) {
        return tickets.handleSelectMenu(interaction);
      }
      if (interaction.isModalSubmit()) {
        return tickets.handleModalSubmit(interaction);
      }
      if (interaction.isButton()) {
        return tickets.routeComponent(interaction);
      }
    } catch (err) {
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
    stopVoiceWatch();
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
      .setName('botinfo')
      .setDescription('Estatísticas do bot (uptime, memória, latência)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Sistema de suporte SavageMC')
      .addSubcommand((s) =>
        s
          .setName('painel')
          .setDescription('Publicar o painel de abertura de tickets (staff)')
      )
      .addSubcommand((s) =>
        s
          .setName('fechar')
          .setDescription('Fechar o ticket atual e gerar transcrição')
          .addStringOption((o) =>
            o
              .setName('motivo')
              .setDescription('Motivo do fechamento (opcional — logs e DM ao dono)')
              .setRequired(false)
              .setMaxLength(500)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('adicionar')
          .setDescription('Adicionar um membro ao ticket (staff)')
          .addUserOption((o) =>
            o.setName('membro').setDescription('Usuário').setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('remover')
          .setDescription('Remover um membro do ticket (staff)')
          .addUserOption((o) =>
            o.setName('membro').setDescription('Usuário').setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('assumir')
          .setDescription('Staff: marcar que você assumiu este ticket')
      )
      .addSubcommand((s) =>
        s
          .setName('info')
          .setDescription('Mostrar dados deste ticket (só você vê)')
      )
      .addSubcommand((s) =>
        s
          .setName('fixar')
          .setDescription('Staff: fixar a mensagem de boas-vindas no topo')
      )
      .addSubcommand((s) =>
        s
          .setName('transferir')
          .setDescription('Staff: passar a responsabilidade do ticket a outro membro')
          .addUserOption((o) =>
            o
              .setName('staff')
              .setDescription('Membro da equipe que vai assumir')
              .setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('transcricao')
          .setDescription('Staff: transcrição sem fechar o ticket (só você vê)')
      )
      .addSubcommand((s) =>
        s
          .setName('renomear')
          .setDescription('Staff: alterar o nome do canal do ticket')
          .addStringOption((o) =>
            o
              .setName('nome')
              .setDescription('Novo nome (ex.: loja-steve-3-urgente)')
              .setRequired(true)
              .setMaxLength(100)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('listar')
          .setDescription('Staff: listar tickets abertos na categoria')
      )
      .addSubcommand((s) =>
        s
          .setName('nota')
          .setDescription('Staff: publicar uma nota no canal do ticket')
          .addStringOption((o) =>
            o
              .setName('texto')
              .setDescription('Conteúdo da nota')
              .setRequired(true)
              .setMaxLength(1000)
          )
      )
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(config.token());
  const clientId = config.clientId();
  const guildId = config.guildId();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log(`Comandos registrados no servidor (guild) ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Comandos registrados globalmente (até ~1 h para propagar).');
  }
}

module.exports = {
  createClient,
  registerSlashCommands,
  getBotStartedAt: () => BOT_STARTED_AT_MS,
};

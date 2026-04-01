'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const {
  playNext,
  getRadioPlayer,
  AudioPlayerStatus,
  getCurrentTrackData,
  getVolume,
  setVolume,
  resolveRadioVoiceChannel,
  playTrackByFile,
} = require('./radioPlayer');
const { searchTracks, getAllTracks } = require('./musicLibrary');

// --- Emojis Aesthetic/Premium ---
const E = {
  radio: '📻',
  music: '🎵',
  vinyl: '💿',
  play: '▶️',
  stop: '⏹️',
  skip: '⏭️',
  volume: '🔊',
  volumeLow: '🔉',
  list: '📜',
  zap: '⚡',
  star: '⭐',
};

/**
 * Constrói o Embed e os Botões do Painel de Controlo.
 */
function buildRadioPanel() {
  const track = getCurrentTrackData();
  const player = getRadioPlayer();
  const isPlaying = player && player.state.status === AudioPlayerStatus.Playing;
  const vol = Math.round(getVolume() * 100);

  const embed = new EmbedBuilder()
    .setTitle(`${E.radio} Painel de Controlo Savage Radio`)
    .setColor('#5865F2')
    .setTimestamp();

  if (isPlaying && track) {
    embed.setDescription(
      `**${E.music} A tocar agora:**\n\`${track.title}\` — *${track.artist}*\n\n` +
      `**${E.volume} Volume atual:** \`${vol}%\`\n` +
      `**${E.zap} Status:** \`EM REPRODUÇÃO\``
    );
  } else {
    embed.setDescription(
      `${E.stop} **Rádio em pausa ou parada.**\n\n` +
      `**${E.volume} Volume:** \`${vol}%\`\n` +
      `Usa os botões abaixo para controlar.`
    );
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('radio_skip')
      .setEmoji(E.skip)
      .setLabel('Pular')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('radio_stop')
      .setEmoji(E.stop)
      .setLabel('Parar')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('radio_list')
      .setEmoji(E.list)
      .setLabel('Biblioteca')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('radio_vol_down')
      .setEmoji(E.volumeLow)
      .setLabel('-10%')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('radio_vol_up')
      .setEmoji(E.volume)
      .setLabel('+10%')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('radio_refresh')
      .setEmoji('🔄')
      .setLabel('Atualizar')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row1, row2], flags: MessageFlags.Ephemeral };
}

async function handleRadioButtons(interaction) {
  const id = interaction.customId;

  if (id === 'radio_skip') {
    const channel = await resolveRadioVoiceChannel(interaction.client);
    if (!channel) return interaction.reply({ content: 'Erro: canal não configurado.', flags: MessageFlags.Ephemeral });
    await playNext(channel);
    // Delay para dar tempo de atualizar o track data
    setTimeout(async () => {
      await interaction.update(buildRadioPanel()).catch(() => null);
    }, 500);
    return;
  }

  if (id === 'radio_stop') {
    const player = getRadioPlayer();
    if (player) player.stop();
    return await interaction.update(buildRadioPanel());
  }

  if (id === 'radio_vol_up') {
    setVolume(getVolume() + 0.1);
    return await interaction.update(buildRadioPanel());
  }

  if (id === 'radio_vol_down') {
    setVolume(getVolume() - 0.1);
    return await interaction.update(buildRadioPanel());
  }

  if (id === 'radio_refresh') {
    return await interaction.update(buildRadioPanel());
  }

  if (id === 'radio_list') {
    const tracks = getAllTracks();
    const list = tracks.map((t, idx) => `${idx + 1}. **${t.title}** — ${t.artist}`).slice(0, 20).join('\n');
    return await interaction.reply({
      content: `### ${E.list} Músicas Disponíveis\n${list}${tracks.length > 20 ? '\n...e mais!' : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleRadio(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Usa este comando no servidor.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'painel') {
    return await interaction.reply(buildRadioPanel());
  }

  if (subcommand === 'tocar') {
    const query = interaction.options.getString('query', true).trim();
    const tracks = searchTracks(query);
    const exact = tracks.find((t) => t.file === query) || tracks[0];

    if (!exact) {
      return await interaction.reply({
        content: `${E.stop} Música não encontrada na biblioteca local.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = await resolveRadioVoiceChannel(interaction.client);
    if (!channel) return interaction.reply({ content: 'Erro: canal não configurado.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ok = await playTrackByFile(channel, exact);
    if (ok) {
      await interaction.editReply({ content: `${E.play} A tocar agora: **${exact.title}**` });
    } else {
      await interaction.editReply({ content: 'Erro ao tentar reproduzir a música.' });
    }
  }

  if (subcommand === 'pular') {
    const channel = await resolveRadioVoiceChannel(interaction.client);
    if (!channel) return interaction.reply({ content: 'Erro: canal não configurado.', flags: MessageFlags.Ephemeral });
    await playNext(channel);
    return await interaction.reply({ content: `${E.skip} Faixa saltada.`, flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'parar') {
    const player = getRadioPlayer();
    if (player) {
      player.stop();
      return await interaction.reply({ content: `${E.stop} Rádio parada.`, flags: MessageFlags.Ephemeral });
    }
    return await interaction.reply({ content: 'A rádio não está ativa.', flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'biblioteca') {
    const tracks = getAllTracks();
    const list = tracks.slice(0, 25).map((t, i) => `${i + 1}. **${t.title}** — ${t.artist}`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`${E.list} Biblioteca Savage`)
      .setDescription(list)
      .setColor('#00FF00')
      .setFooter({ text: `Total: ${tracks.length} músicas` });
    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'volume') {
    const val = interaction.options.getInteger('valor', true);
    setVolume(val / 100);
    return await interaction.reply({ content: `${E.volume} Volume definido para **${val}%**.`, flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'historico' || subcommand === 'limpar_cache') {
    return await interaction.reply({ content: 'Funcionalidade desativada na nova rádio local.', flags: MessageFlags.Ephemeral });
  }

  return await interaction.reply({ content: 'Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
}

async function handleRadioAutocomplete(interaction) {
  const query = interaction.options.getFocused();
  const results = searchTracks(query).slice(0, 25);
  await interaction.respond(
    results.map((t) => ({ name: `${t.title} — ${t.artist}`.slice(0, 100), value: t.file }))
  );
}

module.exports = {
  handleRadio,
  handleRadioAutocomplete,
  handleRadioButtons,
};

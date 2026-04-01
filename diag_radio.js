/**
 * Diagnostic script: tests Spotify URL resolution end-to-end,
 * without needing to connect to a voice channel.
 * Run: node diag_radio.js
 */
require('dotenv').config();

const { Player, QueryType } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

const PLAYLIST_URL = process.env.DIAG_PLAYLIST || 'https://open.spotify.com/playlist/7kcvJ5wIan9CqDDeeD1gD0?si=0cda966465bc45c9';

// Fake Discord client minimal stub
const fakeClient = {
  user: { id: 'diag-user', bot: true, tag: 'Diag#0000', displayAvatarURL: () => '' },
  guilds: { cache: new Map() },
  channels: { cache: new Map() },
  ws: { ping: 0 },
  on: () => {},
  once: () => {},
  emit: () => {},
  options: { intents: 0 },
  shard: null,
  rest: {},
};

async function run() {
  console.log('=== Diagnóstico do Rádio ===\n');
  console.log('SPOTIFY_CLIENT_ID:', process.env.SPOTIFY_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('SPOTIFY_CLIENT_SECRET:', process.env.SPOTIFY_CLIENT_SECRET ? 'SET' : 'NOT SET');
  console.log('DP_SPOTIFY_CLIENT_ID:', process.env.DP_SPOTIFY_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('DP_SPOTIFY_CLIENT_SECRET:', process.env.DP_SPOTIFY_CLIENT_SECRET ? 'SET' : 'NOT SET');
  console.log('\nPlaylist URL a testar:', PLAYLIST_URL);
  console.log('---');

  // Create player
  let player;
  try {
    player = new Player(fakeClient);
    console.log('✓ Player criado');
  } catch (e) {
    console.error('✗ Falha ao criar Player:', e.message);
    return;
  }

  // Load extractors
  const spotifyOpts = {
    clientId: process.env.SPOTIFY_CLIENT_ID || process.env.DP_SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || process.env.DP_SPOTIFY_CLIENT_SECRET,
  };

  console.log('Spotify opts:', JSON.stringify(spotifyOpts));

  try {
    await player.extractors.loadMulti(DefaultExtractors, {
      'com.discord-player.spotifyextractor': spotifyOpts,
    });
    console.log('✓ Extractors carregados');
    
    // List loaded extractors
    const extractors = [...player.extractors.store.values()];
    console.log('Extractors registados:', extractors.map(e => e.identifier));
  } catch (e) {
    console.error('✗ Falha ao carregar extractors:', e.message);
    return;
  }

  // Test search
  console.log('\n--- Teste de Pesquisa ---');
  try {
    const result = await player.search(PLAYLIST_URL, {
      requestedBy: fakeClient.user,
      searchEngine: QueryType.SPOTIFY_PLAYLIST,
    });

    if (result.isEmpty()) {
      console.error('✗ Pesquisa retornou 0 resultados. Spotify tokens inválidos ou playlist privada?');
      return;
    }

    console.log('✓ Pesquisa bem sucedida!');
    console.log('  Playlist:', result.playlist?.title);
    console.log('  Total de faixas:', result.tracks.length);

    const firstTrack = result.tracks[0];
    console.log('\n--- Primeira Faixa ---');
    console.log('  Título:', firstTrack.title);
    console.log('  Autor:', firstTrack.author);
    console.log('  Duração:', firstTrack.duration);
    console.log('  URL:', firstTrack.url);
    console.log('  Raw URL:', firstTrack.raw?.url);
    console.log('  Extractor:', firstTrack.extractor?.identifier);

    // Test bridge resolution for stream URL
    console.log('\n--- Tentando resolver URL de stream ---');
    try {
      const stream = await firstTrack.extractor?.bridge(firstTrack, firstTrack.extractor);
      if (stream) {
        console.log('✓ Bridge funcionou! Stream URL:', stream?.url?.slice(0, 80) || stream?.stream?.toString().slice(0, 80));
      } else {
        console.log('⚠ Bridge retornou null/undefined (esperado com Spotify puro)');
      }
    } catch (e) {
      console.error('⚠ Bridge erro (pode ser esperado):', e.message);
    }

    console.log('\n=== DIAGNÓSTICO CONCLUÍDO ===');
    console.log('\nSe vês faixas acima, o problema é na ligação de voz/audio pipeline, não na pesquisa Spotify.');
    console.log('Se não vês faixas, verifica os teus SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET.');

  } catch (e) {
    console.error('✗ Pesquisa falhou:', e.message);
    console.error(e.stack);
  }

  process.exit(0);
}

run();

#!/usr/bin/env node

// Test script for metadata enrichment
// Run with: node test-metadata.js

const { MusicMetadataEnricher, LastFmMetadataEnricher, MusicBrainzMetadataEnricher } = require('./src/lib/music-metadata.ts');

async function testMetadataEnrichment() {
  console.log('🎵 Testing Music Metadata Enrichment...\n');

  // Test data
  const testCases = [
    { title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera' },
    { title: 'Hotel California', artist: 'Eagles', album: 'Hotel California' },
    { title: 'Imagine', artist: 'John Lennon', album: 'Imagine' }
  ];

  for (const testCase of testCases) {
    console.log(`Testing: "${testCase.title}" by ${testCase.artist}`);
    console.log('─'.repeat(50));

    // Test Spotify (if configured)
    try {
      const spotifyEnricher = new MusicMetadataEnricher();
      const spotifyResult = await spotifyEnricher.enrichMetadata(
        testCase.title, 
        testCase.artist, 
        testCase.album
      );
      
      if (spotifyResult) {
        console.log('✅ Spotify: Found metadata');
        console.log(`   Title: ${spotifyResult.title}`);
        console.log(`   Artist: ${spotifyResult.artist}`);
        console.log(`   Album: ${spotifyResult.album}`);
        console.log(`   Genres: ${spotifyResult.genres.join(', ')}`);
        console.log(`   Release: ${spotifyResult.releaseDate}`);
        console.log(`   Popularity: ${spotifyResult.popularity}%`);
      } else {
        console.log('❌ Spotify: No metadata found');
      }
    } catch (error) {
      console.log('❌ Spotify: Error -', error.message);
    }

    // Test Last.fm (if configured)
    try {
      const lastfmEnricher = new LastFmMetadataEnricher();
      const lastfmResult = await lastfmEnricher.searchTrack(testCase.title, testCase.artist);
      
      if (lastfmResult) {
        console.log('✅ Last.fm: Found metadata');
        console.log(`   Track: ${lastfmResult.name}`);
        console.log(`   Artist: ${lastfmResult.artist}`);
      } else {
        console.log('❌ Last.fm: No metadata found');
      }
    } catch (error) {
      console.log('❌ Last.fm: Error -', error.message);
    }

    // Test MusicBrainz (always available)
    try {
      const musicbrainzEnricher = new MusicBrainzMetadataEnricher();
      const musicbrainzResult = await musicbrainzEnricher.searchRecording(testCase.title, testCase.artist);
      
      if (musicbrainzResult) {
        console.log('✅ MusicBrainz: Found metadata');
        console.log(`   Recording: ${musicbrainzResult.title}`);
        console.log(`   ID: ${musicbrainzResult.id}`);
      } else {
        console.log('❌ MusicBrainz: No metadata found');
      }
    } catch (error) {
      console.log('❌ MusicBrainz: Error -', error.message);
    }

    console.log('\n');
  }

  console.log('🎯 Test completed!');
  console.log('\nTo get the best results:');
  console.log('1. Set up Spotify API keys (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)');
  console.log('2. Set up Last.fm API key (LASTFM_API_KEY)');
  console.log('3. MusicBrainz works automatically (no setup required)');
}

// Run the test
testMetadataEnrichment().catch(console.error); 
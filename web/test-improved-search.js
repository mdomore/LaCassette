#!/usr/bin/env node

// Test the improved Spotify search
// This simulates what happens when importing a YouTube video

console.log('🎵 Testing Improved Spotify Search...\n');

// Simulate the search process for "Big Smoke by Tash Sultana"
const testTitle = 'Big Smoke (Official Audio)';
const testArtist = 'Tash Sultana';

console.log(`Original: "${testTitle}" by ${testArtist}\n`);

// Clean the title (remove common YouTube suffixes)
const cleanTitle = testTitle
  .replace(/\s*\(Official\s*(Audio|Video|Music\s*Video?)\)/gi, '')
  .replace(/\s*\(Lyrics?\)/gi, '')
  .replace(/\s*\(Audio\)/gi, '')
  .replace(/\s*\(Official\)/gi, '')
  .replace(/\s*\(Music\s*Video\)/gi, '')
  .trim();

console.log(`Cleaned title: "${cleanTitle}"\n`);

// Build search queries (same logic as the improved search)
const searchQueries = [];

// Strategy 1: Artist + Title (most specific)
searchQueries.push(`artist:"${testArtist}" track:"${cleanTitle}"`);

// Strategy 2: Artist + Title (less strict)
searchQueries.push(`${testArtist} ${cleanTitle}`);

// Strategy 3: Title + Artist (alternative order)
searchQueries.push(`${cleanTitle} ${testArtist}`);

// Strategy 4: Just the title (fallback)
searchQueries.push(`track:"${cleanTitle}"`);

// Strategy 5: Clean title without quotes
searchQueries.push(cleanTitle);

console.log('Search strategies to try:');
searchQueries.forEach((query, index) => {
  console.log(`${index + 1}. "${query}"`);
});

console.log('\n🎯 The improved search will:');
console.log('1. Try multiple search strategies');
console.log('2. Get multiple results (limit: 5) instead of just 1');
console.log('3. Score each result for similarity');
console.log('4. Only accept matches with score > 0.7');
console.log('5. Clean titles by removing YouTube suffixes');
console.log('6. Use exact artist matching when possible');

console.log('\n💡 This should prevent wrong matches like "Dreams by Packaday"');
console.log('   and find the correct "Big Smoke by Tash Sultana"'); 
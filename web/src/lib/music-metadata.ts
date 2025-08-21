interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{
    id: string;
    name: string;
    genres?: string[];
  }>;
  album: {
    id: string;
    name: string;
    release_date: string;
    images: Array<{
      url: string;
      width: number;
      height: number;
    }>;
    genres?: string[];
  };
  duration_ms: number;
  popularity: number;
  genres?: string[];
}

interface EnrichedMetadata {
  title: string;
  artist: string;
  album: string;
  releaseDate: string;
  duration: number;
  genres: string[];
  popularity: number;
  spotifyId?: string;
  albumCover?: string;
  artistId?: string;
  albumId?: string;
}

export class MusicMetadataEnricher {
  private spotifyClientId: string;
  private spotifyClientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID || '';
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  }

  /**
   * Get Spotify access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            this.spotifyClientId + ':' + this.spotifyClientSecret
          ).toString('base64')
        },
        body: 'grant_type=client_credentials'
      });

      const data = await response.json();
      
      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        return this.accessToken;
      } else {
        throw new Error('Failed to get Spotify access token');
      }
    } catch (error) {
      console.error('Error getting Spotify token:', error);
      throw new Error('Spotify authentication failed');
    }
  }

  /**
   * Search for a track on Spotify with improved accuracy
   */
  private async searchSpotifyTrack(query: string, originalTitle: string, originalArtist: string): Promise<SpotifyTrack | null> {
    try {
      const token = await this.getAccessToken();
      
      // Try multiple search strategies for better accuracy
      const searchQueries = this.buildSearchQueries(originalTitle, originalArtist);
      
      for (const searchQuery of searchQueries) {
        console.log(`Trying search query: "${searchQuery}"`);
        
        const encodedQuery = encodeURIComponent(searchQuery);
        const response = await fetch(
          `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=5`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          console.log(`Search failed for "${searchQuery}": ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.tracks?.items?.length > 0) {
          // Find the best match using similarity scoring
          const bestMatch = this.findBestMatch(data.tracks.items, originalTitle, originalArtist);
          
          if (bestMatch && bestMatch.score > 0.7) { // Only accept good matches
            console.log(`Found good match: "${bestMatch.track.name}" by ${bestMatch.track.artists[0]?.name} (score: ${bestMatch.score})`);
            
            // Get additional artist and album details
            const enrichedTrack = await this.enrichTrackData(bestMatch.track);
            return enrichedTrack;
          } else if (bestMatch) {
            console.log(`Found match but score too low: "${bestMatch.track.name}" (score: ${bestMatch.score})`);
          }
        }
      }
      
      console.log('No good matches found with any search strategy');
      return null;
      
    } catch (error) {
      console.error('Error searching Spotify:', error);
      return null;
    }
  }

  /**
   * Build multiple search queries to try different strategies
   */
  private buildSearchQueries(title: string, artist: string): string[] {
    const queries: string[] = [];
    
    // Clean the title (remove common YouTube suffixes)
    const cleanTitle = title
      .replace(/\s*\(Official\s*(Audio|Video|Music\s*Video?)\)/gi, '')
      .replace(/\s*\(Lyrics?\)/gi, '')
      .replace(/\s*\(Audio\)/gi, '')
      .replace(/\s*\(Official\)/gi, '')
      .replace(/\s*\(Music\s*Video\)/gi, '')
      .trim();
    
    if (artist && artist !== 'Unknown Artist') {
      // Strategy 1: Artist + Title (most specific)
      queries.push(`artist:"${artist}" track:"${cleanTitle}"`);
      
      // Strategy 2: Artist + Title (less strict)
      queries.push(`${artist} ${cleanTitle}`);
      
      // Strategy 3: Title + Artist (alternative order)
      queries.push(`${cleanTitle} ${artist}`);
      
      // Strategy 4: Try with just the first part of the artist name (in case of long artist names)
      const artistFirstPart = artist.split(' ')[0];
      if (artistFirstPart && artistFirstPart.length > 2) {
        queries.push(`artist:"${artistFirstPart}" track:"${cleanTitle}"`);
        queries.push(`${artistFirstPart} ${cleanTitle}`);
      }
      
      // Strategy 5: Try with just the last part of the artist name (for "Artist & The Band" cases)
      const artistWords = artist.split(' ');
      const artistLastPart = artistWords[artistWords.length - 1];
      if (artistLastPart && artistLastPart.length > 2 && artistLastPart !== artistFirstPart) {
        queries.push(`artist:"${artistLastPart}" track:"${cleanTitle}"`);
        queries.push(`${artistLastPart} ${cleanTitle}`);
      }
    }
    
    // Strategy 6: Just the title (fallback)
    queries.push(`track:"${cleanTitle}"`);
    
    // Strategy 7: Clean title without quotes
    queries.push(cleanTitle);
    
    // Strategy 8: Try with just the first few words of the title (in case of long titles)
    const titleWords = cleanTitle.split(' ');
    if (titleWords.length > 2) {
      const shortTitle = titleWords.slice(0, 2).join(' ');
      queries.push(`track:"${shortTitle}"`);
      queries.push(shortTitle);
    }
    
    return queries;
  }

  /**
   * Find the best match using similarity scoring
   */
  private findBestMatch(tracks: any[], originalTitle: string, originalArtist?: string): { track: any; score: number } | null {
    let bestMatch: { track: any; score: number } | null = null;
    
    for (const track of tracks) {
      const score = this.calculateSimilarityScore(track, originalTitle, originalArtist);
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { track, score };
      }
    }
    
    return bestMatch;
  }

  /**
   * Calculate similarity score between Spotify track and original data
   */
  private calculateSimilarityScore(track: any, originalTitle: string, originalArtist?: string): number {
    let score = 0;
    
    // Clean titles for comparison
    const cleanOriginalTitle = this.cleanTitleForComparison(originalTitle);
    const cleanSpotifyTitle = this.cleanTitleForComparison(track.name);
    
    // Title similarity (most important)
    if (cleanOriginalTitle === cleanSpotifyTitle) {
      score += 0.6; // Exact match
    } else if (cleanSpotifyTitle.includes(cleanOriginalTitle) || cleanOriginalTitle.includes(cleanSpotifyTitle)) {
      score += 0.4; // Partial match
    } else {
      // Calculate word similarity
      const originalWords = cleanOriginalTitle.toLowerCase().split(/\s+/);
      const spotifyWords = cleanSpotifyTitle.toLowerCase().split(/\s+/);
      const commonWords = originalWords.filter(word => spotifyWords.includes(word));
      const wordSimilarity = commonWords.length / Math.max(originalWords.length, spotifyWords.length);
      score += wordSimilarity * 0.3;
    }
    
    // Artist similarity
    if (originalArtist && originalArtist !== 'Unknown Artist') {
      const spotifyArtist = track.artists[0]?.name;
      if (spotifyArtist) {
        if (spotifyArtist.toLowerCase() === originalArtist.toLowerCase()) {
          score += 0.3; // Exact artist match
        } else if (spotifyArtist.toLowerCase().includes(originalArtist.toLowerCase()) || 
                   originalArtist.toLowerCase().includes(spotifyArtist.toLowerCase())) {
          score += 0.2; // Partial artist match
        }
      }
    }
    
    // Popularity bonus (slightly favor popular tracks)
    if (track.popularity > 50) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Clean title for better comparison
   */
  private cleanTitleForComparison(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s*\(official\s*(audio|video|music\s*video?)\)/gi, '')
      .replace(/\s*\(lyrics?\)/gi, '')
      .replace(/\s*\(audio\)/gi, '')
      .replace(/\s*\(official\)/gi, '')
      .replace(/\s*\(music\s*video\)/gi, '')
      .replace(/\s*\(feat\.?\s*[^)]+\)/gi, '')
      .replace(/\s*\(ft\.?\s*[^)]+\)/gi, '')
      .replace(/\s*\(featuring\s*[^)]+\)/gi, '')
      .replace(/\s*\[[^\]]+\]/gi, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Enrich track data with additional details
   */
  private async enrichTrackData(track: SpotifyTrack): Promise<SpotifyTrack> {
    try {
      const token = await this.getAccessToken();
      
      // Get artist details (including genres)
      if (track.artists.length > 0) {
        const artistResponse = await fetch(
          `https://api.spotify.com/v1/artists/${track.artists[0].id}`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
        
        if (artistResponse.ok) {
          const artistData = await artistResponse.json();
          track.artists[0].genres = artistData.genres;
        }
      }

      // Get album details (including genres)
      const albumResponse = await fetch(
        `https://api.spotify.com/v1/albums/${track.album.id}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (albumResponse.ok) {
        const albumData = await albumResponse.json();
        track.album.genres = albumData.genres;
      }

      return track;
    } catch (error) {
      console.error('Error enriching track data:', error);
      return track;
    }
  }

  /**
   * Enrich song metadata using Spotify
   */
  async enrichMetadata(
    title: string, 
    artist?: string, 
    album?: string
  ): Promise<EnrichedMetadata | null> {
    try {
      // Build search query
      let searchQuery = title;
      if (artist && artist !== 'Unknown Artist') {
        searchQuery = `${artist} ${title}`;
      }
      if (album && album !== 'Unknown Album') {
        searchQuery = `${searchQuery} ${album}`;
      }

      console.log(`Searching Spotify for: "${searchQuery}"`);
      
      const spotifyTrack = await this.searchSpotifyTrack(searchQuery, title, artist || 'Unknown Artist');
      
      if (!spotifyTrack) {
        console.log('No Spotify match found');
        return null;
      }

      // Convert to our format
      const enriched: EnrichedMetadata = {
        title: spotifyTrack.name,
        artist: spotifyTrack.artists[0]?.name || 'Unknown Artist',
        album: spotifyTrack.album.name,
        releaseDate: spotifyTrack.album.release_date,
        duration: Math.round(spotifyTrack.duration_ms / 1000),
        genres: [
          ...(spotifyTrack.artists[0]?.genres || []),
          ...(spotifyTrack.album.genres || [])
        ].filter((genre, index, arr) => arr.indexOf(genre) === index), // Remove duplicates
        popularity: spotifyTrack.popularity,
        spotifyId: spotifyTrack.id,
        albumCover: spotifyTrack.album.images[0]?.url,
        artistId: spotifyTrack.artists[0]?.id,
        albumId: spotifyTrack.album.id
      };

      console.log(`Enriched metadata: ${enriched.title} by ${enriched.artist}`);
      return enriched;
      
    } catch (error) {
      console.error('Error enriching metadata:', error);
      return null;
    }
  }

  /**
   * Get similar artists
   */
  async getSimilarArtists(artistId: string): Promise<Array<{id: string, name: string, genres: string[]}>> {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}/related-artists`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.artists.map((artist: any) => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres || []
      }));
      
    } catch (error) {
      console.error('Error getting similar artists:', error);
      return [];
    }
  }

  /**
   * Get artist's top tracks
   */
  async getArtistTopTracks(artistId: string): Promise<Array<{id: string, name: string, album: string}>> {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        album: track.album.name
      }));
      
    } catch (error) {
      console.error('Error getting artist top tracks:', error);
      return [];
    }
  }

  /**
   * Get album tracks
   */
  async getAlbumTracks(albumId: string): Promise<Array<{id: string, name: string, duration: number}>> {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(
        `https://api.spotify.com/v1/albums/${albumId}/tracks`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.items.map((track: any) => ({
        id: track.id,
        name: track.name,
        duration: Math.round(track.duration_ms / 1000)
      }));
      
    } catch (error) {
      console.error('Error getting album tracks:', error);
      return [];
    }
  }
}

// Alternative: Last.fm API (free, no authentication required)
export class LastFmMetadataEnricher {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.LASTFM_API_KEY || '';
  }

  /**
   * Search for track on Last.fm
   */
  async searchTrack(title: string, artist?: string): Promise<any> {
    try {
      let query = `track=${encodeURIComponent(title)}`;
      if (artist && artist !== 'Unknown Artist') {
        query += `&artist=${encodeURIComponent(artist)}`;
      }

      const response = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=track.search&${query}&api_key=${this.apiKey}&format=json`
      );

      if (!response.ok) {
        throw new Error(`Last.fm API error: ${response.status}`);
      }

      const data = await response.json();
      return data.results?.trackmatches?.track?.[0] || null;
      
    } catch (error) {
      console.error('Error searching Last.fm:', error);
      return null;
    }
  }

  /**
   * Get track info with full metadata
   */
  async getTrackInfo(title: string, artist: string): Promise<any> {
    try {
      const response = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&api_key=${this.apiKey}&format=json`
      );

      if (!response.ok) {
        throw new Error(`Last.fm API error: ${response.status}`);
      }

      const data = await response.json();
      return data.track || null;
      
    } catch (error) {
      console.error('Error getting Last.fm track info:', error);
      return null;
    }
  }
}

// Fallback: MusicBrainz API (completely free, no rate limits)
export class MusicBrainzMetadataEnricher {
  /**
   * Search for recording on MusicBrainz
   */
  async searchRecording(title: string, artist?: string): Promise<any> {
    try {
      let query = `query="${encodeURIComponent(title)}"`;
      if (artist && artist !== 'Unknown Artist') {
        query += ` AND artist:"${encodeURIComponent(artist)}"`;
      }

      const response = await fetch(
        `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json`
      );

      if (!response.ok) {
        throw new Error(`MusicBrainz API error: ${response.status}`);
      }

      const data = await response.json();
      return data.recordings?.[0] || null;
      
    } catch (error) {
      console.error('Error searching MusicBrainz:', error);
      return null;
    }
  }

  /**
   * Get recording with full details
   */
  async getRecording(recordingId: string): Promise<any> {
    try {
      const response = await fetch(
        `https://musicbrainz.org/ws/2/recording/${recordingId}?inc=artists+releases+genres&fmt=json`
      );

      if (!response.ok) {
        throw new Error(`MusicBrainz API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error('Error getting MusicBrainz recording:', error);
      return null;
    }
  }
} 
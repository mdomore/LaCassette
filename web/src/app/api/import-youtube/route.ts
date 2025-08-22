import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { YouTubeDownloader } from "@/lib/youtube-downloader";
import { MusicMetadataEnricher, LastFmMetadataEnricher, MusicBrainzMetadataEnricher } from "@/lib/music-metadata";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { readFile, unlink, writeFile } from "fs/promises";
// fetch is available globally in Node.js 18+

export const maxDuration = 300; // 5 minutes on Vercel; adjust for self-hosted

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing or invalid URL" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let filePath: string;
    let title: string;
    let method: string;

    // Try yt-dlp first (more reliable)
    try {
      const result = await downloadWithYtDlp(url);
      filePath = result.filePath;
      title = result.title;
      method = "yt-dlp";
    } catch (ytdlpError) {
      console.log("yt-dlp failed, trying personal system:", ytdlpError);
      
      // Fallback to personal system
      try {
        const downloader = new YouTubeDownloader();
        const result = await downloader.downloadToMp3(url);
        filePath = result.filePath;
        title = result.title;
        method = "personal-system";
      } catch (personalError) {
        console.error("Both systems failed:", { ytdlp: ytdlpError, personal: personalError });
        return NextResponse.json({ 
          error: `Download failed with both systems. yt-dlp: ${ytdlpError instanceof Error ? ytdlpError.message : "Unknown error"}, Personal: ${personalError instanceof Error ? personalError.message : "Unknown error"}` 
        }, { status: 500 });
      }
    }

    // Extract basic metadata from title
    const basicMetadata = extractBasicMetadata(title);
    console.log(`Basic metadata extracted:`, {
      title: basicMetadata.title,
      artist: basicMetadata.artist,
      album: basicMetadata.album
    });

    // Enrich metadata using external APIs
    let enrichedMetadata = null;
    try {
      console.log(`Attempting metadata enrichment with:`, {
        title: basicMetadata.title,
        artist: basicMetadata.artist,
        album: basicMetadata.album
      });
      
      enrichedMetadata = await enrichMetadataWithAPIs(
        basicMetadata.title,
        basicMetadata.artist,
        basicMetadata.album
      );
      
      if (enrichedMetadata) {
        // Validate that the enriched metadata makes sense
        const titleSimilarity = enrichedMetadata.title.toLowerCase().includes(basicMetadata.title.toLowerCase()) ||
                                basicMetadata.title.toLowerCase().includes(enrichedMetadata.title.toLowerCase());
        
        // Also check if the artist matches
        const artistSimilarity = enrichedMetadata.artist.toLowerCase().includes(basicMetadata.artist.toLowerCase()) ||
                                 basicMetadata.artist.toLowerCase().includes(enrichedMetadata.artist.toLowerCase());
        
        if (titleSimilarity && artistSimilarity) {
        } else {
          console.log("Enriched metadata validation failed - title or artist mismatch, using basic metadata");
          console.log(`  Expected: "${basicMetadata.title}" by "${basicMetadata.artist}"`);
          console.log(`  Got: "${enrichedMetadata.title}" by "${enrichedMetadata.artist}"`);
          
          // Create a hybrid metadata object that preserves the original title/artist/album
          // but includes the enriched additional information
          enrichedMetadata = {
            title: basicMetadata.title,
            artist: basicMetadata.artist,
            album: basicMetadata.album,
            releaseDate: enrichedMetadata.releaseDate || "",
            duration: enrichedMetadata.duration || 0,
            genres: enrichedMetadata.genres || [],
            popularity: enrichedMetadata.popularity || 0,
            spotifyId: enrichedMetadata.spotifyId,
            albumCover: enrichedMetadata.albumCover,
            artistId: enrichedMetadata.artistId,
            albumId: enrichedMetadata.albumId
          };
        }
      } else {
        console.log("No enriched metadata found, using basic metadata");
      }
    } catch (error) {
      console.warn("Metadata enrichment failed, using basic metadata:", error);
    }

    // Use enriched metadata if available, otherwise fall back to basic
    const finalMetadata = enrichedMetadata || basicMetadata;

    // Try to get album cover and artist image
    let albumCoverUrl: string | null = null;
    let artistImageUrl: string | null = null;
    
    try {
      // Get album cover
      albumCoverUrl = await getAlbumCover(
        finalMetadata.album,
        finalMetadata.artist,
        user.id
      );
      
      // Get artist image
      artistImageUrl = await getArtistImage(
        finalMetadata.artist,
        user.id
      );
      
    } catch (error) {
      console.warn("Failed to fetch images (this is normal, continuing with import):", error);
      // Don't fail the import if images can't be fetched
    }

    // Generate filename
    const id = randomUUID();
    const fileName = `${finalMetadata.artist.replace(/[^a-z0-9-_ ]/gi, "_")}_${finalMetadata.album.replace(/[^a-z0-9-_ ]/gi, "_")}_${finalMetadata.title.replace(/[^a-z0-9-_ ]/gi, "_")}_${id}.mp3`;

    // Read the MP3 file
    const fileBuffer = await readFile(filePath);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(`${user.id}/${fileName}`, fileBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Store metadata in database
    try {
      const { error: metadataError } = await supabase
        .from('song_metadata')
        .insert({
          user_id: user.id,
          file_name: fileName,
          title: finalMetadata.title,
          artist: finalMetadata.artist,
          album: finalMetadata.album,
          release_date: enrichedMetadata?.releaseDate ? new Date(enrichedMetadata.releaseDate) : null,
          duration: enrichedMetadata?.duration || null,
          genres: enrichedMetadata?.genres || null,
          popularity: enrichedMetadata?.popularity || null,
          spotify_id: enrichedMetadata?.spotifyId || null,
          album_cover_url: albumCoverUrl,
          artist_image_url: artistImageUrl,
          artist_id: enrichedMetadata?.artistId || null,
          album_id: enrichedMetadata?.albumId || null,
          youtube_url: url
        });

      if (metadataError) {
        console.warn("Failed to store metadata in database:", metadataError);
        // Don't fail the import if metadata storage fails
      } else {
        console.log("Metadata stored in database successfully");
      }
    } catch (error) {
      console.warn("Error storing metadata in database:", error);
      // Don't fail the import if metadata storage fails
    }

    // Clean up the temporary MP3 file
    try {
      await unlink(filePath);
      console.log("Temporary file cleaned up");
    } catch (cleanupError) {
      console.warn("Failed to clean up temporary file:", cleanupError);
    }

    console.log(`Successfully uploaded: ${fileName}`);
    return NextResponse.json({ 
      ok: true, 
      fileName, 
      method,
      title: finalMetadata.title,
      artist: finalMetadata.artist,
      album: finalMetadata.album,
      images: {
        albumCover: albumCoverUrl,
        artistImage: artistImageUrl
      },
      metadata: enrichedMetadata ? {
        releaseDate: enrichedMetadata.releaseDate,
        duration: enrichedMetadata.duration,
        genres: enrichedMetadata.genres,
        popularity: enrichedMetadata.popularity,
        spotifyId: enrichedMetadata.spotifyId,
        albumCover: enrichedMetadata.albumCover,
        artistId: enrichedMetadata.artistId,
        albumId: enrichedMetadata.albumId
      } : null
    });
    
  } catch (error) {
    console.error("Import error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Extract basic metadata from YouTube title
 */
function extractBasicMetadata(title: string) {
  console.log(`Extracting metadata from title: "${title}"`);
  
  // Pattern 1: Check for "Song (Year) - Artist" format first (common YouTube pattern)
  const songYearArtistPattern = /^(.+?)\s*\(([^)]+)\)\s*-\s*(.+)$/;
  const songYearArtistMatch = title.match(songYearArtistPattern);
  if (songYearArtistMatch) {
    const songTitle = songYearArtistMatch[1].trim();
    const year = songYearArtistMatch[2].trim();
    const artist = songYearArtistMatch[3].trim();
    
    // Check if the year is actually a year (4 digits or contains year-like text)
    if (/^\d{4}$/.test(year) || year.toLowerCase().includes('remaster') || year.toLowerCase().includes('edition')) {
      const result = {
        artist: artist,
        album: "Unknown Album",
        title: songTitle
      };
      console.log(`Song-Year-Artist pattern: Artist="${result.artist}", Title="${result.title}", Year="${year}"`);
      return result;
    }
  }

  // Pattern 2: "Artist - Song" or "Artist - Album - Song"
  const dashPattern = /^(.+?)\s*-\s*(.+?)(?:\s*-\s*(.+))?$/;
  const dashMatch = title.match(dashPattern);
  if (dashMatch) {
    if (dashMatch[3]) {
      // Artist - Album - Song
      const result = {
        artist: dashMatch[1].trim(),
        album: dashMatch[2].trim(),
        title: dashMatch[3].trim()
      };
      console.log(`Dash pattern (3 parts): Artist="${result.artist}", Album="${result.album}", Title="${result.title}"`);
      return result;
    } else if (dashMatch[2]) {
      // Artist - Song
      const result = {
        artist: dashMatch[1].trim(),
        album: "Unknown Album",
        title: dashMatch[2].trim()
      };
      console.log(`Dash pattern (2 parts): Artist="${result.artist}", Title="${result.title}"`);
      return result;
    }
  }



  // Pattern 2: "Song (Official Video)" or similar - extract just the song title
  const songVideoPattern = /^(.+?)\s*\(([^)]+)\)$/;
  const songVideoMatch = title.match(songVideoPattern);
  if (songVideoMatch) {
    const songTitle = songVideoMatch[1].trim();
    const videoType = songVideoMatch[2].trim();
    
    // Check if this looks like a video type, not artist info
    if (videoType.toLowerCase().includes('official') || 
        videoType.toLowerCase().includes('video') || 
        videoType.toLowerCase().includes('audio') || 
        videoType.toLowerCase().includes('lyrics') ||
        videoType.toLowerCase().includes('remaster')) {
      const result = {
        artist: "Unknown Artist",
        album: "Unknown Album",
        title: songTitle
      };
      console.log(`Song-Video pattern: Title="${result.title}", VideoType="${videoType}"`);
      return result;
    }
  }

  // Pattern 3: "Artist: Song" or "Artist - Song" with quotes
  const artistColonPattern = /^(.+?)\s*[:]\s*(.+)$/;
  const artistColonMatch = title.match(artistColonPattern);
  if (artistColonMatch) {
    const result = {
      artist: artistColonMatch[1].trim(),
      album: "Unknown Album",
      title: artistColonMatch[2].trim()
    };
    console.log(`Artist-Colon pattern: Artist="${result.artist}", Title="${result.title}"`);
    return result;
  }

  // Fallback: treat entire title as song name
  const result = {
    artist: "Unknown Artist",
    album: "Unknown Album",
    title: title.trim()
  };
  console.log(`Fallback pattern: Title="${result.title}"`);
  return result;
}

/**
 * Enrich metadata using multiple APIs with fallback
 */
async function enrichMetadataWithAPIs(
  title: string,
  artist: string,
  album: string
) {
  // Try Spotify first (best quality)
  try {
    const spotifyEnricher = new MusicMetadataEnricher();
    const spotifyMetadata = await spotifyEnricher.enrichMetadata(title, artist, album);
    if (spotifyMetadata) {
      return spotifyMetadata;
    }
  } catch (error) {
    console.log("Spotify enrichment failed, trying Last.fm:", error);
  }

  // Try Last.fm as fallback
  try {
    const lastfmEnricher = new LastFmMetadataEnricher();
    const lastfmTrack = await lastfmEnricher.searchTrack(title, artist);
    if (lastfmTrack) {
      const trackInfo = await lastfmEnricher.getTrackInfo(title, artist);
      if (trackInfo) {
        return {
          title: trackInfo.name || title,
          artist: trackInfo.artist?.name || artist,
          album: trackInfo.album?.title || album,
          releaseDate: trackInfo.wiki?.published || "",
          duration: parseInt(trackInfo.duration || "0"),
          genres: trackInfo.toptags?.tag?.map((t: any) => t.name) || [],
          popularity: 0,
          spotifyId: undefined,
          albumCover: trackInfo.album?.image?.[2]?.['#text'],
          artistId: undefined,
          albumId: undefined
        };
      }
    }
  } catch (error) {
    console.log("Last.fm enrichment failed, trying MusicBrainz:", error);
  }

  // Try MusicBrainz as final fallback
  try {
    const musicbrainzEnricher = new MusicBrainzMetadataEnricher();
    const recording = await musicbrainzEnricher.searchRecording(title, artist);
    if (recording) {
      const fullRecording = await musicbrainzEnricher.getRecording(recording.id);
      if (fullRecording) {
        return {
          title: fullRecording.title || title,
          artist: fullRecording['artist-credit']?.[0]?.name || artist,
          album: fullRecording.releases?.[0]?.title || album,
          releaseDate: fullRecording.releases?.[0]?.date || "",
          duration: Math.round(parseInt(fullRecording.length || "0") / 1000),
          genres: fullRecording.genres?.map((g: any) => g.name) || [],
          popularity: 0,
          spotifyId: undefined,
          albumCover: undefined,
          artistId: fullRecording['artist-credit']?.[0]?.artist?.id,
          albumId: fullRecording.releases?.[0]?.id
        };
      }
    }
  } catch (error) {
    console.log("MusicBrainz enrichment failed:", error);
  }

  return null;
}

/**
 * Download and store image from URL
 */
async function downloadAndStoreImage(
  imageUrl: string, 
  userId: string, 
  type: 'album' | 'artist' | 'song',
  identifier: string
): Promise<string | null> {
  try {
    console.log(`Downloading ${type} image from: ${imageUrl}`);
    
    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    
    // Determine file extension from URL or content-type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : 
                     contentType.includes('webp') ? 'webp' : 'jpg';
    
    // Generate filename
    const imageId = randomUUID();
    const imageFileName = `${type}_${identifier}_${imageId}.${extension}`;
    
    // Store the image path instead of a signed URL (since signed URLs expire)
    // We'll create a separate endpoint to generate fresh signed URLs when needed
    const imagePath = `${userId}/images/${imageFileName}`;
    
    // Upload to Supabase Storage
    const supabase = await createSupabaseServerClient();
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(imagePath, buffer, {
        contentType: contentType,
        upsert: true,
        cacheControl: '3600',
      });
    
    if (uploadError) {
      console.error(`Failed to upload ${type} image:`, uploadError);
      return null;
    }
    
    console.log(`Successfully stored ${type} image at path: ${imagePath}`);
    return imagePath;
    
  } catch (error) {
    console.error(`Error downloading ${type} image:`, error);
    return null;
  }
}

/**
 * Try to get album cover from multiple sources
 */
async function getAlbumCover(
  albumName: string,
  artistName: string,
  userId: string
): Promise<string | null> {
  try {
    // Try Spotify first - search for artist directly, not through track metadata
    const spotifyEnricher = new MusicMetadataEnricher();
    const token = await spotifyEnricher['getAccessToken']();
    
    // Search for the artist directly
    const artistResponse = await fetch(
      `https://api.spotify.com/v1/search?q=artist:"${encodeURIComponent(artistName)}"&type=artist&limit=1`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    if (artistResponse.ok) {
      const artistData = await artistResponse.json();
      if (artistData.artists?.items?.[0]?.id) {
        const artistId = artistData.artists.items[0].id;
        
        // Get artist's top tracks to find album covers
        const tracksResponse = await fetch(
          `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
        
        if (tracksResponse.ok) {
          const tracksData = await tracksResponse.json();
          // Look for a track that might have the album we're looking for
          const trackWithAlbum = tracksData.tracks?.find((track: any) => 
            track.album?.name?.toLowerCase().includes(albumName.toLowerCase()) ||
            albumName.toLowerCase().includes(track.album?.name?.toLowerCase())
          );
          
          if (trackWithAlbum?.album?.images?.[0]?.url) {
            const storedUrl = await downloadAndStoreImage(
              trackWithAlbum.album.images[0].url,
              userId,
              'album',
              `${artistName}_${albumName}`.replace(/[^a-z0-9-_ ]/gi, "_")
            );
            if (storedUrl) return storedUrl;
          }
        }
      }
    }
    
    // Try Last.fm as fallback
    const lastfmEnricher = new LastFmMetadataEnricher();
    const trackInfo = await lastfmEnricher.getTrackInfo("", artistName);
    
    if (trackInfo?.album?.image?.[2]?.['#text']) {
      const storedUrl = await downloadAndStoreImage(
        trackInfo.album.image[2]['#text'],
        userId,
        'album',
        `${artistName}_${albumName}`.replace(/[^a-z0-9-_ ]/gi, "_")
      );
      if (storedUrl) return storedUrl;
    }
    
    // Try MusicBrainz as final fallback
    const musicbrainzEnricher = new MusicBrainzMetadataEnricher();
    const recording = await musicbrainzEnricher.searchRecording("", artistName);
    
    if (recording) {
      const fullRecording = await musicbrainzEnricher.getRecording(recording.id);
      if (fullRecording?.releases?.[0]?.id) {
        // MusicBrainz doesn't provide direct image URLs, but we could implement cover art lookup
        // For now, return null and use placeholder
        console.log("MusicBrainz album found but no direct image URL available");
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error getting album cover:", error);
    return null;
  }
}

/**
 * Try to get artist image from multiple sources
 */
async function getArtistImage(
  artistName: string,
  userId: string
): Promise<string | null> {
  try {
    // Try Spotify first - search for artist directly
    const spotifyEnricher = new MusicMetadataEnricher();
    const token = await spotifyEnricher['getAccessToken']();
    
    // Search for the artist directly
    const artistResponse = await fetch(
      `https://api.spotify.com/v1/search?q=artist:"${encodeURIComponent(artistName)}"&type=artist&limit=1`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    if (artistResponse.ok) {
      const artistData = await artistResponse.json();
      if (artistData.artists?.items?.[0]?.images?.[0]?.url) {
        const storedUrl = await downloadAndStoreImage(
          artistData.artists.items[0].images[0].url,
          userId,
          'artist',
          artistName.replace(/[^a-z0-9-_ ]/gi, "_")
        );
        if (storedUrl) return storedUrl;
      }
    }
    
    // Try Last.fm as fallback
    const lastfmEnricher = new LastFmMetadataEnricher();
    const trackInfo = await lastfmEnricher.getTrackInfo("", artistName);
    
    if (trackInfo?.artist?.image?.[2]?.['#text']) {
      const storedUrl = await downloadAndStoreImage(
        trackInfo.artist.image[2]['#text'],
        userId,
        'artist',
        artistName.replace(/[^a-z0-9-_ ]/gi, "_")
      );
      if (storedUrl) return storedUrl;
    }
    
    return null;
  } catch (error) {
    console.error("Error getting artist image:", error);
    return null;
  }
}

async function downloadWithYtDlp(url: string): Promise<{ filePath: string; title: string }> {
  // Check if yt-dlp is available
  try {
    const { execSync } = require("child_process");
    execSync("which yt-dlp", { stdio: "ignore" });
  } catch (error) {
    throw new Error("yt-dlp is not available. Please install yt-dlp for downloads: brew install yt-dlp");
  }

  const tempId = randomUUID();
  const outputPath = join(tmpdir(), `${tempId}.mp3`);

  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", [
      "-x", // Extract audio
      "--audio-format", "mp3",
      "--audio-quality", "128K",
      "-o", outputPath,
      url
    ]);

    let stderrData = "";
    ytdlp.stderr.on("data", (data) => {
      stderrData += data.toString();
      console.log("yt-dlp:", data.toString());
    });

    ytdlp.on("close", (code) => {
      if (code === 0) {
        // Get the title
        try {
          const { execSync } = require("child_process");
          const title = execSync(`yt-dlp --no-playlist --print title "${url}"`, { encoding: "utf8" }).trim();
          resolve({
            filePath: outputPath,
            title: title || `Video_${tempId}`
          });
        } catch (error) {
          resolve({
            filePath: outputPath,
            title: `Video_${tempId}`
          });
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}. Error: ${stderrData}`));
      }
    });

    ytdlp.on("error", reject);
  });
}

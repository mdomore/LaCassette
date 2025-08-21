import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, unlink, readFile } from "fs/promises";

interface VideoInfo {
  title: string;
  duration: string;
  formats: VideoFormat[];
}

interface VideoFormat {
  url: string;
  quality: string;
  mimeType: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

export class YouTubeDownloader {
  private ffmpegPath: string;

  constructor(ffmpegPath: string = "/opt/homebrew/bin/ffmpeg") {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Fetch video page and extract stream information
   */
  private async fetchVideoPage(videoId: string): Promise<VideoInfo> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Check if curl is available
    try {
      const { execSync } = require("child_process");
      execSync("which curl", { stdio: "ignore" });
    } catch (error) {
      throw new Error("curl is not available. Please install curl or use an alternative method.");
    }
    
    // Use curl to fetch the page with proper headers
    const curlProcess = spawn("curl", [
      "-s", // Silent mode
      "-L", // Follow redirects
      "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "-H", "Accept-Language: en-US,en;q=0.5",
      "-H", "Accept-Encoding: gzip, deflate",
      "-H", "DNT: 1",
      "-H", "Connection: keep-alive",
      "-H", "Upgrade-Insecure-Requests: 1",
      url
    ]);

    const html = await new Promise<string>((resolve, reject) => {
      let data = "";
      curlProcess.stdout.on("data", (chunk) => {
        data += chunk.toString();
      });
      curlProcess.on("close", (code) => {
        if (code === 0) {
          resolve(data);
        } else {
          reject(new Error(`Curl failed with code ${code}`));
        }
      });
      curlProcess.on("error", reject);
    });

    return this.parseVideoPage(html, videoId);
  }

  /**
   * Parse the YouTube page HTML to extract video information
   */
  private parseVideoPage(html: string, videoId: string): VideoInfo {
    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(" - YouTube", "") : `Video_${videoId}`;

    console.log(`Extracted title: ${title}`);

    // Try multiple patterns to find video data
    let playerResponse = null;
    
    // Pattern 1: ytInitialPlayerResponse
    const ytInitialMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (ytInitialMatch) {
      try {
        playerResponse = JSON.parse(ytInitialMatch[1]);
        console.log("Found ytInitialPlayerResponse");
      } catch (error) {
        console.log("Failed to parse ytInitialPlayerResponse:", error);
      }
    }

    // Pattern 2: ytInitialData
    if (!playerResponse) {
      const ytInitialDataMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
      if (ytInitialDataMatch) {
        try {
          const initialData = JSON.parse(ytInitialDataMatch[1]);
          // Navigate through the data structure to find video info
          if (initialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents) {
            for (const content of initialData.contents.twoColumnWatchNextResults.results.results.contents) {
              if (content.videoPrimaryInfoRenderer) {
                console.log("Found video info in ytInitialData");
                // Extract basic info from this structure
                playerResponse = {
                  videoDetails: {
                    title: content.videoPrimaryInfoRenderer.title?.runs?.[0]?.text || title,
                    lengthSeconds: "0"
                  },
                  streamingData: {
                    formats: [],
                    adaptiveFormats: []
                  }
                };
                break;
              }
            }
          }
        } catch (error) {
          console.log("Failed to parse ytInitialData:", error);
        }
      }
    }

    // Pattern 3: Look for embedded JSON data in script tags
    if (!playerResponse) {
      const scriptMatches = html.match(/<script[^>]*>([^<]+)<\/script>/g);
      if (scriptMatches) {
        for (const script of scriptMatches) {
          // Look for any JSON that might contain video info
          const jsonMatches = script.match(/\{[^{}]*"videoId"[^{}]*\}/g);
          if (jsonMatches) {
            for (const jsonStr of jsonMatches) {
              try {
                const jsonData = JSON.parse(jsonStr);
                if (jsonData.videoId === videoId) {
                  console.log("Found video info in script tag");
                  playerResponse = {
                    videoDetails: {
                      title: jsonData.title || title,
                      lengthSeconds: jsonData.lengthSeconds || "0"
                    },
                    streamingData: {
                      formats: [],
                      adaptiveFormats: []
                    }
                  };
                  break;
                }
              } catch (error) {
                // Continue to next match
              }
            }
            if (playerResponse) break;
          }
        }
      }
    }

    // Pattern 4: Look for video info in meta tags
    if (!playerResponse) {
      const metaTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
      const metaDescription = html.match(/<meta property="og:description" content="([^"]+)"/);
      
      if (metaTitle || metaDescription) {
        console.log("Found video info in meta tags");
        playerResponse = {
          videoDetails: {
            title: metaTitle ? metaTitle[1] : title,
            lengthSeconds: "0"
          },
          streamingData: {
            formats: [],
            adaptiveFormats: []
          }
        };
      }
    }

    if (!playerResponse) {
      console.log("HTML content preview (first 1000 chars):", html.substring(0, 1000));
      console.log("HTML content preview (last 1000 chars):", html.substring(html.length - 1000));
      throw new Error("Could not extract video data from page. YouTube may have changed their page structure.");
    }

    // Extract streaming data
    const streamingData = playerResponse?.streamingData;
    if (!streamingData) {
      console.log("No streaming data found, creating minimal format");
      // Create a minimal format for testing
      const formats: VideoFormat[] = [{
        url: `https://www.youtube.com/watch?v=${videoId}`,
        quality: "default",
        mimeType: "video/mp4",
        hasAudio: true,
        hasVideo: false
      }];

      return {
        title,
        duration: playerResponse.videoDetails?.lengthSeconds || "0",
        formats
      };
    }

    const formats: VideoFormat[] = [];

    // Add adaptive formats (usually better quality)
    if (streamingData.adaptiveFormats) {
      for (const format of streamingData.adaptiveFormats) {
        if (format.url || format.signatureCipher) {
          formats.push({
            url: format.url || this.decryptSignature(format.signatureCipher),
            quality: format.qualityLabel || format.quality || "unknown",
            mimeType: format.mimeType || "unknown",
            hasAudio: format.hasAudio || false,
            hasVideo: format.hasVideo || false
          });
        }
      }
    }

    // Add regular formats
    if (streamingData.formats) {
      for (const format of streamingData.formats) {
        if (format.url || format.signatureCipher) {
          formats.push({
            url: format.url || this.decryptSignature(format.signatureCipher),
            quality: format.qualityLabel || format.quality || "unknown",
            mimeType: format.mimeType || "unknown",
            hasAudio: format.hasAudio || false,
            hasVideo: format.hasVideo || false
          });
        }
      }
    }

    if (formats.length === 0) {
      console.log("No formats found, creating fallback format");
      // Create a fallback format
      formats.push({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        quality: "fallback",
        mimeType: "video/mp4",
        hasAudio: true,
        hasVideo: false
      });
    }

    // Extract duration
    const duration = playerResponse?.videoDetails?.lengthSeconds || "0";

    console.log(`Found ${formats.length} formats`);
    formats.forEach((format, index) => {
      console.log(`Format ${index}: ${format.quality} - ${format.mimeType} - Audio:${format.hasAudio} Video:${format.hasVideo}`);
    });

    return {
      title,
      duration,
      formats
    };
  }

  /**
   * Decrypt YouTube signature (simplified version)
   */
  private decryptSignature(signatureCipher: string): string {
    // This is a simplified version - YouTube's actual signature decryption is complex
    // For now, we'll try to extract the URL directly
    const urlMatch = signatureCipher.match(/url=([^&]+)/);
    if (urlMatch) {
      return decodeURIComponent(urlMatch[1]);
    }
    throw new Error("Could not decrypt signature");
  }

  /**
   * Download and convert video to MP3
   */
  async downloadToMp3(youtubeUrl: string): Promise<{ filePath: string; title: string }> {
    const videoId = this.extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    console.log(`Fetching video info for: ${videoId}`);
    const videoInfo = await this.fetchVideoPage(videoId);
    
    console.log(`Video title: ${videoInfo.title}`);
    console.log(`Available formats: ${videoInfo.formats.length}`);

    // Find the best audio-only format
    const audioFormats = videoInfo.formats.filter(f => f.hasAudio && !f.hasVideo);
    if (audioFormats.length === 0) {
      console.log("No audio-only formats found, trying any format with audio");
      const anyAudioFormats = videoInfo.formats.filter(f => f.hasAudio);
      if (anyAudioFormats.length === 0) {
        console.log("No audio formats found, trying fallback download method");
        return this.fallbackDownload(youtubeUrl, videoInfo.title);
      }
      audioFormats.push(...anyAudioFormats);
    }

    // Sort by quality (prefer higher quality)
    audioFormats.sort((a, b) => {
      const qualityA = parseInt(a.quality) || 0;
      const qualityB = parseInt(b.quality) || 0;
      return qualityB - qualityA;
    });

    const bestAudioFormat = audioFormats[0];
    console.log(`Selected format: ${bestAudioFormat.quality} (${bestAudioFormat.mimeType})`);

    // Check if we have a direct URL or need to use fallback
    if (bestAudioFormat.url === `https://www.youtube.com/watch?v=${videoId}`) {
      console.log("Using fallback download method (no direct stream URL)");
      return this.fallbackDownload(youtubeUrl, videoInfo.title);
    }

    // Create temporary file paths
    const tempId = randomUUID();
    const tempAudioPath = join(tmpdir(), `${tempId}_audio`);
    const outputPath = join(tmpdir(), `${tempId}.mp3`);

    try {
      // Download audio using FFmpeg
      await this.downloadWithFFmpeg(bestAudioFormat.url, tempAudioPath);
      
      // Convert to MP3
      await this.convertToMp3(tempAudioPath, outputPath);
      
      // Clean up temporary audio file
      try {
        await unlink(tempAudioPath);
      } catch (error) {
        console.warn("Failed to clean up temporary audio file:", error);
      }

      return {
        filePath: outputPath,
        title: videoInfo.title
      };
    } catch (error) {
      console.log("Direct download failed, trying fallback:", error);
      // Clean up on error
      try {
        await unlink(tempAudioPath);
        await unlink(outputPath);
      } catch (cleanupError) {
        console.warn("Failed to clean up files on error:", cleanupError);
      }
      
      // Try fallback method
      return this.fallbackDownload(youtubeUrl, videoInfo.title);
    }
  }

  /**
   * Fallback download method using yt-dlp if available
   */
  private async fallbackDownload(youtubeUrl: string, title: string): Promise<{ filePath: string; title: string }> {
    console.log("Attempting fallback download with yt-dlp");
    
    // Check if yt-dlp is available
    try {
      const { execSync } = require("child_process");
      execSync("which yt-dlp", { stdio: "ignore" });
    } catch (error) {
      throw new Error("yt-dlp is not available. Please install yt-dlp for fallback downloads: brew install yt-dlp");
    }

    const tempId = randomUUID();
    const outputPath = join(tmpdir(), `${tempId}.mp3`);

    return new Promise((resolve, reject) => {
      const ytdlp = spawn("yt-dlp", [
        "-x", // Extract audio
        "--audio-format", "mp3",
        "--audio-quality", "128K",
        "-o", outputPath,
        youtubeUrl
      ]);

      ytdlp.stderr.on("data", (data) => {
        console.log("yt-dlp:", data.toString());
      });

      ytdlp.on("close", (code) => {
        if (code === 0) {
          console.log("yt-dlp download successful");
          resolve({
            filePath: outputPath,
            title: title
          });
        } else {
          reject(new Error(`yt-dlp failed with code ${code}`));
        }
      });

      ytdlp.on("error", reject);
    });
  }

  /**
   * Download audio using FFmpeg
   */
  private async downloadWithFFmpeg(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, [
        "-i", url,
        "-c", "copy",
        "-y", // Overwrite output file
        outputPath
      ]);

      ffmpeg.stderr.on("data", (data) => {
        console.log("FFmpeg:", data.toString());
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg download failed with code ${code}`));
        }
      });

      ffmpeg.on("error", reject);
    });
  }

  /**
   * Convert audio to MP3 using FFmpeg
   */
  private async convertToMp3(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, [
        "-i", inputPath,
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        "-y", // Overwrite output file
        outputPath
      ]);

      ffmpeg.stderr.on("data", (data) => {
        console.log("FFmpeg convert:", data.toString());
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg conversion failed with code ${code}`));
        }
      });

      ffmpeg.on("error", reject);
    });
  }

  /**
   * Read the final MP3 file as a buffer
   */
  async readMp3File(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  /**
   * Clean up the MP3 file
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      console.warn("Failed to clean up MP3 file:", error);
    }
  }
} 
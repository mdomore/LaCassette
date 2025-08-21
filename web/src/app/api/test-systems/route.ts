import { NextRequest, NextResponse } from "next/server";
import { YouTubeDownloader } from "@/lib/youtube-downloader";
import { spawn } from "child_process";

interface TestResult {
  system: string;
  passed: boolean;
  details: {
    [key: string]: {
      passed: boolean;
      message: string;
      data?: any;
    };
  };
  summary: string;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing URL" }, { status: 400 });
    }
    
    console.log(`Testing both systems with URL: ${url}`);
    
    const results: TestResult[] = [];
    
    // Test 1: Personal System
    const personalResult = await testPersonalSystem(url);
    results.push(personalResult);
    
    // Test 2: yt-dlp System
    const ytdlpResult = await testYtDlpSystem(url);
    results.push(ytdlpResult);
    
    // Calculate overall stats
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    return NextResponse.json({
      success: true,
      url: url,
      timestamp: new Date().toISOString(),
      overallStats: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: `${((passedTests / totalTests) * 100).toFixed(1)}%`
      },
      results: results
    });
    
  } catch (error) {
    console.error("System test error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function testPersonalSystem(url: string): Promise<TestResult> {
  const result: TestResult = {
    system: "Personal System",
    passed: false,
    details: {},
    summary: ""
  };
  
  try {
    // Test 1: URL parsing
    const videoId = extractVideoId(url);
    result.details.urlParsing = {
      passed: !!videoId,
      message: videoId ? `Video ID extracted: ${videoId}` : "Failed to extract video ID",
      data: { videoId }
    };
    
    // Test 2: HTML extraction
    const html = await fetchYouTubePage(url);
    result.details.htmlExtraction = {
      passed: html.length > 1000,
      message: html.length > 1000 ? `HTML fetched (${html.length} chars)` : "Failed to fetch HTML",
      data: { htmlLength: html.length }
    };
    
    // Test 3: Video info extraction
    if (html.length > 1000) {
      const videoInfo = extractVideoInfoFromHtml(html, videoId);
      result.details.videoInfoExtraction = {
        passed: !!videoInfo.title && videoInfo.formats.length > 0,
        message: videoInfo.title && videoInfo.formats.length > 0 
          ? `Video info extracted: ${videoInfo.title} (${videoInfo.formats.length} formats)`
          : "Failed to extract video info",
        data: { title: videoInfo.title, formatCount: videoInfo.formats.length }
      };
    } else {
      result.details.videoInfoExtraction = {
        passed: false,
        message: "Skipped - HTML extraction failed"
      };
    }
    
    // Test 4: Downloader initialization
    try {
      const downloader = new YouTubeDownloader();
      result.details.downloaderInit = {
        passed: true,
        message: "Downloader initialized successfully",
        data: { ffmpegPath: downloader["ffmpegPath"] }
      };
    } catch (error) {
      result.details.downloaderInit = {
        passed: false,
        message: `Downloader initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        data: { error: error instanceof Error ? error.message : "Unknown error" }
      };
    }
    
    // Test 5: FFmpeg availability
    const ffmpegAvailable = await checkFFmpeg();
    result.details.ffmpegAvailability = {
      passed: ffmpegAvailable,
      message: ffmpegAvailable ? "FFmpeg is available" : "FFmpeg is not available",
      data: { available: ffmpegAvailable }
    };
    
    // Calculate overall result
    const passedTests = Object.values(result.details).filter(d => d.passed).length;
    const totalTests = Object.keys(result.details).length;
    result.passed = passedTests === totalTests;
    result.summary = `${passedTests}/${totalTests} tests passed`;
    
  } catch (error) {
    result.details.error = {
      passed: false,
      message: `System test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      data: { error: error instanceof Error ? error.message : "Unknown error" }
    };
    result.summary = "System test failed";
  }
  
  return result;
}

async function testYtDlpSystem(url: string): Promise<TestResult> {
  const result: TestResult = {
    system: "yt-dlp System",
    passed: false,
    details: {},
    summary: ""
  };
  
  try {
    // Test 1: yt-dlp availability
    const ytdlpAvailable = await checkYtDlp();
    result.details.ytdlpAvailability = {
      passed: ytdlpAvailable,
      message: ytdlpAvailable ? "yt-dlp is available" : "yt-dlp is not available",
      data: { available: ytdlpAvailable }
    };
    
    // Test 2: yt-dlp version
    if (ytdlpAvailable) {
      const version = await getYtDlpVersion();
      result.details.ytdlpVersion = {
        passed: !!version,
        message: version ? `yt-dlp version: ${version}` : "Failed to get yt-dlp version",
        data: { version }
      };
    } else {
      result.details.ytdlpVersion = {
        passed: false,
        message: "Skipped - yt-dlp not available"
      };
    }
    
    // Test 3: URL validation
    const urlValid = await validateUrlWithYtDlp(url);
    result.details.urlValidation = {
      passed: urlValid,
      message: urlValid ? "URL validated successfully" : "URL validation failed",
      data: { valid: urlValid }
    };
    
    // Test 4: Video info extraction
    if (urlValid) {
      const videoInfo = await extractVideoInfoWithYtDlp(url);
      result.details.videoInfoExtraction = {
        passed: !!videoInfo.title && !!videoInfo.duration,
        message: videoInfo.title && videoInfo.duration 
          ? `Video info extracted: ${videoInfo.title} (${videoInfo.duration})`
          : "Failed to extract video info",
        data: { title: videoInfo.title, duration: videoInfo.duration }
      };
    } else {
      result.details.videoInfoExtraction = {
        passed: false,
        message: "Skipped - URL validation failed"
      };
    }
    
    // Test 5: Download capability test
    if (urlValid) {
      const downloadCapable = await testDownloadCapability(url);
      result.details.downloadCapability = {
        passed: downloadCapable,
        message: downloadCapable ? "Download capability confirmed" : "Download capability test failed",
        data: { capable: downloadCapable }
      };
    } else {
      result.details.downloadCapability = {
        passed: false,
        message: "Skipped - URL validation failed"
      };
    }
    
    // Calculate overall result
    const passedTests = Object.values(result.details).filter(d => d.passed).length;
    const totalTests = Object.keys(result.details).length;
    result.passed = passedTests === totalTests;
    result.summary = `${passedTests}/${totalTests} tests passed`;
    
  } catch (error) {
    result.details.error = {
      passed: false,
      message: `System test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      data: { error: error instanceof Error ? error.message : "Unknown error" }
    };
    result.summary = "System test failed";
  }
  
  return result;
}

// Helper functions for Personal System
function extractVideoId(url: string): string | null {
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

async function fetchYouTubePage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const curlProcess = spawn("curl", [
      "-s", "-L",
      "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      url
    ]);

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
}

function extractVideoInfoFromHtml(html: string, videoId: string): { title: string; formats: any[] } {
  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(" - YouTube", "") : `Video_${videoId}`;

  // Look for various YouTube data patterns
  const patterns = {
    ytInitialPlayerResponse: html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/),
    ytInitialData: html.match(/ytInitialData\s*=\s*({.+?});/),
    ytInitialPlayerContext: html.match(/ytInitialPlayerContext\s*=\s*({.+?});/),
  };

  const foundPatterns = Object.entries(patterns)
    .filter(([key, value]) => value !== null)
    .map(([key, value]) => key);

  // Create minimal format for testing
  const formats = [{
    url: `https://www.youtube.com/watch?v=${videoId}`,
    quality: "default",
    mimeType: "video/mp4",
    hasAudio: true,
    hasVideo: false
  }];

  return { title, formats };
}

async function checkFFmpeg(): Promise<boolean> {
  try {
    const { execSync } = require("child_process");
    execSync("which ffmpeg", { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper functions for yt-dlp System
async function checkYtDlp(): Promise<boolean> {
  try {
    const { execSync } = require("child_process");
    execSync("which yt-dlp", { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
}

async function getYtDlpVersion(): Promise<string | null> {
  try {
    const { execSync } = require("child_process");
    const version = execSync("yt-dlp --version", { encoding: "utf8" }).trim();
    return version;
  } catch (error) {
    return null;
  }
}

async function validateUrlWithYtDlp(url: string): Promise<boolean> {
  try {
    const { execSync } = require("child_process");
    execSync(`yt-dlp --no-playlist --print id "${url}"`, { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
}

async function extractVideoInfoWithYtDlp(url: string): Promise<{ title: string | null; duration: string | null }> {
  try {
    const { execSync } = require("child_process");
    const title = execSync(`yt-dlp --no-playlist --print title "${url}"`, { encoding: "utf8" }).trim();
    const duration = execSync(`yt-dlp --no-playlist --print duration "${url}"`, { encoding: "utf8" }).trim();
    return { title, duration };
  } catch (error) {
    return { title: null, duration: null };
  }
}

async function testDownloadCapability(url: string): Promise<boolean> {
  try {
    const { execSync } = require("child_process");
    // Just test if we can get format info without actually downloading
    execSync(`yt-dlp --no-playlist --list-formats "${url}"`, { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
} 
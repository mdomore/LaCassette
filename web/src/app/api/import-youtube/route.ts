import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath as string);

export const maxDuration = 300; // 5 minutes on Vercel; adjust for self-hosted

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !ytdl.validateURL(url)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title || "audio";
    const id = randomUUID();
    const fileName = `${title.replace(/[^a-z0-9-_ ]/gi, "_")}_${id}.mp3`;

    // Transcode to MP3 in-memory and upload to Supabase Storage
    const audioStream = ytdl.downloadFromInfo(info, { quality: "highestaudio" });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioStream)
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("error", reject)
        .on("end", () => resolve())
        .pipe()
        .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        .on("error", reject);
    });

    const buffer = Buffer.concat(chunks);

    const { error } = await supabase.storage
      .from("audio")
      .upload(`${user.id}/${fileName}`, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, fileName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  const type = searchParams.get("type") || "audio"; // audio or image
  
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional: verify the path starts with user's folder
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generate signed URL with appropriate expiry
  const expiry = type === "image" ? 3600 * 24 : 3600 * 5; // 24 hours for images, 5 hours for audio
  
  const { data, error } = await supabase.storage.from("audio").createSignedUrl(path, expiry);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Failed to sign URL" }, { status: 500 });
  }
  
  return NextResponse.json({ 
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + expiry * 1000).toISOString()
  });
}

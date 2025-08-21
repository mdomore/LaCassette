import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, type, identifier } = await req.json();
    
    if (!imageUrl || !type || !identifier) {
      return NextResponse.json({ 
        error: "Missing required fields: imageUrl, type, identifier" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`Uploading ${type} image from: ${imageUrl}`);

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
    const imagePath = `${user.id}/images/${imageFileName}`;
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(imagePath, buffer, {
        contentType: contentType,
        upsert: true,
        cacheControl: '3600',
      });
    
    if (uploadError) {
      console.error(`Failed to upload ${type} image:`, uploadError);
      return NextResponse.json({ 
        error: `Upload failed: ${uploadError.message}` 
      }, { status: 500 });
    }
    
    console.log(`Successfully stored ${type} image at path: ${imagePath}`);
    
    return NextResponse.json({ 
      ok: true, 
      imageUrl: imagePath,
      type,
      identifier
    });
    
  } catch (error) {
    console.error("Image upload error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
} 
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Test Supabase connection
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Test storage bucket access
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "Not set",
      },
      supabase: {
        auth: {
          user: user ? "Authenticated" : "Not authenticated",
          error: authError?.message || null,
        },
        storage: {
          buckets: buckets?.map(b => b.name) || [],
          error: storageError?.message || null,
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
} 
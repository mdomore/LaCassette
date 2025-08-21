"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Allow build-time prerendering. You must set these in .env.local for runtime.
    return createBrowserClient("http://localhost:54321", "public-anon-key");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

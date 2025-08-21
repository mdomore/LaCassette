Setup steps:

1) Create a Supabase project and create a Storage bucket named `audio`.
   - In bucket policies, restrict to authenticated users; optionally set RLS via policies.

2) Copy `.env.local.example` to `.env.local` and fill:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY (server only)

3) Run the dev server:
   npm run dev

4) Visit /login to sign in, then /import to add from YouTube, and /library to play.

Notes:
- YouTube download/transcoding runs on the server route `/api/import-youtube`. On serverless providers, ensure enough timeout and FFmpeg support; for Vercel, consider a self-hosted Node server or Vercel Functions with larger limits.
- If FFmpeg is not available in your environment, the route uses `ffmpeg-static` to provide a binary.

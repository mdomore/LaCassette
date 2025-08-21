Setup steps:

1) Create a Supabase project and create a Storage bucket named `audio`.
   - In bucket policies, restrict to authenticated users; optionally set RLS via policies.

2) Copy `.env.local.example` to `.env.local` and fill:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY (server only)

3) **Optional: Set up Music Metadata APIs for rich song information**
   
   **Spotify API (Recommended - Best quality):**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app
   - Copy Client ID and Client Secret
   - Add to `.env.local`:
     ```
     SPOTIFY_CLIENT_ID=your_client_id_here
     SPOTIFY_CLIENT_SECRET=your_client_secret_here
     ```
   
   **Last.fm API (Free alternative):**
   - Go to [Last.fm API](https://www.last.fm/api/account/create)
   - Create an API account
   - Copy API Key
   - Add to `.env.local`:
     ```
     LASTFM_API_KEY=your_api_key_here
     ```
   
   **MusicBrainz API (Completely free, no setup):**
   - No API key required
   - Used as final fallback

4) Run the dev server:
   npm run dev

5) Visit /login to sign in, then /import to add from YouTube, and /library to play.

Notes:
- YouTube download/transcoding runs on the server route `/api/import-youtube`. On serverless providers, ensure enough timeout and FFmpeg support; for Vercel, consider a self-hosted Node server or Vercel Functions with larger limits.
- If FFmpeg is not available in your environment, the route uses `ffmpeg-static` to provide a binary.
- **Metadata Enrichment**: The system automatically tries to enrich downloaded songs with rich metadata from external APIs. It follows this order:
  1. Spotify API (best quality, requires setup)
  2. Last.fm API (good quality, requires API key)
  3. MusicBrainz API (comprehensive, no setup required)
  4. Basic metadata extraction from filename
- **Smart Parsing**: The system automatically parses YouTube titles like "Artist - Album - Song" or "Artist - Song" to extract basic metadata before enrichment.

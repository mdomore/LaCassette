-- Add YouTube URL field to song_metadata table
ALTER TABLE public.song_metadata 
ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- Add index for YouTube URL lookups
CREATE INDEX IF NOT EXISTS idx_song_metadata_youtube_url ON public.song_metadata(youtube_url);

-- Add comment for documentation
COMMENT ON COLUMN public.song_metadata.youtube_url IS 'Original YouTube URL for reference and potential re-downloading'; 
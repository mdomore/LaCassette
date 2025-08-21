-- Create the audio storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio',
  'audio',
  false,
  52428800, -- 50MB limit
  '{"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "image/jpeg", "image/jpg", "image/png", "image/webp"}'
);

-- Create a table to store song metadata
CREATE TABLE IF NOT EXISTS public.song_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  album TEXT,
  release_date DATE,
  duration INTEGER,
  genres TEXT[],
  popularity INTEGER,
  spotify_id TEXT,
  album_cover_url TEXT,
  artist_image_url TEXT,
  artist_id TEXT,
  album_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_song_metadata_user_id ON public.song_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_song_metadata_file_name ON public.song_metadata(file_name);
CREATE INDEX IF NOT EXISTS idx_song_metadata_artist ON public.song_metadata(artist);
CREATE INDEX IF NOT EXISTS idx_song_metadata_album ON public.song_metadata(album);

-- Enable RLS
ALTER TABLE public.song_metadata ENABLE ROW LEVEL SECURITY;

-- RLS policies for song_metadata
CREATE POLICY "Users can view their own song metadata" ON public.song_metadata
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own song metadata" ON public.song_metadata
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own song metadata" ON public.song_metadata
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own song metadata" ON public.song_metadata
FOR DELETE USING (auth.uid() = user_id);

-- Allow authenticated users to upload their own audio files
CREATE POLICY "Users can upload their own audio files" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to read their own audio files
CREATE POLICY "Users can read their own audio files" ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own audio files
CREATE POLICY "Users can delete their own audio files" ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to list their own audio files
CREATE POLICY "Users can list their own audio files" ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);
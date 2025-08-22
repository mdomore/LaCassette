"use client";

import { useState, useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/image-upload";
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, Shuffle, Repeat, 
  Heart, ListMusic, Clock, User, Search, Home, Disc3, Users, 
  Music2, Plus, MoreHorizontal, Star, Trash2, Image, Edit
} from "lucide-react";

interface AudioFile {
  name: string;
  id: string;
  created_at: string;
  metadata?: {
    title?: string;
    duration?: number;
    artist?: string;
    album?: string;
    releaseDate?: string;
    genres?: string[];
    popularity?: number;
    spotifyId?: string;
    albumCover?: string;
    artistId?: string;
    albumId?: string;
    youtubeUrl?: string;
  };
  images?: {
    albumCover?: string;
    artistImage?: string;
  };
}

interface NowPlaying {
  file: AudioFile;
  audio: HTMLAudioElement;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

interface Artist {
  name: string;
  songs: AudioFile[];
  albums: string[];
}

interface Album {
  name: string;
  artist: string;
  songs: AudioFile[];
  coverColor: string;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  songs: AudioFile[];
  isPublic: boolean;
}

type LibraryView = 'home' | 'artists' | 'albums' | 'playlists' | 'songs';

export default function LibraryPage() {
  const [user, setUser] = useState<any>(null);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [currentView, setCurrentView] = useState<LibraryView>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  
  // Image upload modal states
  const [showArtistImageUpload, setShowArtistImageUpload] = useState(false);
  const [showAlbumCoverUpload, setShowAlbumCoverUpload] = useState(false);
  const [selectedArtistForUpload, setSelectedArtistForUpload] = useState<string>("");
  const [selectedAlbumForUpload, setSelectedAlbumForUpload] = useState<{artist: string, album: string}>({artist: "", album: ""});
  
  // Edit metadata modal states
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [editingFile, setEditingFile] = useState<AudioFile | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    artist: "",
    album: ""
  });

  // Utility function to get signed URL for images
  const getImageUrl = async (imagePath: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/audio-url?path=${encodeURIComponent(imagePath)}&type=image`);
      if (response.ok) {
        const data = await response.json();
        return data.signedUrl;
      }
    } catch (error) {
      console.error('Failed to get image URL:', error);
    }
    return null;
  };

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUser(user);
      await loadAudioFiles(user.id);
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!nowPlaying) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBackward();
          break;
        case 'ArrowUp':
          e.preventDefault();
          playNext();
          break;
        case 'ArrowDown':
          e.preventDefault();
          playPrevious();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [nowPlaying]);

  // Ensure player state is properly synchronized
  useEffect(() => {
    if (nowPlaying && nowPlaying.audio) {
      // Sync the audio element's current time with our state
      const syncTime = () => {
        if (Math.abs(nowPlaying.audio.currentTime - nowPlaying.currentTime) > 0.5) {
          setNowPlaying(prev => prev ? {
            ...prev,
            currentTime: nowPlaying.audio.currentTime
          } : null);
        }
      };
      
      const interval = setInterval(syncTime, 100);
      return () => clearInterval(interval);
    }
  }, [nowPlaying]);

  const loadAudioFiles = async (userId: string) => {
    const supabase = createSupabaseBrowserClient();
    
    // First, load metadata from the database
    const { data: metadataRows, error: metadataError } = await supabase
      .from('song_metadata')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (metadataError) {
      console.error("Error loading metadata:", metadataError);
      return;
    }

    // Then, load files from storage
    const { data: storageFiles, error: storageError } = await supabase.storage.from("audio").list(userId, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

    if (storageError) {
      console.error("Error loading storage files:", storageError);
      return;
    }

    // Filter out non-audio files and the images folder
    const audioFiles = storageFiles?.filter(file => {
      // Only include MP3 files, exclude images folder and other file types
      const isAudio = file.name.endsWith('.mp3') && !file.name.includes('/images/');
      return isAudio;
    }).map(file => {
      // Find corresponding metadata from database
      const metadata = metadataRows?.find(row => row.file_name === file.name);
      
      if (metadata) {
        return {
          ...file,
          id: file.id || file.name,
          metadata: {
            title: metadata.title || "Unknown Title",
            artist: metadata.artist || "Unknown Artist",
            album: metadata.album || "Unknown Album",
            duration: metadata.duration || 0,
            releaseDate: metadata.release_date,
            genres: metadata.genres || [],
            popularity: metadata.popularity || 0,
            spotifyId: metadata.spotify_id,
            albumCover: metadata.album_cover_url,
            artistId: metadata.artist_id,
            albumId: metadata.album_id,
            youtubeUrl: metadata.youtube_url
          },
          images: {
            albumCover: metadata.album_cover_url,
            artistImage: metadata.artist_image_url
          }
        };
      } else {
        // Fallback to filename parsing if no metadata found
        const title = file.name.replace(/\.mp3$/, "");
        
        // Parse the filename format
        const parts = title.split("_");
        let artist = "Unknown Artist";
        let album = "Unknown Album";
        let songTitle = title;
        
        if (parts.length >= 4) {
          artist = parts[0];
          album = parts[1];
          songTitle = parts.slice(2, -1).join(" ");
        } else if (parts.length === 3) {
          artist = parts[0];
          songTitle = parts[1];
        } else if (parts.length === 2) {
          songTitle = parts[0];
        }
        
        return {
          ...file,
          id: file.id || file.name,
          metadata: {
            title: songTitle,
            artist: artist,
            album: album,
            duration: 0
          },
          images: {} // Initialize empty images object
        };
      }
    }) || [];

    // Now load any additional images that might not be in the metadata
    const songsWithImages = await Promise.all(audioFiles.map(async (file) => {
      // Always try to find fresh images for each song, regardless of what's in metadata
      const updatedImages: { albumCover?: string; artistImage?: string } = {};
      
      try {
        // Look for images in the images folder
        const { data: imageFiles, error: imageError } = await supabase.storage
          .from("audio")
          .list(`${userId}/images`, {
            limit: 100,
          });

        if (imageError) {
          console.warn(`Error loading images for ${file.name}:`, imageError);
          return file;
        }

                if (imageFiles && imageFiles.length > 0) {
          const artist = file.metadata?.artist || "Unknown Artist";
          const album = file.metadata?.album || "Unknown Album";
          
          // Find artist image
          let artistImage: any = null;
          const artistVariations = [
            artist,
            artist.replace(/\s+/g, '_'),
            artist.replace(/\s+/g, '%20'),
            artist.replace(/[^a-z0-9-_ ]/gi, "_"),
            artist.toLowerCase().replace(/\s+/g, '_')
          ];
          
          for (const variation of artistVariations) {
            artistImage = imageFiles.find(img => 
              img.name.toLowerCase().startsWith(`artist_${variation.toLowerCase()}`)
            );
            if (artistImage) break;
          }
          
          // Find album cover
          let albumCover: any = null;
          const albumVariations = [
            `${artist}_${album}`,
            `${artist.replace(/\s+/g, '_')}_${album.replace(/\s+/g, '_')}`,
            `${artist.replace(/\s+/g, '%20')}_${album.replace(/\s+/g, '%20')}`,
            `${artist.replace(/[^a-z0-9-_ ]/gi, "_")}_${album.replace(/[^a-z0-9-_ ]/gi, "_")}`,
            `${artist.toLowerCase().replace(/\s+/g, '_')}_${album.toLowerCase().replace(/\s+/g, '_')}`
          ];
          
          for (const variation of albumVariations) {
            albumCover = imageFiles.find(img => 
              img.name.toLowerCase().startsWith(`album_${variation.toLowerCase()}`)
            );
            if (albumCover) break;
          }

          if (artistImage || albumCover) {
            if (artistImage) {
              const imagePath = `${userId}/images/${artistImage.name}`;
              const signedUrl = await getImageUrl(imagePath);
              if (signedUrl) {
                updatedImages.artistImage = signedUrl;
              }
            }
            
            if (albumCover) {
              const imagePath = `${userId}/images/${albumCover.name}`;
              const signedUrl = await getImageUrl(imagePath);
              if (signedUrl) {
                updatedImages.albumCover = signedUrl;
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to load images for ${file.name}:`, error);
      }
      
      // Merge with any existing images (but prefer fresh ones)
      const finalImages = {
        ...file.images,
        ...updatedImages
      };
      
      console.log(`Final images for ${file.name}:`, finalImages);
      return { ...file, images: finalImages };
    }));

    setAudioFiles(songsWithImages);
    organizeLibrary(songsWithImages);
  };

  const organizeLibrary = (files: AudioFile[]) => {
    // Organize by artists
    const artistMap = new Map<string, AudioFile[]>();
    const albumMap = new Map<string, AudioFile[]>();
    
    files.forEach(file => {
      const artist = file.metadata?.artist || "Unknown Artist";
      const album = file.metadata?.album || "Unknown Album";
      
      // Group by artist
      if (!artistMap.has(artist)) {
        artistMap.set(artist, []);
      }
      artistMap.get(artist)!.push(file);
      
      // Group by album
      const albumKey = `${artist} - ${album}`;
      if (!albumMap.has(albumKey)) {
        albumMap.set(albumKey, []);
      }
      albumMap.get(albumKey)!.push(file);
    });

    // Convert to arrays
    const artistArray: Artist[] = Array.from(artistMap.entries()).map(([name, songs]) => ({
      name,
      songs,
      albums: [...new Set(songs.map(s => s.metadata?.album || "Unknown Album"))]
    }));

    const albumArray: Album[] = Array.from(albumMap.entries()).map(([key, songs]) => {
      const [artist, album] = key.split(" - ");
      const colors = ['from-blue-500 to-purple-600', 'from-green-500 to-blue-600', 'from-purple-500 to-pink-600', 'from-orange-500 to-red-600', 'from-teal-500 to-green-600'];
      return {
        name: album,
        artist,
        songs,
        coverColor: colors[Math.floor(Math.random() * colors.length)]
      };
    });

    // Create default playlists
    const defaultPlaylists: Playlist[] = [
      {
        id: 'recent',
        name: 'Recently Added',
        description: 'Songs you\'ve recently imported',
        songs: files.slice(0, 20),
        isPublic: false
      },
      {
        id: 'favorites',
        name: 'Favorites',
        description: 'Your favorite songs',
        songs: files.filter(f => f.metadata?.title?.includes('favorite') || false),
        isPublic: false
      }
    ];

    setArtists(artistArray);
    setAlbums(albumArray);
    setPlaylists(defaultPlaylists);
  };

  const playAudio = async (file: AudioFile) => {
    try {
      // Stop current audio if playing
      if (nowPlaying) {
        nowPlaying.audio.pause();
        nowPlaying.audio.src = "";
      }

      // Get signed URL
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.storage
        .from("audio")
        .createSignedUrl(`${user.id}/${file.name}`, 60 * 5);

      if (error || !data?.signedUrl) {
        console.error("Error getting signed URL:", error);
        return;
      }

      // Create new audio element
      const audio = new Audio(data.signedUrl);
      audio.volume = volume;

      // Set up event listeners
      audio.addEventListener("loadedmetadata", () => {
        setNowPlaying({
          file,
          audio,
          isPlaying: false,
          currentTime: 0,
          duration: audio.duration
        });
      });

      audio.addEventListener("timeupdate", () => {
        setNowPlaying(prev => {
          if (prev && prev.file.id === file.id) {
            return {
              ...prev,
              currentTime: audio.currentTime
            };
          }
          return prev;
        });
      });

      audio.addEventListener("ended", () => {
        if (repeat) {
          audio.currentTime = 0;
          audio.play();
        } else if (shuffle) {
          const randomIndex = Math.floor(Math.random() * audioFiles.length);
          playAudio(audioFiles[randomIndex]);
        } else {
          // Play next song
          const currentIndex = audioFiles.findIndex(f => f.id === file.id);
          const nextIndex = (currentIndex + 1) % audioFiles.length;
          playAudio(audioFiles[nextIndex]);
        }
      });

      // Start playing
      await audio.play();
      setNowPlaying(prev => {
        if (prev && prev.file.id === file.id) {
          return { ...prev, isPlaying: true };
        }
        return prev;
      });

    } catch (error) {
      console.error("Error playing audio:", error);
    }
  };

  const togglePlayPause = () => {
    if (!nowPlaying) return;

    if (nowPlaying.isPlaying) {
      nowPlaying.audio.pause();
      setNowPlaying(prev => prev ? { ...prev, isPlaying: false } : null);
    } else {
      nowPlaying.audio.play().then(() => {
        setNowPlaying(prev => prev ? { ...prev, isPlaying: true } : null);
      }).catch(error => {
        console.error('Error playing audio:', error);
      });
    }
  };

  const skipTo = (seconds: number) => {
    if (!nowPlaying) return;
    nowPlaying.audio.currentTime = seconds;
  };

  const skipForward = () => {
    if (!nowPlaying) return;
    const newTime = Math.min(nowPlaying.currentTime + 10, nowPlaying.duration);
    skipTo(newTime);
  };

  const skipBackward = () => {
    if (!nowPlaying) return;
    const newTime = Math.max(nowPlaying.currentTime - 10, 0);
    skipTo(newTime);
  };

  const playNext = () => {
    if (!nowPlaying || audioFiles.length === 0) return;
    const currentIndex = audioFiles.findIndex(f => f.id === nowPlaying.file.id);
    const nextIndex = (currentIndex + 1) % audioFiles.length;
    playAudio(audioFiles[nextIndex]);
  };

  const playPrevious = () => {
    if (!nowPlaying || audioFiles.length === 0) return;
    const currentIndex = audioFiles.findIndex(f => f.id === nowPlaying.file.id);
    const prevIndex = currentIndex === 0 ? audioFiles.length - 1 : currentIndex - 1;
    playAudio(audioFiles[prevIndex]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (nowPlaying) {
      nowPlaying.audio.volume = newVolume;
    }
  };

  const deleteSong = async (file: AudioFile) => {
    if (!confirm(`Are you sure you want to delete "${file.metadata?.title}"?`)) {
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      
      // Delete from Supabase Storage
      const { error } = await supabase.storage
        .from("audio")
        .remove([`${user.id}/${file.name}`]);

      if (error) {
        console.error("Error deleting file:", error);
        alert("Failed to delete song. Please try again.");
        return;
      }

      // Remove from local state
      setAudioFiles(prev => prev.filter(f => f.id !== file.id));
      
      // If this was the currently playing song, stop it
      if (nowPlaying && nowPlaying.file.id === file.id) {
        nowPlaying.audio.pause();
        setNowPlaying(null);
      }

      // Reorganize library
      const updatedFiles = audioFiles.filter(f => f.id !== file.id);
      organizeLibrary(updatedFiles);

      console.log(`Successfully deleted: ${file.metadata?.title}`);
      setDeleteMessage(`Successfully deleted: ${file.metadata?.title}`);
      setTimeout(() => setDeleteMessage(null), 3000); // Clear message after 3 seconds

    } catch (error) {
      console.error("Error deleting song:", error);
      alert("Failed to delete song. Please try again.");
    }
  };

  const handleArtistClick = (artist: Artist) => {
    setSelectedArtist(artist);
    setSelectedAlbum(null);
    setSelectedPlaylist(null);
    setCurrentView('songs');
    // Ensure player state is maintained when switching views
    if (nowPlaying) {
      console.log('Maintaining player state for artist view:', nowPlaying.file.metadata?.title);
    }
  };

  const handleAlbumClick = (album: Album) => {
    setSelectedAlbum(album);
    setSelectedArtist(null);
    setSelectedPlaylist(null);
    setCurrentView('songs');
    // Ensure player state is maintained when switching views
    if (nowPlaying) {
      console.log('Maintaining player state for album view:', nowPlaying.file.metadata?.title);
    }
  };

  const handlePlaylistClick = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setCurrentView('songs');
    // Ensure player state is maintained when switching views
    if (nowPlaying) {
      console.log('Maintaining player state for playlist view:', nowPlaying.file.metadata?.title);
    }
  };

  const clearSelection = () => {
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedPlaylist(null);
  };

  const handleEditMetadata = (file: AudioFile) => {
    setEditingFile(file);
    setEditForm({
      title: file.metadata?.title || "",
      artist: file.metadata?.artist || "",
      album: file.metadata?.album || ""
    });
    setShowEditMetadata(true);
  };

  const saveMetadataEdit = async () => {
    if (!editingFile) return;

    try {
      const supabase = createSupabaseBrowserClient();
      
      // Update metadata in database
      const { error } = await supabase
        .from('song_metadata')
        .update({
          title: editForm.title,
          artist: editForm.artist,
          album: editForm.album,
          updated_at: new Date().toISOString()
        })
        .eq('file_name', editingFile.name);

      if (error) {
        console.error("Error updating metadata:", error);
        alert("Failed to update metadata. Please try again.");
        return;
      }

      // Check for existing images that match the new metadata
      let foundArtistImage = null;
      let foundAlbumCover = null;

      // Look for existing artist image
      if (editForm.artist && editForm.artist !== "Unknown Artist") {
        const existingArtistImage = audioFiles.find(file => 
          file.metadata?.artist === editForm.artist && file.images?.artistImage
        )?.images?.artistImage;
        
        if (existingArtistImage) {
          foundArtistImage = existingArtistImage;
          console.log(`Found existing artist image for ${editForm.artist}`);
        }
      }

      // Look for existing album cover
      if (editForm.artist && editForm.album && 
          editForm.artist !== "Unknown Artist" && editForm.album !== "Unknown Album") {
        const existingAlbumCover = audioFiles.find(file => 
          file.metadata?.artist === editForm.artist && 
          file.metadata?.album === editForm.album && 
          file.images?.albumCover
        )?.images?.albumCover;
        
        if (existingAlbumCover) {
          foundAlbumCover = existingAlbumCover;
          console.log(`Found existing album cover for ${editForm.album} by ${editForm.artist}`);
        }
      }

      // Update local state with new metadata and found images
      setAudioFiles(prev => prev.map(file => 
        file.id === editingFile.id 
          ? {
              ...file,
              metadata: {
                ...file.metadata,
                title: editForm.title,
                artist: editForm.artist,
                album: editForm.album
              },
              images: {
                ...file.images,
                artistImage: foundArtistImage || file.images?.artistImage,
                albumCover: foundAlbumCover || file.images?.albumCover
              }
            }
          : file
      ));

      // Reorganize library to reflect changes
      const updatedFiles = audioFiles.map(file => 
        file.id === editingFile.id 
          ? {
              ...file,
              metadata: {
                ...file.metadata,
                title: editForm.title,
                artist: editForm.artist,
                album: editForm.album
              },
              images: {
                ...file.images,
                artistImage: foundArtistImage || file.images?.artistImage,
                albumCover: foundAlbumCover || file.images?.albumCover
              }
            }
          : file
      );
      organizeLibrary(updatedFiles);

      // Show success message
      setDeleteMessage(`Metadata updated for "${editForm.title}"`);
      setTimeout(() => setDeleteMessage(null), 3000);

      // Close modal
      setShowEditMetadata(false);
      setEditingFile(null);
      setEditForm({ title: "", artist: "", album: "" });

    } catch (error) {
      console.error("Error saving metadata:", error);
      alert("Failed to save metadata. Please try again.");
    }
  };

  const handleViewChange = (view: LibraryView) => {
    setCurrentView(view);
    clearSelection(); // Clear any selections when changing views
  };

  const filteredFiles = audioFiles.filter(file => {
    // If there's a search query, filter by that first
    if (searchQuery) {
      return file.metadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             file.metadata?.artist?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             file.metadata?.album?.toLowerCase().includes(searchQuery.toLowerCase());
    }

    // If an artist is selected, show only their songs
    if (selectedArtist) {
      return file.metadata?.artist === selectedArtist.name;
    }

    // If an album is selected, show only songs from that album
    if (selectedAlbum) {
      return file.metadata?.artist === selectedAlbum.artist && 
             file.metadata?.album === selectedAlbum.name;
    }

    // If a playlist is selected, show only songs from that playlist
    if (selectedPlaylist) {
      return selectedPlaylist.songs.some(song => song.id === file.id);
    }

    // Otherwise, show all files
    return true;
  });

  const renderHomeView = () => (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100">Total Songs</p>
                <p className="text-3xl font-bold">{audioFiles.length}</p>
              </div>
              <Music2 className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100">Artists</p>
                <p className="text-3xl font-bold">{artists.length}</p>
              </div>
              <Users className="w-8 h-8 text-purple-200" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100">Albums</p>
                <p className="text-3xl font-bold">{albums.length}</p>
              </div>
              <Disc3 className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100">Playlists</p>
                <p className="text-3xl font-bold">{playlists.length}</p>
              </div>
              <ListMusic className="w-8 h-8 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recently Added */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Recently Added</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {audioFiles.slice(0, 8).map((file) => (
            <SongCard 
              key={file.id} 
              file={file} 
              onPlay={playAudio} 
              isPlaying={nowPlaying?.file.id === file.id} 
              onDelete={deleteSong}
              onAddArtistImage={(artist) => {
                setShowArtistImageUpload(true);
                setSelectedArtistForUpload(artist);
              }}
              onAddAlbumCover={(artist, album) => {
                setShowAlbumCoverUpload(true);
                setSelectedAlbumForUpload({artist, album});
              }}
              onEditMetadata={handleEditMetadata}
            />
          ))}
        </div>
      </div>

      {/* Top Artists */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Top Artists</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {artists.slice(0, 6).map((artist) => (
            <Card 
              key={artist.name} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleArtistClick(artist)}
            >
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{artist.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{artist.songs.length} songs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const renderArtistsView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Artists</h2>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Artist
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {artists.map((artist) => (
          <Card 
            key={artist.name} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleArtistClick(artist)}
          >
            <CardContent className="p-6">
              <div className="text-center">
                {/* Artist Image */}
                {artist.songs[0]?.images?.artistImage ? (
                  <img 
                    src={artist.songs[0].images.artistImage}
                    alt={`${artist.name} artist image`}
                    className="w-24 h-24 rounded-full object-cover mx-auto mb-4"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                
                <div className={`w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  artist.songs[0]?.images?.artistImage ? 'hidden' : ''
                }`}>
                  <Users className="w-12 h-12 text-white" />
                </div>
                
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{artist.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{artist.songs.length} songs</p>
                <p className="text-xs text-slate-500 dark:text-slate-500">{artist.albums.length} albums</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderAlbumsView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Albums</h2>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Album
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {albums.map((album) => (
          <Card 
            key={`${album.artist}-${album.name}`} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleAlbumClick(album)}
          >
            <CardContent className="p-4">
              <div className="mb-4">
                {/* Album Cover */}
                {album.songs[0]?.images?.albumCover ? (
                  <img 
                    src={album.songs[0].images.albumCover}
                    alt={`${album.name} album cover`}
                    className={`w-full aspect-square rounded-lg object-cover mb-3`}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                
                <div className={`w-full aspect-square bg-gradient-to-br ${album.coverColor} rounded-lg flex items-center justify-center mb-3 ${
                  album.songs[0]?.images?.albumCover ? 'hidden' : ''
                }`}>
                  <Disc3 className="w-16 h-16 text-white" />
                </div>
                
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{album.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{album.artist}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500">{album.songs.length} songs</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderPlaylistsView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Playlists</h2>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Playlist
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {playlists.map((playlist) => (
          <Card 
            key={playlist.id} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handlePlaylistClick(playlist)}
          >
            <CardContent className="p-4">
              <div className="mb-4">
                <div className="w-full aspect-square bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <ListMusic className="w-16 h-16 text-white" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{playlist.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{playlist.description}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500">{playlist.songs.length} songs</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderSongsView = () => (
    <div className="space-y-6">
      {/* Header with selection info and back button */}
      {(selectedArtist || selectedAlbum || selectedPlaylist) && (
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearSelection}
              className="flex items-center space-x-2"
            >
              <SkipBack className="w-4 h-4" />
              <span>Back</span>
            </Button>
            
            <div>
              {selectedArtist && (
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedArtist.name}</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{selectedArtist.songs.length} songs • {selectedArtist.albums.length} albums</p>
                  </div>
                </div>
              )}
              
              {selectedAlbum && (
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 bg-gradient-to-br ${selectedAlbum.coverColor} rounded-lg flex items-center justify-center`}>
                    <Disc3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedAlbum.name}</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">by {selectedAlbum.artist} • {selectedAlbum.songs.length} songs</p>
                  </div>
                </div>
              )}
              
              {selectedPlaylist && (
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <ListMusic className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedPlaylist.name}</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{selectedPlaylist.description} • {selectedPlaylist.songs.length} songs</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {selectedArtist ? `${selectedArtist.name} Songs` :
           selectedAlbum ? `${selectedAlbum.name} Songs` :
           selectedPlaylist ? `${selectedPlaylist.name} Songs` :
           'All Songs'}
        </h2>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Search songs, artists, albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
          
          {/* YouTube URL filter indicator */}
          {filteredFiles.some(file => file.metadata?.youtubeUrl) && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>{filteredFiles.filter(file => file.metadata?.youtubeUrl).length} songs from YouTube</span>
            </div>
          )}
        </div>
      </div>
      

      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {filteredFiles.map((file) => (
          <SongCard 
            key={file.id} 
            file={file} 
            onPlay={playAudio} 
            isPlaying={nowPlaying?.file.id === file.id} 
            onDelete={deleteSong}
            onAddArtistImage={(artist) => {
              setShowArtistImageUpload(true);
              setSelectedArtistForUpload(artist);
            }}
            onAddAlbumCover={(artist, album) => {
              setShowAlbumCoverUpload(true);
              setSelectedAlbumForUpload({artist, album});
            }}
            onEditMetadata={handleEditMetadata}
          />
        ))}
      </div>
      
      {filteredFiles.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500 dark:text-slate-400">
            {searchQuery ? 'No songs found matching your search.' :
             selectedArtist ? `No songs found for ${selectedArtist.name}.` :
             selectedAlbum ? `No songs found in ${selectedAlbum.name}.` :
             selectedPlaylist ? `No songs found in ${selectedPlaylist.name}.` :
             'No songs found.'}
          </p>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">Loading your music library...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 min-h-screen">
          <div className="p-6">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6">Music Library</h1>
            
            <nav className="space-y-2">
              <button
                onClick={() => handleViewChange('home')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  currentView === 'home' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Home className="w-5 h-5" />
                <span>Home</span>
              </button>
              
              <button
                onClick={() => handleViewChange('artists')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  currentView === 'artists' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Artists</span>
                <span className="ml-auto text-xs bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full">{artists.length}</span>
              </button>
              
              <button
                onClick={() => handleViewChange('albums')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  currentView === 'albums' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Disc3 className="w-5 h-5" />
                <span>Albums</span>
                <span className="ml-auto text-xs bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full">{albums.length}</span>
              </button>
              
              <button
                onClick={() => handleViewChange('playlists')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  currentView === 'playlists' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <ListMusic className="w-5 h-5" />
                <span>Playlists</span>
                <span className="ml-auto text-xs bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full">{playlists.length}</span>
              </button>
              
              <button
                onClick={() => handleViewChange('songs')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  currentView === 'songs' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Music2 className="w-5 h-5" />
                <span>All Songs</span>
                <span className="ml-auto text-xs bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full">{audioFiles.length}</span>
              </button>
            </nav>
            
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <Button asChild className="w-full" size="sm">
          <Link href="/import">Import from YouTube</Link>
        </Button>
      </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Persistent Player Bar - Always at top */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
            {nowPlaying ? (
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between">
                  {/* Song Info */}
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <ListMusic className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {nowPlaying.file.metadata?.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {nowPlaying.file.metadata?.artist} • {nowPlaying.file.metadata?.album}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        {formatTime(nowPlaying.currentTime)} / {formatTime(nowPlaying.duration)}
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center space-x-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShuffle(!shuffle)}
                      className={shuffle ? "text-blue-600" : ""}
                    >
                      <Shuffle className="w-4 h-4" />
                    </Button>
                    
                    <Button variant="ghost" size="sm" onClick={playPrevious}>
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      onClick={togglePlayPause}
                      size="lg"
                      className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700"
                    >
                      {nowPlaying.isPlaying ? (
                        <Pause className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white ml-1" />
                      )}
                    </Button>
                    
                    <Button variant="ghost" size="sm" onClick={playNext}>
                      <SkipForward className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRepeat(!repeat)}
                      className={repeat ? "text-blue-600" : ""}
                    >
                      <Repeat className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center space-x-2">
                    <Volume2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-20"
                    />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div 
                    className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 cursor-pointer relative"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percentage = clickX / rect.width;
                      const newTime = percentage * nowPlaying.duration;
                      skipTo(newTime);
                    }}
                  >
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-150 relative"
                      style={{
                        width: `${(nowPlaying.currentTime / nowPlaying.duration) * 100}%`
                      }}
                    >
                      {/* Progress Handle */}
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
                    </div>
                  </div>
                  
                  {/* Keyboard Shortcuts Hint */}
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                    <span className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                      Space: Play/Pause • ←→: Skip 10s • ↑↓: Next/Previous
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Music2 className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">No music playing</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs">Select a song to start listening</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 overflow-auto">
            {/* Success Message */}
            {deleteMessage && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center text-green-800 dark:text-green-200">
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mr-3">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                  {deleteMessage}
                </div>
              </div>
            )}
            
            {currentView === 'home' && renderHomeView()}
            {currentView === 'artists' && renderArtistsView()}
            {currentView === 'albums' && renderAlbumsView()}
            {currentView === 'playlists' && renderPlaylistsView()}
            {currentView === 'songs' && renderSongsView()}
          </div>
        </div>
      </div>


      
      {/* Edit Metadata Modal */}
      {showEditMetadata && editingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Metadata</h3>
              <button
                onClick={() => {
                  setShowEditMetadata(false);
                  setEditingFile(null);
                  setEditForm({ title: "", artist: "", album: "" });
                }}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Title
                </label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Song title"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Artist
                </label>
                <Input
                  value={editForm.artist}
                  onChange={(e) => setEditForm(prev => ({ ...prev, artist: e.target.value }))}
                  placeholder="Artist name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Album
                </label>
                <Input
                  value={editForm.album}
                  onChange={(e) => setEditForm(prev => ({ ...prev, album: e.target.value }))}
                  placeholder="Album name"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={saveMetadataEdit}
                  className="flex-1"
                >
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditMetadata(false);
                    setEditingFile(null);
                    setEditForm({ title: "", artist: "", album: "" });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Image Upload Modals */}
      {showArtistImageUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Artist Image</h3>
              <button
                onClick={() => setShowArtistImageUpload(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <ImageUpload
              type="artist"
              identifier={selectedArtistForUpload}
              onImageUploaded={async (imageUrl) => {
                // Check if artist already has an image
                const existingArtistImage = audioFiles.find(file => 
                  file.metadata?.artist === selectedArtistForUpload && file.images?.artistImage
                )?.images?.artistImage;
                
                if (existingArtistImage) {
                  // Use existing image instead of uploading new one
                  console.log(`Artist ${selectedArtistForUpload} already has an image, reusing existing one`);
                  setShowArtistImageUpload(false);
                  return;
                }
                
                // Convert path to signed URL if needed
                let finalImageUrl = imageUrl;
                if (!imageUrl.startsWith('http')) {
                  const signedUrl = await getImageUrl(imageUrl);
                  if (signedUrl) {
                    finalImageUrl = signedUrl;
                  }
                }
                
                // Update all songs by this artist
                setAudioFiles(prev => prev.map(file => 
                  file.metadata?.artist === selectedArtistForUpload 
                    ? { ...file, images: { ...file.images, artistImage: finalImageUrl } }
                    : file
                ));
                
                // Reorganize library to reflect changes
                organizeLibrary(audioFiles);
                setShowArtistImageUpload(false);
              }}
            />
          </div>
        </div>
      )}
      
      {showAlbumCoverUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Album Cover</h3>
              <button
                onClick={() => setShowAlbumCoverUpload(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <ImageUpload
              type="album"
              identifier={`${selectedAlbumForUpload.artist}_${selectedAlbumForUpload.album}`}
              onImageUploaded={async (imageUrl) => {
                // Check if album already has a cover
                const existingAlbumCover = audioFiles.find(file => 
                  file.metadata?.artist === selectedAlbumForUpload.artist && 
                  file.metadata?.album === selectedAlbumForUpload.album && 
                  file.images?.albumCover
                )?.images?.albumCover;
                
                if (existingAlbumCover) {
                  // Use existing cover instead of uploading new one
                  console.log(`Album ${selectedAlbumForUpload.album} by ${selectedAlbumForUpload.artist} already has a cover, reusing existing one`);
                  setShowAlbumCoverUpload(false);
                  return;
                }
                
                // Convert path to signed URL if needed
                let finalImageUrl = imageUrl;
                if (!imageUrl.startsWith('http')) {
                  const signedUrl = await getImageUrl(imageUrl);
                  if (signedUrl) {
                    finalImageUrl = signedUrl;
                  }
                }
                
                // Update all songs from this album
                setAudioFiles(prev => prev.map(file => 
                  file.metadata?.artist === selectedAlbumForUpload.artist && file.metadata?.album === selectedAlbumForUpload.album
                    ? { ...file, images: { ...file.images, albumCover: finalImageUrl } }
                    : file
                ));
                
                // Reorganize library to reflect changes
                organizeLibrary(audioFiles);
                setShowAlbumCoverUpload(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Song Card Component
function SongCard({ 
  file, 
  onPlay, 
  isPlaying, 
  onDelete,
  onAddArtistImage,
  onAddAlbumCover,
  onEditMetadata
}: { 
  file: AudioFile; 
  onPlay: (file: AudioFile) => void; 
  isPlaying: boolean;
  onDelete: (file: AudioFile) => void;
  onAddArtistImage: (artist: string) => void;
  onAddAlbumCover: (artist: string, album: string) => void;
  onEditMetadata: (file: AudioFile) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <Card
      className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${
        isPlaying ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
      onClick={() => onPlay(file)}
    >
      <CardContent className="p-3">
        {/* Album Art */}
        <div className="relative mb-3">
          {file.images?.albumCover ? (
            <img 
              src={file.images.albumCover} 
              alt={`${file.metadata?.title} album cover`}
              className="w-full aspect-square rounded-lg object-cover"
              onError={(e) => {
                // Fallback to placeholder if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          
          <div className={`w-full aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center ${
            file.images?.albumCover ? 'hidden' : ''
          }`}>
            <ListMusic className="w-8 h-8 text-white" />
          </div>
          
          {/* Play Button Overlay */}
          <div className="absolute inset-0 bg-black/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
              <Play className="w-6 h-6 text-slate-900 ml-1" />
            </div>
          </div>
        </div>

        {/* Song Info */}
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate text-sm">
            {file.metadata?.title}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
            {file.metadata?.artist}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
            {file.metadata?.album}
          </p>
          
          {/* YouTube URL indicator */}
          {file.metadata?.youtubeUrl && (
            <div className="flex items-center gap-1 mt-1">
              <svg className="w-3 h-3 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span className="text-xs text-slate-400 dark:text-slate-500">YouTube</span>
            </div>
          )}
          
          {/* Enriched Metadata */}
          {file.metadata?.genres && file.metadata.genres.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {file.metadata.genres.slice(0, 2).map((genre, index) => (
                <span
                  key={index}
                  className="inline-block px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
          
          {file.metadata?.releaseDate && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              Released: {new Date(file.metadata.releaseDate).getFullYear()}
            </p>
          )}
          
          {file.metadata?.popularity && (
            <div className="mt-1 flex items-center gap-1">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 h-1 rounded-full ${
                      i < Math.floor((file.metadata?.popularity || 0) / 20)
                        ? 'bg-yellow-500'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-500">
                {file.metadata?.popularity}%
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400">
              <Heart className="w-4 h-4" />
            </Button>
            
            {/* YouTube Link Button */}
            {file.metadata?.youtubeUrl && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-slate-600 dark:text-slate-400"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(file.metadata?.youtubeUrl, '_blank');
                }}
                title="Open YouTube Video"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </Button>
            )}
          </div>
          
          {/* Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 dark:text-slate-400"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditMetadata(file);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Edit className="w-4 h-4 mr-2" /> Edit Metadata
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </button>
                
                <div className="border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onAddArtistImage(file.metadata?.artist || "Unknown Artist");
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Image className="w-4 h-4 mr-2" /> 
                    {file.images?.artistImage ? 'Change Artist Image' : 'Add Artist Image'}
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onAddAlbumCover(
                        file.metadata?.artist || "Unknown Artist",
                        file.metadata?.album || "Unknown Album"
                      );
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Image className="w-4 h-4 mr-2" /> 
                    {file.images?.albumCover ? 'Change Album Cover' : 'Add Album Cover'}
                  </button>
                  
                  {/* Re-import from YouTube option */}
                  {file.metadata?.youtubeUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        // Navigate to import page with pre-filled YouTube URL
                        window.location.href = `/import?url=${encodeURIComponent(file.metadata?.youtubeUrl || '')}`;
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2 inline" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                      Re-import from YouTube
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

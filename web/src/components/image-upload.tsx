"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image, Upload, X } from "lucide-react";

interface ImageUploadProps {
  type: 'album' | 'artist' | 'song';
  identifier: string;
  onImageUploaded: (imageUrl: string) => void;
}

export function ImageUpload({ type, identifier, onImageUploaded }: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!imageUrl.trim()) {
      setError("Please enter an image URL");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          type,
          identifier
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Success!
      onImageUploaded(data.imageUrl);
      setImageUrl("");
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Upload {type} Image
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="imageUrl" className="text-sm font-medium">
            Image URL
          </label>
          <Input
            id="imageUrl"
            type="url"
            placeholder="https://example.com/image.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUpload()}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearError}
              className="h-auto p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={isUploading || !imageUrl.trim()}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Upload className="w-4 h-4 mr-2 animate-pulse" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Image
            </>
          )}
        </Button>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          <p>Supported formats: JPG, PNG, WebP</p>
          <p>Image will be stored in your Supabase storage</p>
        </div>
      </CardContent>
    </Card>
  );
} 
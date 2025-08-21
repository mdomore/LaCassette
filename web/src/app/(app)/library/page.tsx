import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p>You must be signed in to view your library.</p>
          <Button asChild>
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { data, error } = await supabase.storage.from("audio").list(user.id, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your Library</h1>
        <Button asChild>
          <Link href="/import">Import from YouTube</Link>
        </Button>
      </div>
      <div className="grid gap-3">
        {error && <p className="text-sm text-red-600">{error.message}</p>}
        {(!data || data.length === 0) && <p className="text-sm text-muted-foreground">No files yet.</p>}
        {data?.map((file) => (
          <audio key={file.name} controls src={`/api/audio-url?path=${encodeURIComponent(`${user.id}/${file.name}`)}`}></audio>
        ))}
      </div>
    </div>
  );
}

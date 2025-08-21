import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen p-6 flex items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">La Cassette</h1>
        <p className="text-muted-foreground">Your personal audio library</p>
        <div className="flex gap-3 justify-center">
          <Link className="underline" href="/login">Sign in</Link>
          <Link className="underline" href="/library">Go to library</Link>
        </div>
      </div>
    </div>
  );
}

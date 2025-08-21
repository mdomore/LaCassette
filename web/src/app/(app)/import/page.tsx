"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const ImportSchema = z.object({
  url: z
    .string()
    .url()
    .regex(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i, "Must be a YouTube URL"),
});

export default function ImportPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof ImportSchema>>({
    resolver: zodResolver(ImportSchema),
    defaultValues: { url: "" },
  });

  async function onSubmit(values: z.infer<typeof ImportSchema>) {
    setSubmitting(true);
    const res = await fetch("/api/import-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSubmitting(false);
    if (!res.ok) {
      const { error } = await res.json();
      form.setError("url", { message: error || "Import failed" });
      return;
    }
    router.push("/library");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Import audio from YouTube</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>YouTube URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://www.youtube.com/watch?v=..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={submitting}>
                {submitting ? "Importing..." : "Import"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

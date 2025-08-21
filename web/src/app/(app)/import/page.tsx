"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ImportSchema = z.object({
  url: z
    .string()
    .url()
    .regex(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i, "Must be a YouTube URL"),
});

export default function ImportPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [testResults, setTestResults] = useState<any>(null);

  const form = useForm<z.infer<typeof ImportSchema>>({
    resolver: zodResolver(ImportSchema),
    defaultValues: { url: "" },
  });

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setIsAuthenticated(true);
      setIsLoading(false);
    };
    checkAuth();
  }, [router]);

  const testAPI = async () => {
    try {
      const res = await fetch("/api/test");
      const data = await res.json();
      setDebugInfo(JSON.stringify(data, null, 2));
    } catch (error) {
      setDebugInfo(`Error: ${error}`);
    }
  };

  async function onSubmit(values: z.infer<typeof ImportSchema>) {
    setSubmitting(true);
    setDebugInfo("Starting import...");
    
    try {
      const res = await fetch("/api/import-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      
      if (!res.ok) {
        const { error } = await res.json();
        setDebugInfo(`Import failed: ${error}`);
        form.setError("url", { message: error || "Import failed" });
        return;
      }
      
      setDebugInfo("Import successful! Redirecting...");
      router.push("/library");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Network error";
      setDebugInfo(`Error: ${errorMsg}`);
      form.setError("url", { message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
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
          
          <div className="mt-6 space-y-2">
            <div className="flex gap-2">
              <Button onClick={testAPI} variant="outline" size="sm">
                Test API
              </Button>
              <Button onClick={async () => {
                try {
                  const res = await fetch("/api/env-check");
                  const data = await res.json();
                  setDebugInfo(JSON.stringify(data, null, 2));
                } catch (error) {
                  setDebugInfo(`Error: ${error}`);
                }
              }} variant="outline" size="sm">
                Check Env
              </Button>
              <Button onClick={async () => {
                try {
                  const testUrl = form.getValues("url");
                  if (!testUrl) {
                    setDebugInfo("Please enter a YouTube URL first");
                    return;
                  }
                  setDebugInfo("Testing both systems...");
                  setTestResults(null);
                  const res = await fetch("/api/test-systems", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: testUrl }),
                  });
                  const data = await res.json();
                  setDebugInfo(JSON.stringify(data, null, 2));
                  setTestResults(data);
                } catch (error) {
                  setDebugInfo(`Error: ${error}`);
                  setTestResults(null);
                }
              }} variant="outline" size="sm">
                Test Both Systems
              </Button>
              <Button onClick={async () => {
                try {
                  const testUrl = form.getValues("url");
                  if (!testUrl) {
                    setDebugInfo("Please enter a YouTube URL first");
                    return;
                  }
                  setDebugInfo("Testing import functionality...");
                  const res = await fetch("/api/import-youtube", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: testUrl }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setDebugInfo(`Import test successful! Method: ${data.method}, Title: ${data.title}`);
                  } else {
                    setDebugInfo(`Import test failed: ${data.error}`);
                  }
                } catch (error) {
                  setDebugInfo(`Import test error: ${error}`);
                }
              }} variant="outline" size="sm">
                Test Import
              </Button>
            </div>
            {debugInfo && (
              <div className="mt-4 p-3 bg-gray-100 rounded text-sm font-mono">
                <pre className="whitespace-pre-wrap">{debugInfo}</pre>
              </div>
            )}
            
            {/* Structured Test Report */}
            {testResults && testResults.success && (
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-semibold">Test Report</h3>
                
                {/* Overall Stats */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Overall Results</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{testResults.overallStats.total}</div>
                      <div className="text-blue-700">Total Systems</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{testResults.overallStats.passed}</div>
                      <div className="text-green-700">Passed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{testResults.overallStats.failed}</div>
                      <div className="text-red-700">Failed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{testResults.overallStats.successRate}</div>
                      <div className="text-blue-700">Success Rate</div>
                    </div>
                  </div>
                </div>
                
                {/* System Results */}
                {testResults.results.map((result: any, index: number) => (
                  <div key={index} className={`border rounded-lg p-4 ${
                    result.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className={`font-medium ${
                        result.passed ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {result.system}
                      </h4>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        result.passed 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {result.passed ? 'PASSED' : 'FAILED'}
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-3">
                      {result.summary}
                    </div>
                    
                    {/* Test Details */}
                    <div className="space-y-2">
                      {Object.entries(result.details).map(([key, detail]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${
                              detail.passed ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                            <span className="font-medium text-gray-700">
                              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className={`text-xs px-2 py-1 rounded ${
                              detail.passed 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {detail.passed ? 'PASS' : 'FAIL'}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {detail.message}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

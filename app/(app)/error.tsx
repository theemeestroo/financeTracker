"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <AlertTriangle className="size-4" style={{ color: "var(--status-critical)" }} />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred loading this page."}
          </p>
          <Button size="sm" onClick={() => reset()} className="self-start">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

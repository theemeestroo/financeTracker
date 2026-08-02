"use client";

import { useActionState } from "react";
import { PlaneTakeoff } from "lucide-react";
import { login, loginAsDemo } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  const [demoState, demoAction, demoPending] = useActionState(
    async (_prevState: { error?: string } | undefined, formData: FormData) => loginAsDemo(formData),
    undefined
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            <span className="gradient-brand flex size-9 shrink-0 items-center justify-center rounded-2xl text-primary-foreground">
              <PlaneTakeoff className="size-4.5" />
            </span>
            <span className="text-base font-semibold tracking-tight">Runaway</span>
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state?.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="mt-2">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <form action={demoAction} className="mt-5">
            {demoState?.error && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {demoState.error}
              </p>
            )}
            <Button type="submit" variant="outline" disabled={demoPending} className="w-full">
              {demoPending ? "Loading demo…" : "View Demo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

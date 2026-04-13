import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

type FormMode = "login" | "register" | "forgotPassword";

export default function Login() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<FormMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // Check for invite token in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      setInviteToken(invite);
      setMode("register");
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSuccessMessage("");
      setLoading(true);

      try {
        if (mode === "forgotPassword") {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data.error || "Request failed");
            return;
          }

          setSuccessMessage(data.message || "If an account exists, a reset link has been sent");
          return;
        }

        const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
        const body: Record<string, string> = { email, password };
        if (mode === "register" && name) body.name = name;
        if (mode === "register" && inviteToken) body.invite = inviteToken;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Authentication failed");
          return;
        }

        window.location.href = "/";
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, password, name, mode, inviteToken]
  );

  const switchMode = (newMode: FormMode) => {
    setMode(newMode);
    setError("");
    setSuccessMessage("");
  };

  const title = mode === "register"
    ? "Create Account"
    : mode === "forgotPassword"
      ? "Forgot Password"
      : "Sign In";

  const subtitle = mode === "register"
    ? "Enter your details to create an account"
    : mode === "forgotPassword"
      ? "Enter your email to receive a reset link"
      : "Enter your credentials to access the system";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 animate-fade-in">
        {inviteToken && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center dark:border-indigo-800 dark:bg-indigo-950">
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              You've been invited to join Superhumn
            </p>
            <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
              Create your account below to get started
            </p>
          </div>
        )}
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em] tracking-tight">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== "forgotPassword" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {mode === "login" && (
            <div className="text-right">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-primary underline"
                onClick={() => switchMode("forgotPassword")}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {successMessage && (
            <p className="text-sm text-green-600 dark:text-green-400">{successMessage}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "register"
                ? "Create Account"
                : mode === "forgotPassword"
                  ? "Send Reset Link"
                  : "Sign In"}
          </Button>
        </form>

        <div className="text-center text-sm">
          {mode === "register" ? (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => switchMode("login")}
              >
                Sign in
              </button>
            </p>
          ) : mode === "forgotPassword" ? (
            <p>
              Remember your password?{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => switchMode("login")}
              >
                Back to sign in
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => switchMode("register")}
              >
                Create one
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

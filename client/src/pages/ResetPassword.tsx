import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCallback, useState } from "react";
import { useLocation, useSearch } from "wouter";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        if (newPassword.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }

        if (newPassword !== confirmPassword) {
          setError("Passwords do not match");
          return;
        }

        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Password reset failed");
          return;
        }

        setSuccess(true);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [token, newPassword, confirmPassword]
  );

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 p-8 animate-fade-in text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Invalid Reset Link</h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or missing a token.
          </p>
          <Button className="w-full" onClick={() => navigate("/login")}>
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 p-8 animate-fade-in text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Password Reset</h1>
          <p className="text-sm text-green-600 dark:text-green-400">
            Your password has been reset successfully.
          </p>
          <Button className="w-full" onClick={() => navigate("/login")}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 animate-fade-in">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Reset Password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : "Reset Password"}
          </Button>
        </form>

        <div className="text-center text-sm">
          <p>
            Remember your password?{" "}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => navigate("/login")}
            >
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

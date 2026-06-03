import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCallback, useState } from "react";

export default function RecoverAccount() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSuccessMessage("");
      setLoading(true);

      try {
        const res = await fetch("/api/auth/admin-reset-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, newPassword, secret }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || data.reason || "Reset failed");
          return;
        }

        const created = data.created ? " A new credential was created." : "";
        setSuccessMessage(`${data.message || "Credentials reset."}${created} You can now sign in with the new password.`);
        setNewPassword("");
        setSecret("");
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, newPassword, secret]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 animate-fade-in">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em] tracking-tight">
            Account Recovery
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set a new password using the admin secret. Use when normal login and forgot-password don't work.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="At least 8 characters"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret">Admin secret (JWT_SECRET)</Label>
            <Input
              id="secret"
              type="password"
              placeholder="From Railway env vars"
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {successMessage && (
            <p className="text-sm text-green-600 dark:text-green-400">{successMessage}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : "Reset credentials"}
          </Button>
        </form>

        <div className="text-center text-sm">
          <a href="/login" className="text-primary underline">
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}

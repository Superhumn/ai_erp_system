// Public (unauthenticated) intake form fill page, mounted at /f/:slug outside
// the dashboard. Fetches the published form, renders it, and submits.

import { useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FormRenderer from "@/components/opsToolkit/FormRenderer";
import type { FormField } from "@shared/opsToolkit";

export default function FormFill() {
  const [, params] = useRoute("/f/:slug");
  const slug = (params as { slug?: string } | null)?.slug || "";
  const { data: form, isLoading, error } = trpc.opsForms.getPublic.useQuery({ slug }, { enabled: !!slug, retry: false });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const submit = trpc.opsForms.submit.useMutation({
    onSuccess: (r) => setDone(r.submitMessage || "Thanks! Your response has been recorded."),
  });

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/30 p-4 sm:p-8">
      <div className="w-full max-w-xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : !form || error ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            This form isn’t available. It may have been unpublished or the link is incorrect.
          </CardContent></Card>
        ) : done ? (
          <Card><CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <p className="text-lg font-medium">{done}</p>
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 p-6">
              <div>
                <h1 className="text-xl font-semibold">{form.name}</h1>
                {form.description && <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Your email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <FormRenderer
                fields={(form.fields as FormField[]) || []}
                submitting={submit.isPending}
                submitLabel="Submit"
                onSubmit={(data) => submit.mutate({ slug, data, submittedByName: name || undefined, submittedByEmail: email || undefined })}
              />

              {submit.error && <p className="text-sm text-destructive">{submit.error.message}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

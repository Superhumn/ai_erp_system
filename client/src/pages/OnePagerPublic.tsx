import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, Mail, DollarSign, Users, Target, Lightbulb, TrendingUp, Briefcase, Building2 } from "lucide-react";
import { useRoute } from "wouter";

export default function OnePagerPublic() {
  const [, params] = useRoute("/pitch/:slug");
  const slug = params?.slug || "";

  const { data: pager, isLoading, error } = trpc.onePager.getBySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !pager) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Not Found</h1>
          <p className="text-muted-foreground">This one-pager does not exist or is not published.</p>
        </div>
      </div>
    );
  }

  if (!pager.isPublished) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Not Published</h1>
          <p className="text-muted-foreground">This one-pager is not yet published.</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: string | null | undefined) => {
    if (!val) return null;
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return "$" + num.toLocaleString();
  };

  const roundLabel: Record<string, string> = {
    pre_seed: "Pre-Seed",
    seed: "Seed",
    series_a: "Series A",
    series_b: "Series B",
    bridge: "Bridge",
    other: "Other",
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          {pager.logoUrl && (
            <img src={pager.logoUrl} alt={pager.companyName} className="h-16 mx-auto mb-4" />
          )}
          <h1 className="text-4xl font-bold mb-2">{pager.companyName}</h1>
          {pager.tagline && (
            <p className="text-xl text-muted-foreground">{pager.tagline}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-4">
            {pager.askType && (
              <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                {roundLabel[pager.askType] || pager.askType}
              </Badge>
            )}
            {pager.askAmount && (
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                Raising {formatCurrency(pager.askAmount)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pager.problem && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-red-500" /> Problem
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.problem}</p>
              </CardContent>
            </Card>
          )}

          {pager.solution && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lightbulb className="h-5 w-5 text-yellow-500" /> Solution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.solution}</p>
              </CardContent>
            </Card>
          )}

          {pager.traction && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-green-500" /> Traction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.traction}</p>
              </CardContent>
            </Card>
          )}

          {pager.businessModel && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-blue-500" /> Business Model
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.businessModel}</p>
              </CardContent>
            </Card>
          )}

          {pager.market && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Briefcase className="h-5 w-5 text-orange-500" /> Market
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.market}</p>
              </CardContent>
            </Card>
          )}

          {pager.team && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-purple-500" /> Team
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.team}</p>
              </CardContent>
            </Card>
          )}

          {pager.useOfFunds && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-teal-500" /> Use of Funds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{pager.useOfFunds}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Contact footer */}
        {(pager.contactEmail || pager.websiteUrl) && (
          <div className="mt-10 text-center border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Get in Touch</h3>
            <div className="flex items-center justify-center gap-4">
              {pager.contactName && (
                <span className="text-muted-foreground">{pager.contactName}</span>
              )}
              {pager.contactEmail && (
                <a href={`mailto:${pager.contactEmail}`} className="inline-flex items-center gap-1 text-blue-500 hover:underline">
                  <Mail className="h-4 w-4" /> {pager.contactEmail}
                </a>
              )}
              {pager.websiteUrl && (
                <a href={pager.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-500 hover:underline">
                  <Globe className="h-4 w-4" /> Website
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

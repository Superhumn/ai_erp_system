import { useState, useMemo } from "react";

/**
 * Sanitize HTML to prevent XSS attacks from email content.
 * Strips script tags, event handlers, and dangerous protocols.
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove event handlers (onclick, onerror, onload, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove javascript: protocol from all attributes
  clean = clean.replace(/\b(href|src|action|data)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1=""');
  // Remove object, embed, applet, iframe tags
  clean = clean.replace(/<\s*\/?\s*(object|embed|applet|iframe|form|input|button|textarea)\b[^>]*>/gi, '');
  // Remove data: URIs in src attributes (except safe image types)
  clean = clean.replace(/\bsrc\s*=\s*"data:(?!image\/(png|jpeg|jpg|gif|webp|svg\+xml))[^"]*"/gi, 'src=""');
  // Remove meta refresh and base tags
  clean = clean.replace(/<\s*(meta|base|link)\b[^>]*>/gi, '');
  return clean;
}
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Send, RefreshCw, Eye, Bot, CheckCircle, XCircle, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  queued: { label: "Queued", color: "bg-gray-100 text-gray-800", icon: <Clock className="h-3 w-3" /> },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-800", icon: <Send className="h-3 w-3" /> },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-800", icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: "Failed", color: "bg-red-100 text-red-800", icon: <XCircle className="h-3 w-3" /> },
  bounced: { label: "Bounced", color: "bg-orange-100 text-orange-800", icon: <AlertCircle className="h-3 w-3" /> },
};

const entityTypeLabels: Record<string, string> = {
  purchase_order: "Purchase Order",
  invoice: "Invoice",
  rfq: "RFQ",
  quote: "Quote",
  shipment: "Shipment",
  work_order: "Work Order",
};

export function SentEmailsTab() {
  const [selectedEmail, setSelectedEmail] = useState<number | null>(null);
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();

  const { data: sentEmails, isLoading } = trpc.emailScanning.getSentEmails.useQuery({});
  const { data: emailDetail } = trpc.emailScanning.getSentEmail.useQuery(
    { id: selectedEmail! },
    { enabled: !!selectedEmail }
  );

  const handleViewRelatedEntity = (type: string, id: number) => {
    const routes: Record<string, string> = {
      purchase_order: `/operations/procurement-hub?po=${id}`,
      invoice: `/finance/invoices/${id}`,
      rfq: `/operations/procurement-hub?rfq=${id}`,
      work_order: `/operations/manufacturing-hub?wo=${id}`,
    };
    const route = routes[type];
    if (route) {
      navigate(route);
    } else {
      toast.info("Navigation to this entity type is not yet supported");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sent Emails</h3>
          <p className="text-sm text-muted-foreground">
            Track outbound emails sent from the system
          </p>
        </div>
        <Button variant="outline" onClick={() => utils.emailScanning.getSentEmails.invalidate()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !sentEmails || sentEmails.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Sent Emails</h3>
            <p className="text-sm text-muted-foreground">
              Emails sent from the system will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Email List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Sent Emails</CardTitle>
              <CardDescription>{sentEmails.length} emails</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {sentEmails.map((email: any) => {
                    const status = statusConfig[email.status] || statusConfig.queued;
                    return (
                      <div
                        key={email.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedEmail === email.id ? "bg-accent border-primary" : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedEmail(email.id)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-medium text-sm truncate flex-1">{email.toEmail}</p>
                          <Badge className={`${status.color} text-xs ml-2`}>
                            {status.icon}
                            <span className="ml-1">{status.label}</span>
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{email.subject}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {email.aiGenerated && (
                            <Badge variant="outline" className="text-xs">
                              <Bot className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                          {email.relatedEntityType && (
                            <Badge variant="outline" className="text-xs">
                              {entityTypeLabels[email.relatedEntityType] || email.relatedEntityType}
                            </Badge>
                          )}
                          <span>{new Date(email.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Email Detail */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Email Details</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedEmail ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Eye className="h-8 w-8 mb-2" />
                  <p>Select an email to view details</p>
                </div>
              ) : emailDetail ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">To</p>
                      <p className="font-medium">{emailDetail.toEmail}</p>
                      {emailDetail.toName && (
                        <p className="text-sm text-muted-foreground">{emailDetail.toName}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">From</p>
                      <p className="font-medium">{emailDetail.fromEmail}</p>
                      {emailDetail.fromName && (
                        <p className="text-sm text-muted-foreground">{emailDetail.fromName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="font-medium">{emailDetail.subject}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={statusConfig[emailDetail.status]?.color || ""}>
                      {statusConfig[emailDetail.status]?.icon}
                      <span className="ml-1">{statusConfig[emailDetail.status]?.label}</span>
                    </Badge>
                    {emailDetail.aiGenerated && (
                      <Badge variant="outline">
                        <Bot className="h-3 w-3 mr-1" />
                        AI Generated
                      </Badge>
                    )}
                  </div>

                  {emailDetail.relatedEntityType && emailDetail.relatedEntityId && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Related To</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewRelatedEntity(emailDetail.relatedEntityType!, emailDetail.relatedEntityId!)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View {entityTypeLabels[emailDetail.relatedEntityType] || emailDetail.relatedEntityType} #{emailDetail.relatedEntityId}
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p>{new Date(emailDetail.createdAt).toLocaleString()}</p>
                    </div>
                    {emailDetail.sentAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">Sent</p>
                        <p>{new Date(emailDetail.sentAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {emailDetail.errorMessage && (
                    <div className="p-3 bg-destructive/10 rounded-lg">
                      <p className="text-sm text-destructive">{emailDetail.errorMessage}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Body</p>
                    <div className="p-3 bg-muted rounded-lg max-h-[200px] overflow-y-auto">
                      {emailDetail.bodyHtml ? (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(emailDetail.bodyHtml) }}
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{emailDetail.bodyText}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Calendar as CalendarIcon, MapPin, Trash2 } from "lucide-react";

export default function CalendarEvents() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    summary: "",
    description: "",
    startDateTime: "",
    endDateTime: "",
    location: "",
    attendees: "",
  });

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.calendar.events.useQuery({});

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => {
      toast.success("Event created successfully");
      setIsOpen(false);
      resetForm();
      utils.calendar.events.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      toast.success("Event deleted successfully");
      utils.calendar.events.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setFormData({
      summary: "",
      description: "",
      startDateTime: "",
      endDateTime: "",
      location: "",
      attendees: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.summary) {
      toast.error("Summary is required");
      return;
    }
    if (!formData.startDateTime || !formData.endDateTime) {
      toast.error("Start and end times are required");
      return;
    }

    const attendees = formData.attendees
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    createMutation.mutate({
      summary: formData.summary,
      description: formData.description || undefined,
      startDateTime: new Date(formData.startDateTime).toISOString(),
      endDateTime: new Date(formData.endDateTime).toISOString(),
      location: formData.location || undefined,
      attendees: attendees.length > 0 ? attendees : undefined,
    });
  };

  const events: any[] = Array.isArray(data) ? data : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Calendar</h1>
          <p className="text-muted-foreground">Manage your Google Calendar events</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button disabled={!!error}>
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Event</DialogTitle>
              <DialogDescription>Create a new event on your Google Calendar</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Summary *</Label>
                <Input
                  placeholder="e.g., Team standup"
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Additional details about this event..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start *</Label>
                  <Input
                    type="datetime-local"
                    value={formData.startDateTime}
                    onChange={(e) => setFormData({ ...formData, startDateTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End *</Label>
                  <Input
                    type="datetime-local"
                    value={formData.endDateTime}
                    onChange={(e) => setFormData({ ...formData, endDateTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="e.g., Conference Room A"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Attendees</Label>
                <Input
                  placeholder="Comma-separated emails"
                  value={formData.attendees}
                  onChange={(e) => setFormData({ ...formData, attendees: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                Create Event
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Google Calendar isn't connected</CardTitle>
            <CardDescription>
              We couldn't reach your Google Calendar. Connect your Google account in Settings &rarr; Integrations to view and manage events here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Once Google is connected, your upcoming events will appear here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No events found. Create your first event.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium">{row.summary || "(No title)"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.start?.dateTime ?? row.start?.date ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.end?.dateTime ?? row.end?.date ?? "—"}
                      </TableCell>
                      <TableCell>
                        {row.location && (
                          <div className="flex items-start gap-1 text-sm">
                            <MapPin className="h-3 w-3 mt-1 text-muted-foreground" />
                            <span>{row.location}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this event?")) {
                                deleteMutation.mutate({ eventId: row.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

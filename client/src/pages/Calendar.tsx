import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  MapPin,
  Video,
  Users,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  { value: "meeting", label: "Meeting", color: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  { value: "call", label: "Call", color: "bg-green-500", badge: "bg-green-100 text-green-800" },
  { value: "investor_meeting", label: "Investor Meeting", color: "bg-purple-500", badge: "bg-purple-100 text-purple-800" },
  { value: "board_meeting", label: "Board Meeting", color: "bg-orange-500", badge: "bg-orange-100 text-orange-800" },
  { value: "deadline", label: "Deadline", color: "bg-red-500", badge: "bg-red-100 text-red-800" },
  { value: "milestone", label: "Milestone", color: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800" },
  { value: "reminder", label: "Reminder", color: "bg-gray-500", badge: "bg-gray-100 text-gray-800" },
  { value: "other", label: "Other", color: "bg-slate-500", badge: "bg-slate-100 text-slate-800" },
] as const;

const EVENT_STATUSES = [
  { value: "scheduled", label: "Scheduled", badge: "bg-blue-100 text-blue-800" },
  { value: "confirmed", label: "Confirmed", badge: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", badge: "bg-red-100 text-red-800" },
  { value: "completed", label: "Completed", badge: "bg-gray-100 text-gray-800" },
] as const;

const RECURRENCE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getEventTypeConfig(type: string) {
  return EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[EVENT_TYPES.length - 1];
}

function getEventStatusConfig(status: string) {
  return EVENT_STATUSES.find((s) => s.value === status) || EVENT_STATUSES[0];
}

function formatTime(dateStr: string | Date) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateShort(dateStr: string | Date) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startPadding - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push({ date, isCurrentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }

  // Next month padding to fill remaining cells (complete rows of 7)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
  }

  return days;
}

const emptyEventForm = {
  title: "",
  description: "",
  startDate: "",
  startTime: "09:00",
  endDate: "",
  endTime: "10:00",
  allDay: false,
  location: "",
  meetingUrl: "",
  type: "meeting",
  status: "scheduled",
  recurrence: "none",
  color: "",
};

export default function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [eventForm, setEventForm] = useState({ ...emptyEventForm });

  // Calculate the query date range for the current month view (include padding days)
  const queryRange = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startPadding = firstDay.getDay();
    const from = new Date(currentYear, currentMonth, -startPadding + 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const endPadding = 6 - lastDay.getDay();
    const to = new Date(currentYear, currentMonth + 1, endPadding);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [currentMonth, currentYear]);

  // Upcoming events range: today to 30 days from now
  const upcomingRange = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 30);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  // Queries
  const {
    data: events,
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = trpc.calendar.events.list.useQuery({
    from: queryRange.from,
    to: queryRange.to,
  });

  const { data: upcomingEvents, refetch: refetchUpcoming } =
    trpc.calendar.events.list.useQuery({
      from: upcomingRange.from,
      to: upcomingRange.to,
    });

  // Mutations
  const createEvent = trpc.calendar.events.create.useMutation({
    onSuccess: () => {
      toast.success("Event created");
      closeDialog();
      refetchEvents();
      refetchUpcoming();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateEvent = trpc.calendar.events.update.useMutation({
    onSuccess: () => {
      toast.success("Event updated");
      closeDialog();
      refetchEvents();
      refetchUpcoming();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteEvent = trpc.calendar.events.delete.useMutation({
    onSuccess: () => {
      toast.success("Event deleted");
      refetchEvents();
      refetchUpcoming();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Calendar grid
  const calendarDays = useMemo(
    () => getCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  // Events grouped by day (using date string as key)
  const eventsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!events) return map;
    for (const event of events) {
      const dateKey = new Date(event.startTime).toDateString();
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    }
    return map;
  }, [events]);

  // Events for selected day
  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    const key = selectedDate.toDateString();
    return (eventsByDay[key] || []).sort(
      (a: any, b: any) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [selectedDate, eventsByDay]);

  // Next 5 upcoming events
  const nextUpcomingEvents = useMemo(() => {
    if (!upcomingEvents) return [];
    const now = new Date();
    return upcomingEvents
      .filter((e: any) => new Date(e.startTime) >= now && e.status !== "cancelled")
      .sort(
        (a: any, b: any) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
      .slice(0, 5);
  }, [upcomingEvents]);

  // Navigation
  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function goToToday() {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(now);
  }

  // Dialog helpers
  function openCreateDialog(date?: Date) {
    const d = date || new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setEditingEvent(null);
    setEventForm({
      ...emptyEventForm,
      startDate: dateStr,
      endDate: dateStr,
    });
    setIsEventDialogOpen(true);
  }

  function openEditDialog(event: any) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;

    setEditingEvent(event);
    setEventForm({
      title: event.title || "",
      description: event.description || "",
      startDate,
      startTime,
      endDate,
      endTime,
      allDay: event.allDay || false,
      location: event.location || "",
      meetingUrl: event.meetingUrl || "",
      type: event.type || "meeting",
      status: event.status || "scheduled",
      recurrence: event.recurrence || "none",
      color: event.color || "",
    });
    setIsEventDialogOpen(true);
  }

  function closeDialog() {
    setIsEventDialogOpen(false);
    setEditingEvent(null);
    setEventForm({ ...emptyEventForm });
  }

  function handleSaveEvent() {
    if (!eventForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!eventForm.startDate) {
      toast.error("Start date is required");
      return;
    }

    const startTime = eventForm.allDay
      ? new Date(`${eventForm.startDate}T00:00:00`)
      : new Date(`${eventForm.startDate}T${eventForm.startTime}:00`);
    const endDate = eventForm.endDate || eventForm.startDate;
    const endTime = eventForm.allDay
      ? new Date(`${endDate}T23:59:59`)
      : new Date(`${endDate}T${eventForm.endTime}:00`);

    const payload: any = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || undefined,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      allDay: eventForm.allDay,
      location: eventForm.location.trim() || undefined,
      meetingUrl: eventForm.meetingUrl.trim() || undefined,
      type: eventForm.type,
      status: eventForm.status,
      recurrence: eventForm.recurrence === "none" ? undefined : eventForm.recurrence,
      color: eventForm.color || undefined,
    };

    if (editingEvent) {
      updateEvent.mutate({ id: editingEvent.id, ...payload });
    } else {
      createEvent.mutate(payload);
    }
  }

  function handleDeleteEvent(eventId: number) {
    if (window.confirm("Are you sure you want to delete this event?")) {
      deleteEvent.mutate({ id: eventId });
    }
  }

  const isSaving = createEvent.isPending || updateEvent.isPending;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-8 w-8" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Schedule and manage your events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-lg p-1">
            <Button variant="ghost" size="sm" onClick={goToPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2 min-w-[140px] text-center">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </span>
            <Button variant="ghost" size="sm" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button onClick={() => openCreateDialog(selectedDate || undefined)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Event
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid + Selected Day Panel */}
        <div className="lg:col-span-3 space-y-6">
          {/* Calendar Grid */}
          <Card>
            <CardContent className="pt-6">
              {eventsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-2">
                    {DAY_NAMES.map((day) => (
                      <div
                        key={day}
                        className="text-center text-sm font-medium text-muted-foreground py-2"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div className="grid grid-cols-7 border-t border-l">
                    {calendarDays.map(({ date, isCurrentMonth }, idx) => {
                      const dateKey = date.toDateString();
                      const dayEvents = eventsByDay[dateKey] || [];
                      const isToday = isSameDay(date, today);
                      const isSelected =
                        selectedDate && isSameDay(date, selectedDate);

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "border-r border-b min-h-[100px] p-1.5 cursor-pointer transition-colors hover:bg-muted/50",
                            !isCurrentMonth && "bg-muted/30",
                            isSelected && "bg-accent"
                          )}
                          onClick={() => setSelectedDate(date)}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "text-sm w-7 h-7 flex items-center justify-center rounded-full",
                                !isCurrentMonth && "text-muted-foreground",
                                isToday &&
                                  "bg-primary text-primary-foreground font-bold ring-2 ring-primary ring-offset-2",
                                isSelected && !isToday && "font-semibold"
                              )}
                            >
                              {date.getDate()}
                            </span>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 3).map((event: any) => {
                              const typeConfig = getEventTypeConfig(event.type);
                              return (
                                <div
                                  key={event.id}
                                  className={cn(
                                    "text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white",
                                    typeConfig.color
                                  )}
                                  title={event.title}
                                >
                                  {event.title}
                                </div>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <div className="text-[10px] text-muted-foreground px-1">
                                +{dayEvents.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selected Day Panel */}
          {selectedDate && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {selectedDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCreateDialog(selectedDate)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No events on this day.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map((event: any) => {
                      const typeConfig = getEventTypeConfig(event.type);
                      const statusConfig = getEventStatusConfig(event.status);
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div
                            className={cn(
                              "w-1 self-stretch rounded-full shrink-0",
                              typeConfig.color
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {event.title}
                              </span>
                              <Badge
                                variant="secondary"
                                className={cn("text-[10px]", typeConfig.badge)}
                              >
                                {typeConfig.label}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className={cn("text-[10px]", statusConfig.badge)}
                              >
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {event.allDay
                                  ? "All day"
                                  : `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </span>
                              )}
                              {event.meetingUrl && (
                                <a
                                  href={event.meetingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Video className="h-3 w-3" />
                                  Join Meeting
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEditDialog(event)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteEvent(event.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Upcoming Events Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Upcoming Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nextUpcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No upcoming events.
                </p>
              ) : (
                <div className="space-y-3">
                  {nextUpcomingEvents.map((event: any) => {
                    const typeConfig = getEventTypeConfig(event.type);
                    const startDate = new Date(event.startTime);
                    return (
                      <div
                        key={event.id}
                        className="p-2.5 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => {
                          setCurrentMonth(startDate.getMonth());
                          setCurrentYear(startDate.getFullYear());
                          setSelectedDate(startDate);
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              typeConfig.color
                            )}
                          />
                          <span className="font-medium text-sm truncate">
                            {event.title}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground ml-4 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {formatDateShort(event.startTime)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {event.allDay
                              ? "All day"
                              : formatTime(event.startTime)}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] mt-1.5 ml-4", typeConfig.badge)}
                        >
                          {typeConfig.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Event Dialog */}
      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Edit Event" : "Create Event"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm({ ...eventForm, title: e.target.value })
                }
                placeholder="Event title..."
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm({ ...eventForm, description: e.target.value })
                }
                placeholder="Event description..."
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="allDay"
                checked={eventForm.allDay}
                onCheckedChange={(checked) =>
                  setEventForm({ ...eventForm, allDay: !!checked })
                }
              />
              <Label htmlFor="allDay" className="cursor-pointer">
                All day event
              </Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={eventForm.startDate}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, startDate: e.target.value })
                  }
                />
              </div>
              {!eventForm.allDay && (
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={eventForm.startTime}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, startTime: e.target.value })
                    }
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={eventForm.endDate}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, endDate: e.target.value })
                  }
                />
              </div>
              {!eventForm.allDay && (
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={eventForm.endTime}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, endTime: e.target.value })
                    }
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Location</Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, location: e.target.value })
                  }
                  placeholder="Event location..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <Label>Meeting URL</Label>
              <div className="relative">
                <Video className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={eventForm.meetingUrl}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, meetingUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={eventForm.type}
                  onValueChange={(v) =>
                    setEventForm({ ...eventForm, type: v })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={eventForm.status}
                  onValueChange={(v) =>
                    setEventForm({ ...eventForm, status: v })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recurrence</Label>
                <Select
                  value={eventForm.recurrence}
                  onValueChange={(v) =>
                    setEventForm({ ...eventForm, recurrence: v })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Color (optional)</Label>
              <Input
                value={eventForm.color}
                onChange={(e) =>
                  setEventForm({ ...eventForm, color: e.target.value })
                }
                placeholder="#3b82f6"
                type="color"
                className="h-9 w-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveEvent} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingEvent ? "Update Event" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

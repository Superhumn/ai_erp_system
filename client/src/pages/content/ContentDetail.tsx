import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Upload,
  Image,
  Video,
  Music,
  Layers,
  MessageSquare,
  Clock,
  Send,
  Trash2,
  CheckCircle2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Edit3,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const mediaTypeIcons: Record<string, React.ElementType> = {
  image: Image,
  video: Video,
  audio: Music,
  mixed: Layers,
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-purple-100 text-purple-700",
};

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function ContentDetail() {
  const [, params] = useRoute("/content/calendar/:id");
  const [, navigate] = useLocation();
  const entryId = params?.id ? parseInt(params.id) : null;

  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentTimestamp, setCommentTimestamp] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [expandedComments, setExpandedComments] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const entry = trpc.contentCalendar.get.useQuery(
    { id: entryId! },
    { enabled: !!entryId }
  );

  const mediaList = trpc.contentCalendar.media.list.useQuery(
    { calendarEntryId: entryId! },
    { enabled: !!entryId }
  );

  const comments = trpc.contentCalendar.comments.list.useQuery(
    { mediaId: selectedMediaId! },
    { enabled: !!selectedMediaId }
  );

  const uploadMedia = trpc.contentCalendar.media.upload.useMutation({
    onSuccess: () => {
      mediaList.refetch();
      setShowUploadDialog(false);
    },
  });

  const deleteMedia = trpc.contentCalendar.media.delete.useMutation({
    onSuccess: () => {
      mediaList.refetch();
      setSelectedMediaId(null);
    },
  });

  const createComment = trpc.contentCalendar.comments.create.useMutation({
    onSuccess: () => {
      comments.refetch();
      setCommentText("");
      setCommentTimestamp("");
    },
  });

  const resolveComment = trpc.contentCalendar.comments.resolve.useMutation({
    onSuccess: () => comments.refetch(),
  });

  const deleteComment = trpc.contentCalendar.comments.delete.useMutation({
    onSuccess: () => comments.refetch(),
  });

  const updateEntry = trpc.contentCalendar.update.useMutation({
    onSuccess: () => {
      entry.refetch();
      setShowEditDialog(false);
    },
  });

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "draft" as string,
    platform: "",
    tags: "",
  });

  useEffect(() => {
    if (entry.data) {
      setEditForm({
        title: entry.data.title,
        description: entry.data.description || "",
        status: entry.data.status,
        platform: entry.data.platform || "",
        tags: entry.data.tags || "",
      });
    }
  }, [entry.data]);

  // Auto-select first media
  useEffect(() => {
    if (mediaList.data && mediaList.data.length > 0 && !selectedMediaId) {
      setSelectedMediaId(mediaList.data[0].id);
    }
  }, [mediaList.data, selectedMediaId]);

  const selectedMedia = mediaList.data?.find((m) => m.id === selectedMediaId);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !entryId) return;

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        let mediaType: "image" | "video" | "audio" = "image";
        if (file.type.startsWith("video/")) mediaType = "video";
        else if (file.type.startsWith("audio/")) mediaType = "audio";

        uploadMedia.mutate({
          calendarEntryId: entryId,
          fileName: file.name,
          fileData: base64,
          mediaType,
          mimeType: file.type,
          fileSizeBytes: file.size,
        });
      };
      reader.readAsDataURL(file);
    },
    [entryId, uploadMedia]
  );

  function handleTimeUpdate(el: HTMLVideoElement | HTMLAudioElement) {
    setCurrentTime(el.currentTime);
    setDuration(el.duration || 0);
  }

  function seekTo(seconds: number) {
    const el = videoRef.current || audioRef.current;
    if (el) {
      el.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }

  function togglePlay() {
    const el = videoRef.current || audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }

  function captureCurrentTimestamp() {
    setCommentTimestamp(currentTime.toFixed(2));
  }

  function handleSubmitComment() {
    if (!commentText.trim() || !selectedMediaId || !entryId) return;
    createComment.mutate({
      mediaId: selectedMediaId,
      calendarEntryId: entryId,
      comment: commentText,
      timestampSeconds: commentTimestamp || undefined,
    });
  }

  if (!entryId) return <div className="p-6">Invalid entry ID</div>;
  if (entry.isLoading) return <div className="p-6">Loading...</div>;
  if (!entry.data) return <div className="p-6">Content not found</div>;

  const data = entry.data;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/content/calendar")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{data.title}</h1>
            <Badge className={statusColors[data.status]}>
              {data.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {data.description || "No description"}
            {data.platform && <span> | {data.platform}</span>}
            {" | "}
            Scheduled: {new Date(data.scheduledDate).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowEditDialog(true)}>
          <Edit3 className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main media area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Media viewer */}
          <Card>
            <CardContent className="p-0">
              {selectedMedia ? (
                <div>
                  {selectedMedia.mediaType === "video" && (
                    <div className="relative bg-black rounded-t-lg">
                      <video
                        ref={videoRef}
                        src={selectedMedia.fileUrl}
                        className="w-full max-h-[500px] rounded-t-lg"
                        onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                      {/* Comment markers on timeline */}
                      {duration > 0 && comments.data && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                          {comments.data
                            .filter((c) => c.timestampSeconds)
                            .map((c) => {
                              const ts = parseFloat(c.timestampSeconds!);
                              const pct = (ts / duration) * 100;
                              return (
                                <div
                                  key={c.id}
                                  className={`absolute top-[-4px] w-3 h-3 rounded-full cursor-pointer transition-transform hover:scale-150 ${
                                    c.resolved ? "bg-green-400" : "bg-yellow-400"
                                  }`}
                                  style={{ left: `${pct}%` }}
                                  title={`${formatTimestamp(ts)} - ${c.comment.slice(0, 50)}`}
                                  onClick={() => seekTo(ts)}
                                />
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedMedia.mediaType === "audio" && (
                    <div className="p-8 bg-gradient-to-br from-primary/10 to-primary/5 rounded-t-lg">
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center">
                          <Music className="h-12 w-12 text-primary" />
                        </div>
                        <p className="font-medium">{selectedMedia.fileName}</p>
                        <audio
                          ref={audioRef}
                          src={selectedMedia.fileUrl}
                          onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
                          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                        />
                        {/* Audio timeline with comment markers */}
                        {duration > 0 && (
                          <div className="w-full relative">
                            <div className="w-full h-2 bg-muted rounded-full relative">
                              <div
                                className="h-2 bg-primary rounded-full"
                                style={{ width: `${(currentTime / duration) * 100}%` }}
                              />
                              {comments.data
                                ?.filter((c) => c.timestampSeconds)
                                .map((c) => {
                                  const ts = parseFloat(c.timestampSeconds!);
                                  const pct = (ts / duration) * 100;
                                  return (
                                    <div
                                      key={c.id}
                                      className={`absolute top-[-2px] w-3 h-3 rounded-full cursor-pointer hover:scale-150 transition-transform ${
                                        c.resolved ? "bg-green-400" : "bg-yellow-400"
                                      }`}
                                      style={{ left: `${pct}%` }}
                                      title={`${formatTimestamp(ts)} - ${c.comment.slice(0, 50)}`}
                                      onClick={() => seekTo(ts)}
                                    />
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedMedia.mediaType === "image" && (
                    <div className="bg-muted/20 rounded-t-lg flex items-center justify-center p-4">
                      <img
                        src={selectedMedia.fileUrl}
                        alt={selectedMedia.fileName}
                        className="max-h-[500px] object-contain rounded"
                      />
                    </div>
                  )}

                  {/* Transport controls for video/audio */}
                  {(selectedMedia.mediaType === "video" || selectedMedia.mediaType === "audio") && (
                    <div className="px-4 py-3 border-t flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => seekTo(Math.max(0, currentTime - 5))}>
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => seekTo(Math.min(duration, currentTime + 5))}>
                        <SkipForward className="h-4 w-4" />
                      </Button>
                      <div className="flex-1">
                        <input
                          type="range"
                          min={0}
                          max={duration || 0}
                          step={0.1}
                          value={currentTime}
                          onChange={(e) => seekTo(parseFloat(e.target.value))}
                          className="w-full h-1 accent-primary"
                        />
                      </div>
                      <span className="text-sm font-mono text-muted-foreground min-w-[80px] text-right">
                        {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={captureCurrentTimestamp}
                        title="Pin comment at current time"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Pin
                      </Button>
                    </div>
                  )}

                  {/* Media info bar */}
                  <div className="px-4 py-2 border-t bg-muted/20 flex items-center justify-between text-sm text-muted-foreground rounded-b-lg">
                    <span>{selectedMedia.fileName}</span>
                    <div className="flex items-center gap-2">
                      {selectedMedia.fileSizeBytes && (
                        <span>{(selectedMedia.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => {
                          if (confirm("Delete this media file?")) {
                            deleteMedia.mutate({ id: selectedMedia.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Upload className="h-12 w-12 mb-3 opacity-30" />
                  <p>No media uploaded yet</p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => setShowUploadDialog(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Media
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Media thumbnails / selector */}
          {mediaList.data && mediaList.data.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {mediaList.data.map((media) => {
                const Icon = mediaTypeIcons[media.mediaType] || Layers;
                const isSelected = media.id === selectedMediaId;
                return (
                  <button
                    key={media.id}
                    className={`flex-shrink-0 p-2 rounded-lg border-2 transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedMediaId(media.id)}
                  >
                    {media.mediaType === "image" ? (
                      <img
                        src={media.fileUrl}
                        alt={media.fileName}
                        className="w-16 h-16 object-cover rounded"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center bg-muted rounded">
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs mt-1 truncate max-w-[64px]">{media.fileName}</p>
                  </button>
                );
              })}
              <button
                className="flex-shrink-0 w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center hover:border-primary/50 transition-colors"
                onClick={() => setShowUploadDialog(true)}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        {/* Comments panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Comments
                  {comments.data && (
                    <Badge variant="secondary">{comments.data.length}</Badge>
                  )}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setExpandedComments(!expandedComments)}
                >
                  {expandedComments ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>

            {expandedComments && (
              <CardContent className="space-y-3">
                {/* Add comment */}
                {selectedMediaId && (
                  <div className="space-y-2 pb-3 border-b">
                    <Textarea
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex items-center gap-2">
                      {commentTimestamp && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(parseFloat(commentTimestamp))}
                          <button
                            onClick={() => setCommentTimestamp("")}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                      {(selectedMedia?.mediaType === "video" || selectedMedia?.mediaType === "audio") && !commentTimestamp && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={captureCurrentTimestamp}
                          className="text-xs"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          Add timestamp
                        </Button>
                      )}
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        onClick={handleSubmitComment}
                        disabled={!commentText.trim() || createComment.isPending}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Send
                      </Button>
                    </div>
                  </div>
                )}

                {/* Comments list */}
                {!selectedMediaId ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Select a media file to view comments
                  </p>
                ) : comments.isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
                ) : !comments.data || comments.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No comments yet. Be the first to leave feedback!
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {comments.data.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-3 rounded-lg border text-sm ${
                          comment.resolved ? "bg-muted/30 opacity-70" : "bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            {comment.timestampSeconds && (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded mb-1 hover:bg-primary/20 transition-colors"
                                onClick={() => seekTo(parseFloat(comment.timestampSeconds!))}
                              >
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(parseFloat(comment.timestampSeconds))}
                              </button>
                            )}
                            <p className={comment.resolved ? "line-through" : ""}>
                              {comment.comment}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(comment.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!comment.resolved && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title="Resolve"
                                onClick={() => resolveComment.mutate({ id: comment.id })}
                              >
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Delete"
                              onClick={() => deleteComment.mutate({ id: comment.id })}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Tags */}
          {data.tags && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {data.tags.split(",").map((tag) => (
                    <Badge key={tag.trim()} variant="outline">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload an image, video, or audio file to collaborate on.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              onChange={handleFileUpload}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
            {uploadMedia.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                Uploading...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Content Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Platform</Label>
                <Input
                  value={editForm.platform}
                  onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Tags</Label>
              <Input
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                updateEntry.mutate({
                  id: entryId!,
                  ...editForm,
                  status: editForm.status as any,
                })
              }
              disabled={updateEntry.isPending}
            >
              {updateEntry.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

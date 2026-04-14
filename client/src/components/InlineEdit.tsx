import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  type?: "text" | "number";
}

export default function InlineEdit({ value, onSave, className, placeholder, type = "text" }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") { setEditValue(value); setEditing(false); }
        }}
        className={cn("h-7 text-xs px-1.5 py-0.5 rounded-lg w-full", className)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "cursor-pointer hover:bg-accent/60 rounded px-1 py-0.5 -mx-1 transition-colors inline-block min-w-[20px]",
        !value && "text-muted-foreground/50 italic",
        className
      )}
      title="Click to edit"
    >
      {value || placeholder || "—"}
    </span>
  );
}

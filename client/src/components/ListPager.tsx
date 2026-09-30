import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, pageRange } from "@/lib/paging";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

/** "Showing 51–100 of 1,000,000" with page size and previous/next, for server-paged lists. */
export function ListPager({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const r = pageRange(page, pageSize, total);
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap pt-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Showing{" "}
          <span className="font-mono text-foreground">
            {r.from.toLocaleString()}–{r.to.toLocaleString()}
          </span>{" "}
          of <span className="font-mono text-foreground">{total.toLocaleString()}</span>
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="w-[110px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={!r.hasPrev}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          Page {(page + 1).toLocaleString()} of {r.pageCount.toLocaleString()}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={!r.hasNext}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

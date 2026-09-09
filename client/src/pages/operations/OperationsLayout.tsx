import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Package } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  OPERATIONS_ROOT,
  sectionForPath,
  visibleOperationsSections,
} from "./operationsNav";

/**
 * The Operations shell: one heading, one row of section tabs, and — once you
 * are inside a section — the pages within it.
 *
 * Operations gets a single frozen sidebar entry for ~30 pages, so this bar is
 * the only way to move between them. It stays mounted across every Operations
 * route, which is what makes a sub-page a place you can navigate out of rather
 * than a dead end you have to hit Back from.
 */
export default function OperationsLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const sections = visibleOperationsSections(user?.role);
  const activeSection = sectionForPath(location);
  const onOverview = location === OPERATIONS_ROOT;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-3">
        <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
          <Package className="h-4 w-4" />
          Operations
        </h1>

        {/* Sections. Scrolls rather than wraps so the row stays one line. */}
        <nav
          aria-label="Operations sections"
          className="flex items-center gap-1 overflow-x-auto border-b border-border/40 pb-px"
        >
          <SectionTab href={OPERATIONS_ROOT} active={onOverview}>
            Overview
          </SectionTab>
          {sections.map((section) => (
            <SectionTab
              key={section.id}
              href={section.path}
              active={!onOverview && activeSection?.id === section.id}
            >
              <section.icon className="h-3.5 w-3.5" />
              {section.label}
            </SectionTab>
          ))}
        </nav>

        {/* Pages within the active section. Hidden on the overview, which
            already lists every page as a card. */}
        {activeSection && !onOverview && (
          <nav
            aria-label={`${activeSection.label} pages`}
            className="flex items-center gap-1 overflow-x-auto"
          >
            {sections
              .find((section) => section.id === activeSection.id)
              ?.items.map((item) => {
                const active =
                  location === item.path ||
                  location.startsWith(`${item.path}/`);
                return (
                  <Link key={item.path} href={item.path}>
                    <span
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
          </nav>
        )}
      </div>

      {children}
    </div>
  );
}

function SectionTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href}>
      <span
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-1.5 text-xs transition-colors cursor-pointer -mb-px",
          active
            ? "border-primary text-foreground font-medium"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
      </span>
    </Link>
  );
}

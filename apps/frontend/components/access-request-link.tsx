import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { getAccessRequestUrl } from "@/lib/app-env";
import { cn } from "@/lib/utils";

/** Host shown next to the link so people know where it goes, e.g. "linkedin.com". */
export function accessRequestHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/**
 * "Request access" link to NEXT_PUBLIC_ACCESS_REQUEST_URL. Renders nothing when the variable is
 * unset, so forks don't send people to someone else's profile. No hooks: it renders in server
 * pages and inside client pages alike.
 */
export function AccessRequestLink({
  children,
  newTabLabel,
  showHost = false,
  className,
  hostClassName,
}: {
  children: ReactNode;
  /** Screen-reader hint in the page's language, e.g. "opens in a new tab". */
  newTabLabel: string;
  showHost?: boolean;
  className?: string;
  hostClassName?: string;
}) {
  const href = getAccessRequestUrl();
  if (!href) return null;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-2", className)}>
      {children}
      {showHost ? <span className={hostClassName}>{accessRequestHost(href)}</span> : null}
      <ExternalLink aria-hidden className="h-4 w-4 shrink-0" />
      <span className="sr-only"> ({newTabLabel})</span>
    </a>
  );
}

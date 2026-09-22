"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type ExpandableObservationProps = {
  text?: string | null;
  collapsedLines: 2 | 3;
  emptyFallback?: string;
  className?: string;
};

const LINE_CLAMP_CLASSES = {
  2: "line-clamp-2",
  3: "line-clamp-3",
} as const;

export function ExpandableObservation(props: ExpandableObservationProps) {
  const observationKey = props.text ?? "";
  return <ExpandableObservationInner key={observationKey} {...props} />;
}

function ExpandableObservationInner({
  text,
  collapsedLines,
  emptyFallback = "-",
  className,
}: ExpandableObservationProps) {
  const textId = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const trimmed = text?.trim();
  const isEmpty = !trimmed;

  const measureOverflow = useCallback(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setHasOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useLayoutEffect(() => {
    measureOverflow();
  }, [measureOverflow]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        if (!expanded) {
          setHasOverflow(el.scrollHeight > el.clientHeight + 1);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }

    const handleResize = () => {
      if (!expanded) {
        setHasOverflow(el.scrollHeight > el.clientHeight + 1);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [expanded]);

  if (isEmpty) {
    return <p className={className}>{emptyFallback}</p>;
  }

  const showToggle = hasOverflow || expanded;

  return (
    <div>
      <p
        id={textId}
        ref={textRef}
        className={[
          "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          !expanded ? LINE_CLAMP_CLASSES[collapsedLines] : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {text}
      </p>
      {showToggle ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 rounded text-xs font-medium text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
    </div>
  );
}

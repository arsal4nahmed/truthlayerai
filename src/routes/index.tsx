import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ShieldCheck,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TruthLayer — AI Fact Checker" },
      {
        name: "description",
        content:
          "Upload a PDF and let TruthLayer verify its factual claims against live web data. Each claim flagged as Verified, Inaccurate, or False.",
      },
      { property: "og:title", content: "TruthLayer — AI Fact Checker" },
      {
        property: "og:description",
        content: "AI-powered fact verification for PDF documents.",
      },
    ],
  }),
  component: Index,
});

type Status = "Verified" | "Inaccurate" | "False";
type Claim = {
  claim: string;
  status: Status;
  explanation: string;
  correct_fact: string;
  source: string;
};

const STEPS = [
  "Extracting claims...",
  "Searching the web...",
  "Generating report...",
];

function Index() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const reset = () => {
    setFile(null);
    setClaims(null);
    setError(null);
    setLoading(false);
    setStepIdx(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setClaims(null);
    setStepIdx(0);

    const stepTimer = setInterval(() => {
      setStepIdx((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 2500);

    try {
      const buf = await file.arrayBuffer();
      // base64 encode
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk)),
        );
      }
      const pdf_base64 = btoa(binary);

      const { data, error: fnErr } = await supabase.functions.invoke("fact-check", {
        body: { pdf_base64 },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      const list: Claim[] = Array.isArray(data?.claims) ? data.claims : [];
      setClaims(list);
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (!claims) return null;
    return {
      total: claims.length,
      verified: claims.filter((c) => c.status === "Verified").length,
      inaccurate: claims.filter((c) => c.status === "Inaccurate").length,
      false_: claims.filter((c) => c.status === "False").length,
    };
  }, [claims]);

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
        {!claims && (
          <section className="space-y-8">
            {!loading && (
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  AI-powered fact verification
                </div>
                <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
                  Verify every claim in your PDF.
                </h1>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Upload a document. We'll extract the factual claims and check
                  each one against live web sources.
                </p>
              </div>
            )}

            {!loading && (
              <DropZone
                file={file}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDrop={onDrop}
                onPick={() => inputRef.current?.click()}
                onClear={reset}
              />
            )}

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {error && (
              <div className="glass rounded-xl p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {!loading && (
              <div className="flex justify-center">
                <button
                  onClick={analyze}
                  disabled={!file}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition",
                    "bg-primary text-primary-foreground hover:opacity-90",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    file && "glow-indigo",
                  )}
                >
                  <ShieldCheck className="size-4" />
                  Analyze Document
                </button>
              </div>
            )}

            {loading && <LoadingState stepIdx={stepIdx} />}
          </section>
        )}

        {claims && summary && (
          <section className="space-y-6">
            <SummaryBar summary={summary} onReset={reset} />
            <div className="grid gap-4">
              {claims.length === 0 && (
                <div className="glass rounded-2xl p-8 text-center text-muted-foreground">
                  No claims were extracted from this document.
                </div>
              )}
              {claims.map((c, i) => (
                <ClaimCard key={i} claim={c} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="mx-auto max-w-5xl px-4 pt-8">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="size-10 rounded-xl bg-primary/15 border border-primary/30 grid place-items-center">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div className="absolute -inset-1 rounded-2xl bg-primary/20 blur-xl -z-10" />
        </div>
        <div>
          <div className="font-display text-lg font-semibold tracking-tight">
            TruthLayer
          </div>
          <div className="text-xs text-muted-foreground">
            AI-powered fact verification
          </div>
        </div>
      </div>
    </header>
  );
}

function DropZone({
  file,
  dragOver,
  setDragOver,
  onDrop,
  onPick,
  onClear,
}: {
  file: File | null;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={file ? undefined : onPick}
      className={cn(
        "glass rounded-2xl p-10 transition cursor-pointer text-center",
        dragOver && "glow-indigo",
        file && "cursor-default",
      )}
    >
      {!file ? (
        <div className="flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-primary/10 border border-primary/30 grid place-items-center">
            <Upload className="size-6 text-primary" />
          </div>
          <div className="font-medium">Drop your PDF here</div>
          <div className="text-sm text-muted-foreground">
            or <span className="text-primary underline-offset-4 hover:underline">click to browse</span> · PDF only
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-12 rounded-xl bg-primary/15 border border-primary/30 grid place-items-center shrink-0">
              <FileText className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingState({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="glass rounded-2xl p-10 flex flex-col items-center gap-6">
      <div className="relative">
        <Loader2 className="size-10 text-primary animate-spin" />
        <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl -z-10" />
      </div>
      <div className="space-y-2 w-full max-w-xs">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex items-center gap-3 text-sm transition",
              i < stepIdx && "text-muted-foreground",
              i === stepIdx && "text-foreground",
              i > stepIdx && "text-muted-foreground/50",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                i <= stepIdx ? "bg-primary" : "bg-muted-foreground/30",
                i === stepIdx && "animate-pulse",
              )}
            />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryBar({
  summary,
  onReset,
}: {
  summary: { total: number; verified: number; inaccurate: number; false_: number };
  onReset: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Stat label="Total claims" value={summary.total} />
        <Stat
          label="Verified"
          value={summary.verified}
          icon={<CheckCircle2 className="size-4 text-verified" />}
        />
        <Stat
          label="Inaccurate"
          value={summary.inaccurate}
          icon={<AlertTriangle className="size-4 text-inaccurate" />}
        />
        <Stat
          label="False"
          value={summary.false_}
          icon={<XCircle className="size-4 text-false" />}
        />
      </div>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary transition"
      >
        <RotateCcw className="size-3.5" />
        Check Another Document
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-2xl font-display font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ClaimCard({ claim }: { claim: Claim }) {
  const cfg = {
    Verified: {
      badgeBg: "bg-verified/15 text-verified border-verified/40",
      Icon: CheckCircle2,
      accent: "from-verified/60 to-transparent",
    },
    Inaccurate: {
      badgeBg: "bg-inaccurate/15 text-inaccurate border-inaccurate/40",
      Icon: AlertTriangle,
      accent: "from-inaccurate/60 to-transparent",
    },
    False: {
      badgeBg: "bg-false/15 text-false border-false/40",
      Icon: XCircle,
      accent: "from-false/60 to-transparent",
    },
  }[claim.status] ?? {
    badgeBg: "bg-muted text-muted-foreground border-border",
    Icon: AlertTriangle,
    accent: "from-muted to-transparent",
  };

  const Icon = cfg.Icon;

  return (
    <article className="glass rounded-2xl overflow-hidden relative">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r",
          cfg.accent,
        )}
      />
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <p className="text-base font-medium leading-relaxed">"{claim.claim}"</p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shrink-0",
              cfg.badgeBg,
            )}
          >
            <Icon className="size-3.5" />
            {claim.status}
          </span>
        </div>

        {claim.explanation && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Explanation
            </div>
            <p className="text-sm text-foreground/90">{claim.explanation}</p>
          </div>
        )}

        {claim.correct_fact && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Correct fact
            </div>
            <p className="text-sm text-foreground/90">{claim.correct_fact}</p>
          </div>
        )}

        {claim.source && (
          <a
            href={claim.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-4 break-all"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            {claim.source}
          </a>
        )}
      </div>
    </article>
  );
}

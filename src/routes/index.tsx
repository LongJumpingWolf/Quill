import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  FilePlus2,
  FileText,
  Grid2x2,
  List as ListIcon,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  countStats,
  createDoc,
  deleteDoc,
  duplicateDoc,
  listDocs,
  plainText,
  relativeTime,
  subscribe,
  updateDoc,
  type Doc,
} from "@/lib/docs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quill Office — Write, format and export documents" },
      {
        name: "description",
        content:
          "A full-featured document editor with a Word-style ribbon: rich formatting, tables, images, page layout, find & replace, and export to Word, HTML or PDF.",
      },
      { property: "og:title", content: "Quill Office — Word-style document editor" },
      {
        property: "og:description",
        content:
          "Create, edit and export documents in your browser with a familiar ribbon toolbar and real page layout.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const TEMPLATES: { name: string; description: string; html: string }[] = [
  {
    name: "Blank document",
    description: "Start from an empty page",
    html: "<p><br></p>",
  },
  {
    name: "Business letter",
    description: "Formal letter with header",
    html: `<p>Your Name<br>Street Address<br>City, State ZIP</p><p>${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</p><p>Recipient Name<br>Company</p><p>Dear Recipient,</p><p><br></p><p>Sincerely,<br>Your Name</p>`,
  },
  {
    name: "Meeting notes",
    description: "Agenda, notes, action items",
    html: `<h1>Meeting notes</h1><p><strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp; <strong>Attendees:</strong> </p><h2>Agenda</h2><ul><li>Item one</li><li>Item two</li></ul><h2>Discussion</h2><p><br></p><h2>Action items</h2><ol><li>Owner — task — due date</li></ol>`,
  },
  {
    name: "Project report",
    description: "Sections and summary table",
    html: `<h1>Project report</h1><h2>Executive summary</h2><p><br></p><h2>Progress</h2><table><tr><th>Milestone</th><th>Status</th><th>Owner</th></tr><tr><td>Kickoff</td><td>Complete</td><td></td></tr><tr><td>Delivery</td><td>In progress</td><td></td></tr></table><h2>Risks</h2><ul><li></li></ul>`,
  },
  {
    name: "Resume",
    description: "Classic single-column CV",
    html: `<h1 style="text-align:center">Your Name</h1><p style="text-align:center">email@example.com · +1 555 000 0000 · City</p><hr><h2>Experience</h2><p><strong>Job Title</strong> — Company, 2022–Present</p><ul><li>Achievement</li></ul><h2>Education</h2><p><strong>Degree</strong> — University, Year</p><h2>Skills</h2><p></p>`,
  },
];

function Home() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "starred">("all");

  useEffect(() => {
    const load = () => setDocs(listDocs());
    load();
    return subscribe(load);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return docs
      .filter((d) => (filter === "starred" ? d.starred : true))
      .filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          plainText(d.html).toLowerCase().includes(q),
      );
  }, [docs, query, filter]);

  const open = (id: string) => navigate({ to: "/doc/$id", params: { id } });

  const startNew = (html: string, title?: string) => {
    const doc = createDoc({ html, title: title && title !== "Blank document" ? title : "Untitled document" });
    open(doc.id);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-ribbon text-ribbon-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            <span className="text-lg font-semibold tracking-tight">Quill Office</span>
          </div>
          <div className="relative ml-auto w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents"
              className="h-9 bg-card pl-9 text-foreground"
            />
          </div>
          <Button onClick={() => startNew("<p><br></p>")} variant="secondary">
            <FilePlus2 className="mr-1.5 h-4 w-4" /> New document
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Start a new document</h1>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => startNew(t.html, t.name)}
              className="group rounded-lg border border-border bg-card p-3 text-left transition-shadow hover:shadow-md"
            >
              <div className="mb-3 aspect-[3/4] overflow-hidden rounded-sm bg-paper p-2 shadow-inner">
                <div
                  className="doc-page origin-top-left scale-[0.28] text-[11px]"
                  style={{ width: 300, boxShadow: "none" }}
                  dangerouslySetInnerHTML={{ __html: t.html }}
                />
              </div>
              <p className="truncate text-sm font-medium">{t.name}</p>
              <p className="truncate text-xs text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Your documents</h2>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            {(["all", "starred"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium capitalize",
                  filter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className={cn("rounded p-1.5", view === "grid" && "bg-accent text-accent-foreground")}
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="List view"
              onClick={() => setView("list")}
              className={cn("rounded p-1.5", view === "list" && "bg-accent text-accent-foreground")}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No documents yet</p>
            <p className="text-sm text-muted-foreground">
              Pick a template above or create a blank document to get started.
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((d) => (
              <article
                key={d.id}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => open(d.id)}
                  className="block w-full bg-canvas/60 p-3 text-left"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-sm bg-paper shadow-sm">
                    <div
                      className="doc-page origin-top-left scale-[0.3] p-4 text-[11px]"
                      style={{ width: 300, boxShadow: "none" }}
                      dangerouslySetInnerHTML={{ __html: d.html }}
                    />
                  </div>
                </button>
                <div className="flex items-start gap-1 border-t border-border px-3 py-2">
                  <button type="button" onClick={() => open(d.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(d.updatedAt)} · {countStats(d.html).words} words
                    </p>
                  </button>
                  <DocActions doc={d} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <FileText className="h-4 w-4 text-primary" />
                <button type="button" onClick={() => open(d.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {plainText(d.html).slice(0, 90) || "Empty document"}
                  </p>
                </button>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {relativeTime(d.updatedAt)}
                </span>
                <DocActions doc={d} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DocActions({ doc }: { doc: Doc }) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={doc.starred ? "Unstar document" : "Star document"}
        onClick={() => updateDoc(doc.id, { starred: !doc.starred, updatedAt: doc.updatedAt })}
        className="rounded p-1.5 hover:bg-accent"
      >
        <Star className={cn("h-4 w-4", doc.starred ? "fill-chart-3 text-chart-3" : "text-muted-foreground")} />
      </button>
      <button
        type="button"
        aria-label="Duplicate document"
        onClick={() => {
          duplicateDoc(doc.id);
          toast.success("Document duplicated");
        }}
        className="rounded p-1.5 hover:bg-accent"
      >
        <Copy className="h-4 w-4 text-muted-foreground" />
      </button>
      <button
        type="button"
        aria-label="Delete document"
        onClick={() => {
          if (window.confirm(`Delete "${doc.title}"?`)) {
            deleteDoc(doc.id);
            toast.success("Document deleted");
          }
        }}
        className="rounded p-1.5 hover:bg-accent"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WordEditor } from "@/components/docs/word-editor";
import { getDoc, subscribe, whenReady, type Doc } from "@/lib/docs";

export const Route = createFileRoute("/doc/$id")({
  head: () => ({
    meta: [
      { title: "Editor — Quill Office" },
      {
        name: "description",
        content:
          "Edit your document with a Word-style ribbon: fonts, colors, tables, images, page layout, find & replace and export.",
      },
      { property: "og:title", content: "Document editor — Quill Office" },
      {
        property: "og:description",
        content:
          "Rich document editing with real page layout, autosave and export to Word, HTML or PDF.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentRoute,
});

function DocumentRoute() {
  const { id } = Route.useParams();
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);

  useEffect(() => {
    setDoc(undefined);
    let cancelled = false;
    const check = () => {
      if (!cancelled) setDoc(getDoc(id) ?? null);
    };
    // IndexedDB hydration is async, so a direct link or a refresh can land
    // here before the document list has loaded — wait for it rather than
    // reporting "not found" prematurely.
    void whenReady().then(check);
    const unsubscribe = subscribe(check);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  if (doc === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-sm text-muted-foreground">
        Opening document…
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-lg font-semibold">Document not found</h1>
        <p className="text-sm text-muted-foreground">It may have been deleted from this browser.</p>
        <Link to="/" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          Back to documents
        </Link>
      </div>
    );
  }

  return <WordEditor doc={doc} />;
}

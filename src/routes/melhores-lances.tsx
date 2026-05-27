import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Film, Plus, Trash2, Loader2, Calendar, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Highlight {
  id: string;
  title: string;
  recorded_on: string;
  video_path: string;
  created_at: string;
}

interface HighlightView extends Highlight {
  url: string;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15MB limit

export const Route = createFileRoute("/melhores-lances")({
  component: HighlightsPage,
});

function HighlightsPage() {
  const [items, setItems] = useState<HighlightView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      navigate({ to: "/login" });
      return;
    }
    const { data, error } = await supabase
      .from("highlights")
      .select("*")
      .order("recorded_on", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar", { description: error.message });
      setLoading(false);
      return;
    }
    const withUrls = await Promise.all(
      (data ?? []).map(async (h) => {
        const { data: signed } = await supabase.storage
          .from("highlights")
          .createSignedUrl(h.video_path, 60 * 60);
        return { ...h, url: signed?.signedUrl ?? "" };
      }),
    );
    setItems(withUrls);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRemove(h: HighlightView) {
    if (!confirm(`Remover "${h.title}"?`)) return;
    const prev = items;
    setItems((cur) => cur.filter((x) => x.id !== h.id));
    const { error: delErr } = await supabase.from("highlights").delete().eq("id", h.id);
    if (delErr) {
      setItems(prev);
      toast.error("Erro ao remover", { description: delErr.message });
      return;
    }
    await supabase.storage.from("highlights").remove([h.video_path]);
    toast.success("Lance removido");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Film className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Meus melhores lances</h1>
              <p className="text-sm text-muted-foreground">Gols e assistências em vídeo</p>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Link>
        </header>

        <div className="mb-6">
          {showForm ? (
            <UploadForm
              onCancel={() => setShowForm(false)}
              onUploaded={() => {
                setShowForm(false);
                load();
              }}
            />
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Carregar novo vídeo
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando vídeos...
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lance registrado ainda.</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {items.map((h) => (
              <li key={h.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <video
                  src={h.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full bg-black"
                />
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h.title}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {formatDate(h.recorded_on)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(h)}
                    aria-label="Remover"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function UploadForm({ onCancel, onUploaded }: { onCancel: () => void; onUploaded: () => void }) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [title, setTitle] = useState("");
  const [recordedOn, setRecordedOn] = useState(todayStr);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Selecione um vídeo");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo muito grande", {
        description: "Use vídeos de até 15MB (cerca de 60s).",
      });
      return;
    }
    setUploading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) {
      toast.error("Sessão expirada");
      setUploading(false);
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("highlights")
      .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
    if (upErr) {
      toast.error("Falha no upload", { description: upErr.message });
      setUploading(false);
      return;
    }
    const { error: insErr } = await supabase.from("highlights").insert({
      user_id: uid,
      title: title || file.name,
      recorded_on: recordedOn,
      video_path: path,
    });
    if (insErr) {
      await supabase.storage.from("highlights").remove([path]);
      toast.error("Erro ao salvar", { description: insErr.message });
      setUploading(false);
      return;
    }
    toast.success("Lance adicionado");
    setUploading(false);
    onUploaded();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Novo lance</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={uploading}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Cancelar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Título</span>
          <input
            type="text"
            required
            placeholder="Ex: Golaço de bicicleta"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Data do lance</span>
          <input
            type="date"
            required
            value={recordedOn}
            onChange={(e) => setRecordedOn(e.target.value)}
            className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Vídeo (até 15MB)</span>
          <input
            type="file"
            accept="video/*"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-border bg-input/40 px-3 py-2 text-sm text-foreground outline-none file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-secondary-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Enviar lance
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
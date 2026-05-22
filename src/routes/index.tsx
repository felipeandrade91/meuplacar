import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Plus, Trash2, Calendar, Target, Handshake } from "lucide-react";

type MatchType = "quinta" | "pelada";

interface Match {
  id: string;
  date: string;
  type: MatchType;
  location?: string;
  goals: number;
  assists: number;
}

const STORAGE_KEY = "meu-placar-v1";

function buildSeed(): Match[] {
  const matches: Match[] = [];
  const today = new Date();
  const day = today.getDay();
  const diffToThu = (day - 4 + 7) % 7;
  const lastThu = new Date(today);
  lastThu.setDate(today.getDate() - diffToThu);

  const distribution = [
    { g: 2, a: 1 }, { g: 1, a: 2 }, { g: 1, a: 1 }, { g: 0, a: 1 },
    { g: 2, a: 0 }, { g: 1, a: 1 }, { g: 3, a: 1 }, { g: 0, a: 2 },
    { g: 1, a: 0 }, { g: 2, a: 1 }, { g: 1, a: 1 }, { g: 0, a: 1 },
    { g: 1, a: 0 }, { g: 2, a: 1 }, { g: 1, a: 0 }, { g: 1, a: 1 },
    { g: 1, a: 1 },
  ];

  for (let i = 0; i < 17; i++) {
    const d = new Date(lastThu);
    d.setDate(lastThu.getDate() - i * 7);
    matches.push({
      id: `seed-${i}`,
      date: d.toISOString().slice(0, 10),
      type: "quinta",
      goals: distribution[i].g,
      assists: distribution[i].a,
    });
  }
  return matches;
}

function loadMatches(): Match[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = buildSeed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as Match[];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [mounted, setMounted] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: todayStr,
    type: "quinta" as MatchType,
    location: "",
    goals: 0,
    assists: 0,
  });

  useEffect(() => {
    setMatches(loadMatches());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
  }, [matches, mounted]);

  const stats = useMemo(() => {
    const goals = matches.reduce((s, m) => s + m.goals, 0);
    const assists = matches.reduce((s, m) => s + m.assists, 0);
    const games = matches.length;
    const ga = goals + assists;
    return {
      goals,
      assists,
      games,
      avg: games ? (ga / games).toFixed(2) : "0.00",
    };
  }, [matches]);

  const sorted = useMemo(
    () => [...matches].sort((a, b) => b.date.localeCompare(a.date)),
    [matches],
  );

  function addMatch(e: React.FormEvent) {
    e.preventDefault();
    const m: Match = {
      id: crypto.randomUUID(),
      date: form.date,
      type: form.type,
      location: form.location || undefined,
      goals: Number(form.goals) || 0,
      assists: Number(form.assists) || 0,
    };
    setMatches((prev) => [m, ...prev]);
    setForm({ date: todayStr, type: "quinta", location: "", goals: 0, assists: 0 });
  }

  function removeMatch(id: string) {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meu Placar</h1>
            <p className="text-sm text-muted-foreground">Gols e assistências da temporada</p>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Gols" value={stats.goals} accent />
          <StatCard label="Assistências" value={stats.assists} />
          <StatCard label="Jogos" value={stats.games} />
          <StatCard label="G+A / jogo" value={stats.avg} />
        </section>

        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Registrar jogo</h2>
          <form onSubmit={addMatch} className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Data</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Tipo</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as MatchType })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
              >
                <option value="quinta">Quinta-feira</option>
                <option value="pelada">Pelada eventual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Local (opcional)</span>
              <input
                type="text"
                placeholder="Ex: Quadra do bairro"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Gols</span>
              <input
                type="number"
                min={0}
                value={form.goals}
                onChange={(e) => setForm({ ...form, goals: Number(e.target.value) })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Assistências</span>
              <input
                type="number"
                min={0}
                value={form.assists}
                onChange={(e) => setForm({ ...form, assists: Number(e.target.value) })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Adicionar jogo
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Histórico</h2>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum jogo registrado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatDate(m.date)}
                        <span className="ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                          {m.type === "quinta" ? "Quinta" : "Pelada"}
                        </span>
                      </p>
                      {m.location && (
                        <p className="truncate text-xs text-muted-foreground">{m.location}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Target className="h-4 w-4" /> {m.goals}
                    </span>
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Handshake className="h-4 w-4" /> {m.assists}
                    </span>
                    <button
                      onClick={() => removeMatch(m.id)}
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
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
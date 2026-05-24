import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Plus, Trash2, Calendar, Target, Handshake, Loader2, LogOut, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

type MatchType = "quinta" | "pelada";

interface Match {
  id: string;
  date: string;
  type: MatchType;
  location?: string;
  goals: number;
  assists: number;
}

const QUINTA_LOCATION = "Quadra Catão Roxo";
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: todayStr,
    type: "quinta" as MatchType,
    location: QUINTA_LOCATION,
    goals: 0,
    assists: 0,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(sessionData.session.user.email ?? null);

      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("date", { ascending: false });
      if (!active) return;
      if (!error && data) {
        setMatches(
          data.map((m) => ({
            id: m.id,
            date: m.date,
            type: m.type as MatchType,
            location: m.location ?? undefined,
            goals: m.goals,
            assists: m.assists,
          })),
        );
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [navigate]);

  const stats = useMemo(() => {
    const goals = matches.reduce((s, m) => s + m.goals, 0);
    const assists = matches.reduce((s, m) => s + m.assists, 0);
    const games = matches.length;
    const ga = goals + assists;
    return {
      goals,
      assists,
      games,
      ga,
      gPerGame: games ? (goals / games).toFixed(2) : "0.00",
      aPerGame: games ? (assists / games).toFixed(2) : "0.00",
      gaPerGame: games ? (ga / games).toFixed(2) : "0.00",
    };
  }, [matches]);

  const sorted = useMemo(
    () => [...matches].sort((a, b) => b.date.localeCompare(a.date)),
    [matches],
  );

  async function addMatch(e: React.FormEvent) {
    e.preventDefault();
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) {
      navigate({ to: "/login" });
      return;
    }
    const payload = {
      date: form.date,
      type: form.type,
      location: form.location || null,
      goals: Number(form.goals) || 0,
      assists: Number(form.assists) || 0,
      user_id: uid,
    };
    const { data, error } = await supabase
      .from("matches")
      .insert(payload)
      .select()
      .single();
    if (!error && data) {
      setMatches((prev) => [
        {
          id: data.id,
          date: data.date,
          type: data.type as MatchType,
          location: data.location ?? undefined,
          goals: data.goals,
          assists: data.assists,
        },
        ...prev,
      ]);
      setForm({ date: todayStr, type: "quinta", location: QUINTA_LOCATION, goals: 0, assists: 0 });
    }
  }

  async function removeMatch(id: string) {
    const prev = matches;
    setMatches((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) setMatches(prev);
  }

  async function saveMatchStats(id: string, goals: number, assists: number) {
    const safeG = Math.max(0, Math.floor(goals) || 0);
    const safeA = Math.max(0, Math.floor(assists) || 0);
    const prev = matches;
    setMatches((cur) =>
      cur.map((m) => (m.id === id ? { ...m, goals: safeG, assists: safeA } : m)),
    );
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) {
      setMatches(prev);
      toast.error("Sessão expirada. Faça login novamente.");
      navigate({ to: "/login" });
      return false;
    }
    const { error } = await supabase
      .from("matches")
      .update({ goals: safeG, assists: safeA })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      setMatches(prev);
      toast.error("Não foi possível salvar na nuvem", { description: error.message });
      return false;
    }
    toast.success("Jogo atualizado");
    return true;
  }

  const chartData = useMemo(
    () =>
      [...matches]
        .filter((m) => m.type === "quinta")
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({ date: m.date, goals: m.goals, assists: m.assists })),
    [matches],
  );

  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; label: string; goals: number; assists: number; games: number }>();
    for (const m of matches) {
      const [y, mo] = m.date.split("-");
      const key = `${y}-${mo}`;
      const label = `${MONTH_NAMES[Number(mo) - 1]}/${y.slice(2)}`;
      const cur = map.get(key) ?? { key, label, goals: 0, assists: 0, games: 0 };
      cur.goals += m.goals;
      cur.assists += m.assists;
      cur.games += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [matches]);

  const bestMonth = useMemo(() => {
    if (!monthly.length) return null;
    return monthly.reduce((b, m) => (m.goals + m.assists > b.goals + b.assists ? m : b));
  }, [monthly]);
  const worstMonth = useMemo(() => {
    if (!monthly.length) return null;
    return monthly.reduce((w, m) => (m.goals + m.assists < w.goals + w.assists ? m : w));
  }, [monthly]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Meu Placar</h1>
              <p className="text-sm text-muted-foreground">Gols e assistências da temporada</p>
            </div>
          </div>
          {userEmail && (
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              title={userEmail}
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          )}
        </header>

        {loading && (
          <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando da nuvem...
          </div>
        )}

        <section className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Gols" value={stats.goals} accent />
          <StatCard label="Assistências" value={stats.assists} />
          <StatCard label="Participações" value={stats.ga} highlight />
          <StatCard label="Jogos" value={stats.games} />
        </section>
        <section className="mb-8 grid grid-cols-3 gap-3">
          <StatCard label="Gols / jogo" value={stats.gPerGame} small />
          <StatCard label="Assist. / jogo" value={stats.aPerGame} small />
          <StatCard label="G+A / jogo" value={stats.gaPerGame} small />
        </section>

        {chartData.length > 1 && (
          <section className="mb-8 rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-1 text-lg font-semibold">Evolução no Fute de Quinta</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Gols e assistências por semana. Quando os valores coincidem, as linhas ficam lado a lado.
            </p>
            <LineChart data={chartData} />
          </section>
        )}

        {monthly.length > 0 && (
          <section className="mb-8 rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-1 text-lg font-semibold">Desempenho por mês</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Participações em gols ao longo do ano
            </p>
            <MonthlyBarChart data={monthly} />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 font-medium">Mês</th>
                    <th className="py-2 font-medium">Jogos</th>
                    <th className="py-2 font-medium text-primary">Gols</th>
                    <th className="py-2 font-medium text-accent">Assist.</th>
                    <th className="py-2 font-medium">G+A</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.key} className="border-t border-border/60">
                      <td className="py-2">
                        {m.label}
                        {bestMonth?.key === m.key && (
                          <span className="ml-2 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            melhor
                          </span>
                        )}
                        {worstMonth?.key === m.key && bestMonth?.key !== m.key && (
                          <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            pior
                          </span>
                        )}
                      </td>
                      <td className="py-2">{m.games}</td>
                      <td className="py-2 text-primary">{m.goals}</td>
                      <td className="py-2 text-accent">{m.assists}</td>
                      <td className="py-2 font-medium">{m.goals + m.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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
                onChange={(e) => {
                  const type = e.target.value as MatchType;
                  setForm({
                    ...form,
                    type,
                    location: type === "quinta" ? QUINTA_LOCATION : "",
                  });
                }}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary"
              >
                <option value="quinta">Fute de Quinta</option>
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
                <MatchRow
                  key={m.id}
                  match={m}
                  onSave={saveMatchStats}
                  onRemove={removeMatch}
                />
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
  highlight,
  small,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-bold ${small ? "text-2xl" : "text-3xl"} ${
          accent ? "text-primary" : highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function MatchRow({
  match,
  onSave,
  onRemove,
}: {
  match: Match;
  onSave: (id: string, goals: number, assists: number) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState(match.goals);
  const [assists, setAssists] = useState(match.assists);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setGoals(match.goals);
      setAssists(match.assists);
    }
  }, [match.goals, match.assists, editing]);

  async function handleSave() {
    setSaving(true);
    const ok = await onSave(match.id, goals, assists);
    setSaving(false);
    if (ok) setEditing(false);
  }

  function handleCancel() {
    setGoals(match.goals);
    setAssists(match.assists);
    setEditing(false);
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {formatDate(match.date)}
            <span className="ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
              {match.type === "quinta" ? "Fute de Quinta" : "Pelada"}
            </span>
          </p>
          {match.location && (
            <p className="truncate text-xs text-muted-foreground">{match.location}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-primary">
          <Target className="h-4 w-4" aria-label="Gols" />
          {editing ? (
            <input
              type="number"
              min={0}
              value={goals}
              onChange={(e) => setGoals(Number(e.target.value))}
              className="w-12 rounded-md border border-border bg-input/40 px-1.5 py-1 text-center text-foreground outline-none focus:border-primary"
            />
          ) : (
            <span className="w-6 text-center font-medium tabular-nums">{match.goals}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-accent">
          <Handshake className="h-4 w-4" aria-label="Assistências" />
          {editing ? (
            <input
              type="number"
              min={0}
              value={assists}
              onChange={(e) => setAssists(Number(e.target.value))}
              className="w-12 rounded-md border border-border bg-input/40 px-1.5 py-1 text-center text-foreground outline-none focus:border-primary"
            />
          ) : (
            <span className="w-6 text-center font-medium tabular-nums">{match.assists}</span>
          )}
        </span>
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Salvar"
              className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              aria-label="Cancelar"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              aria-label="Editar"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onRemove(match.id)}
              aria-label="Remover"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function LineChart({ data }: { data: { date: string; goals: number; assists: number }[] }) {
  const width = 600;
  const height = 240;
  const padding = { top: 16, right: 16, bottom: 28, left: 28 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxY = Math.max(3, ...data.flatMap((d) => [d.goals, d.assists]));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const pointsFor = (key: "goals" | "assists") =>
    data.map((d, i) => ({
      x: padding.left + i * stepX,
      y: padding.top + innerH - (d[key] / maxY) * innerH,
    }));

  const goalsPts = pointsFor("goals");
  const assistsPts = pointsFor("assists");

  // Offset overlapping points slightly so both lines remain visible when
  // goals === assists on a given week.
  const OFFSET = 2.5;
  const goalsAdj = goalsPts.map((p, i) => ({
    x: p.x,
    y: data[i].goals === data[i].assists ? p.y - OFFSET : p.y,
  }));
  const assistsAdj = assistsPts.map((p, i) => ({
    x: p.x,
    y: data[i].goals === data[i].assists ? p.y + OFFSET : p.y,
  }));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const yTicks = Array.from({ length: maxY + 1 }, (_, i) => i);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Gols
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Assistências
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Gráfico de gols e assistências por semana"
      >
        {yTicks.map((t) => {
          const y = padding.top + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeDasharray="3 4"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {t}
              </text>
            </g>
          );
        })}
        {data.length > 0 && (
          <>
            <text
              x={padding.left}
              y={height - 8}
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {shortDate(data[0].date)}
            </text>
            <text
              x={width - padding.right}
              y={height - 8}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {shortDate(data[data.length - 1].date)}
            </text>
          </>
        )}
        <path
          d={toPath(assistsAdj)}
          fill="none"
          className="stroke-accent"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={toPath(goalsAdj)}
          fill="none"
          className="stroke-primary"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {assistsAdj.map((p, i) => (
          <circle key={`a-${i}`} cx={p.x} cy={p.y} r={3} className="fill-accent" />
        ))}
        {goalsAdj.map((p, i) => (
          <circle key={`g-${i}`} cx={p.x} cy={p.y} r={3} className="fill-primary" />
        ))}
      </svg>
    </div>
  );
}

function MonthlyBarChart({
  data,
}: {
  data: { key: string; label: string; goals: number; assists: number }[];
}) {
  const width = 600;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 32, left: 28 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxY = Math.max(3, ...data.flatMap((d) => [d.goals, d.assists]));
  const groupW = data.length ? innerW / data.length : 0;
  const barW = Math.min(18, (groupW - 6) / 2);

  const yTicks = Array.from({ length: maxY + 1 }, (_, i) => i);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Gols
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Assistências
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Histograma de gols e assistências por mês"
      >
        {yTicks.map((t) => {
          const y = padding.top + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeDasharray="3 4"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {t}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = padding.left + i * groupW + groupW / 2;
          const gH = (d.goals / maxY) * innerH;
          const aH = (d.assists / maxY) * innerH;
          const gx = cx - barW - 1;
          const ax = cx + 1;
          return (
            <g key={d.key}>
              <rect
                x={gx}
                y={padding.top + innerH - gH}
                width={barW}
                height={gH}
                rx={2}
                className="fill-primary"
              />
              <rect
                x={ax}
                y={padding.top + innerH - aH}
                width={barW}
                height={aH}
                rx={2}
                className="fill-accent"
              />
              <text
                x={cx}
                y={height - 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
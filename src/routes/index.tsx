import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Trophy, Plus, Trash2, Calendar, Target, Handshake, Loader2, LogOut, Pencil, Check, X, Film,
  Flame, Timer, Activity, TrendingUp, TrendingDown, Share2, Download, Filter, User, Ruler, Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

type MatchType = "quinta" | "pelada";

interface Match {
  id: string;
  date: string;
  type: MatchType;
  location?: string;
  goals: number;
  assists: number;
  duration_minutes: number;
  my_team_score?: number | null;
  opponent_score?: number | null;
}

interface Profile {
  height_cm: number | null;
  weight_kg: number | null;
}

interface Sample {
  id: string;
  kind: "calories" | "distance";
  value: number;
  note: string | null;
  created_at: string;
}

const QUINTA_LOCATION = "Quadra Catão Roxo";
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTH_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DEFAULT_CAL_PER_GAME = 681.4;
const DEFAULT_KM_PER_GAME = 4.2575;
const VICTORY_START = "2026-06-01"; // a partir de junho/2026

type MatchResult = "W" | "D" | "L";
function matchResult(m: Match): MatchResult | null {
  if (m.my_team_score == null || m.opponent_score == null) return null;
  if (m.my_team_score > m.opponent_score) return "W";
  if (m.my_team_score < m.opponent_score) return "L";
  return "D";
}

type PeriodKey = "all" | "30" | "90" | "year" | "month" | `m:${string}`;
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "month", label: "Este mês" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "year", label: "Este ano" },
];

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [profile, setProfile] = useState<Profile>({ height_cm: null, weight_kg: null });
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [confirmDelete, setConfirmDelete] = useState<Match | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState<null | "calories" | "distance">(null);
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: todayStr,
    type: "quinta" as MatchType,
    location: QUINTA_LOCATION,
    goals: 0,
    assists: 0,
    duration_minutes: 60,
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
      const uid = sessionData.session.user.id;

      const [matchesRes, profileRes, samplesRes] = await Promise.all([
        supabase.from("matches").select("*").order("date", { ascending: false }),
        supabase.from("user_profile").select("height_cm, weight_kg").eq("user_id", uid).maybeSingle(),
        supabase.from("physical_samples").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (!matchesRes.error && matchesRes.data) {
        setMatches(matchesRes.data.map((m) => ({
          id: m.id,
          date: m.date,
          type: m.type as MatchType,
          location: m.location ?? undefined,
          goals: m.goals,
          assists: m.assists,
          duration_minutes: (m as { duration_minutes?: number }).duration_minutes ?? 60,
        })));
      }
      if (!profileRes.error && profileRes.data) {
        setProfile({
          height_cm: profileRes.data.height_cm ?? null,
          weight_kg: profileRes.data.weight_kg ? Number(profileRes.data.weight_kg) : null,
        });
      }
      if (!samplesRes.error && samplesRes.data) {
        setSamples(samplesRes.data.map((s) => ({
          id: s.id, kind: s.kind as "calories" | "distance",
          value: Number(s.value), note: s.note, created_at: s.created_at,
        })));
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [navigate]);

  // ---- Filtered matches by period ----
  const filteredMatches = useMemo(() => {
    if (period === "all") return matches;
    if (typeof period === "string" && period.startsWith("m:")) {
      const key = period.slice(2); // "YYYY-MM"
      return matches.filter((m) => m.date.startsWith(key));
    }
    const now = new Date();
    let from: Date;
    if (period === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === "year") from = new Date(now.getFullYear(), 0, 1);
    else from = new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);
    const fromStr = from.toISOString().slice(0, 10);
    return matches.filter((m) => m.date >= fromStr);
  }, [matches, period]);

  // Months available in match history (newest first)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) set.add(m.date.slice(0, 7));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [matches]);

  // ---- Calorie & distance stats from samples (with fallback) ----
  const physical = useMemo(() => {
    const compute = (kind: "calories" | "distance", fallback: number) => {
      const arr = samples.filter((s) => s.kind === kind).map((s) => s.value);
      const isDefault = arr.length === 0;
      const values = isDefault ? [fallback] : arr;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.length > 1
        ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
        : 0;
      const std = Math.sqrt(variance);
      return { mean, std, count: arr.length, isDefault };
    };
    return {
      cal: compute("calories", DEFAULT_CAL_PER_GAME),
      km: compute("distance", DEFAULT_KM_PER_GAME),
    };
  }, [samples]);

  const stats = useMemo(() => {
    const goals = filteredMatches.reduce((s, m) => s + m.goals, 0);
    const assists = filteredMatches.reduce((s, m) => s + m.assists, 0);
    const games = filteredMatches.length;
    const ga = goals + assists;
    const minutes = filteredMatches.reduce((s, m) => s + (m.duration_minutes || 60), 0);
    const calories = games * physical.cal.mean;
    const km = games * physical.km.mean;
    return {
      goals, assists, games, ga, minutes, calories,
      km,
      gPerGame: games ? (goals / games).toFixed(2) : "0.00",
      aPerGame: games ? (assists / games).toFixed(2) : "0.00",
      gaPerGame: games ? (ga / games).toFixed(2) : "0.00",
    };
  }, [filteredMatches, physical]);

  const sorted = useMemo(
    () => [...filteredMatches].sort((a, b) => b.date.localeCompare(a.date)),
    [filteredMatches],
  );

  // ---- Sequences (based on all-time, chronological asc) ----
  const sequences = useMemo(() => {
    const asc = [...matches].sort((a, b) => a.date.localeCompare(b.date));
    const compute = (pred: (m: Match) => boolean) => {
      let best = 0, cur = 0, currentNow = 0;
      for (const m of asc) {
        if (pred(m)) { cur += 1; if (cur > best) best = cur; }
        else cur = 0;
      }
      // currentNow = streak at the end
      for (let i = asc.length - 1; i >= 0; i--) {
        if (pred(asc[i])) currentNow += 1; else break;
      }
      return { current: currentNow, best };
    };
    return {
      goal: compute((m) => m.goals > 0),
      assist: compute((m) => m.assists > 0),
      participation: compute((m) => m.goals + m.assists > 0),
    };
  }, [matches]);

  // ---- Last 5 average vs overall (all-time) ----
  const recent = useMemo(() => {
    if (matches.length === 0) return null;
    const asc = [...matches].sort((a, b) => a.date.localeCompare(b.date));
    const last5 = asc.slice(-5);
    const avg = (arr: Match[], key: "goals" | "assists") =>
      arr.length ? arr.reduce((s, m) => s + m[key], 0) / arr.length : 0;
    return {
      goalsRecent: avg(last5, "goals"),
      goalsAll: avg(asc, "goals"),
      assistsRecent: avg(last5, "assists"),
      assistsAll: avg(asc, "assists"),
    };
  }, [matches]);

  // ---- Month vs previous month ----
  const monthCompare = useMemo(() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
    const agg = (k: string) => {
      const ms = matches.filter((m) => m.date.startsWith(k));
      return {
        goals: ms.reduce((s, m) => s + m.goals, 0),
        assists: ms.reduce((s, m) => s + m.assists, 0),
        ga: ms.reduce((s, m) => s + m.goals + m.assists, 0),
        games: ms.length,
      };
    };
    return { current: agg(cur), previous: agg(prev) };
  }, [matches]);

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

  const bestMonth = useMemo(() => monthly.length ? monthly.reduce((b, m) => (m.goals + m.assists > b.goals + b.assists ? m : b)) : null, [monthly]);
  const worstMonth = useMemo(() => monthly.length ? monthly.reduce((w, m) => (m.goals + m.assists < w.goals + w.assists ? m : w)) : null, [monthly]);

  const bestMatches = useMemo(() => {
    if (!matches.length) return null;
    const byGoals = matches.reduce((b, m) => (m.goals > b.goals ? m : b));
    const byAssists = matches.reduce((b, m) => (m.assists > b.assists ? m : b));
    const byGA = matches.reduce((b, m) => (m.goals + m.assists > b.goals + b.assists ? m : b));
    return { byGoals, byAssists, byGA };
  }, [matches]);

  // ---- Distribution ----
  const distribution = useMemo(() => {
    const total = matches.length;
    if (!total) return null;
    let withGoal = 0, onlyAssist = 0, blank = 0;
    for (const m of matches) {
      if (m.goals > 0) withGoal += 1;
      else if (m.assists > 0) onlyAssist += 1;
      else blank += 1;
    }
    return { total, withGoal, onlyAssist, blank };
  }, [matches]);

  // ---- BMI ----
  const bmi = useMemo(() => {
    if (!profile.height_cm || !profile.weight_kg) return null;
    const h = profile.height_cm / 100;
    const v = profile.weight_kg / (h * h);
    let label = "Saudável";
    let tone: "ok" | "warn" | "bad" = "ok";
    if (v < 18.5) { label = "Abaixo do peso"; tone = "warn"; }
    else if (v < 25) { label = "Peso saudável"; tone = "ok"; }
    else if (v < 30) { label = "Sobrepeso"; tone = "warn"; }
    else { label = "Obesidade"; tone = "bad"; }
    return { value: v, label, tone };
  }, [profile]);

  async function addMatch(e: React.FormEvent) {
    e.preventDefault();
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) { navigate({ to: "/login" }); return; }
    const payload = {
      date: form.date,
      type: form.type,
      location: form.location || null,
      goals: Number(form.goals) || 0,
      assists: Number(form.assists) || 0,
      duration_minutes: Math.max(1, Number(form.duration_minutes) || 60),
      user_id: uid,
    };
    const { data, error } = await supabase.from("matches").insert(payload).select().single();
    if (!error && data) {
      setMatches((prev) => [{
        id: data.id, date: data.date, type: data.type as MatchType,
        location: data.location ?? undefined, goals: data.goals, assists: data.assists,
        duration_minutes: (data as { duration_minutes?: number }).duration_minutes ?? 60,
      }, ...prev]);
      setForm({ date: todayStr, type: "quinta", location: QUINTA_LOCATION, goals: 0, assists: 0, duration_minutes: 60 });
      toast.success("Jogo registrado");
    } else if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
    }
  }

  async function removeMatch(id: string) {
    const prev = matches;
    setMatches((cur) => cur.filter((m) => m.id !== id));
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) { setMatches(prev); toast.error("Erro ao remover"); }
    else toast.success("Jogo removido");
  }

  async function saveMatchStats(id: string, goals: number, assists: number) {
    const safeG = Math.max(0, Math.floor(goals) || 0);
    const safeA = Math.max(0, Math.floor(assists) || 0);
    const prev = matches;
    setMatches((cur) => cur.map((m) => (m.id === id ? { ...m, goals: safeG, assists: safeA } : m)));
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user.id) {
      setMatches(prev);
      toast.error("Sessão expirada. Faça login novamente.");
      navigate({ to: "/login" });
      return false;
    }
    const { error } = await supabase.from("matches").update({ goals: safeG, assists: safeA }).eq("id", id);
    if (error) { setMatches(prev); toast.error("Erro ao salvar"); return false; }
    toast.success("Jogo atualizado");
    return true;
  }

  async function saveProfile(height: number, weight: number) {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;
    const payload = { user_id: uid, height_cm: height, weight_kg: weight };
    const { error } = await supabase.from("user_profile").upsert(payload, { onConflict: "user_id" });
    if (error) { toast.error("Erro ao salvar perfil", { description: error.message }); return; }
    setProfile({ height_cm: height, weight_kg: weight });
    toast.success("Perfil atualizado");
    setProfileOpen(false);
  }

  async function addSample(kind: "calories" | "distance", value: number, note: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;
    const { data, error } = await supabase
      .from("physical_samples")
      .insert({ user_id: uid, kind, value, note: note || null })
      .select()
      .single();
    if (error || !data) { toast.error("Erro ao salvar valor", { description: error?.message }); return; }
    setSamples((prev) => [{
      id: data.id, kind: data.kind as "calories" | "distance",
      value: Number(data.value), note: data.note, created_at: data.created_at,
    }, ...prev]);
    toast.success("Valor adicionado");
  }

  async function removeSample(id: string) {
    const prev = samples;
    setSamples((cur) => cur.filter((s) => s.id !== id));
    const { error } = await supabase.from("physical_samples").delete().eq("id", id);
    if (error) { setSamples(prev); toast.error("Erro ao remover"); }
  }

  function exportCsv() {
    const header = ["data", "tipo", "local", "gols", "assistencias", "duracao_min"];
    const rows = sorted.map((m) => [
      m.date, m.type, m.location ?? "", m.goals, m.assists, m.duration_minutes,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `meu-placar-${todayStr}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function shareBest() {
    if (!bestMatches) return;
    const m = bestMatches.byGA;
    const text = `🏆 Minha melhor partida: ${m.goals + m.assists} participações (${m.goals}G + ${m.assists}A) em ${formatDate(m.date)} — Meu Placar`;
    if (navigator.share) {
      try { await navigator.share({ title: "Meu Placar", text }); } catch { /* ignored */ }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success("Conquista copiada!");
    }
  }

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Perfil"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <User className="h-3.5 w-3.5" /> Perfil
            </button>
            {userEmail && (
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                title={userEmail}
              >
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            )}
          </div>
        </header>

        {loading ? (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0,1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Period filter */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    period === p.key
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {availableMonths.length > 0 && (
                <select
                  value={typeof period === "string" && period.startsWith("m:") ? period : ""}
                  onChange={(e) => {
                    if (e.target.value) setPeriod(e.target.value as PeriodKey);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs outline-none transition-colors ${
                    typeof period === "string" && period.startsWith("m:")
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <option value="">Mês específico…</option>
                  {availableMonths.map((k) => {
                    const [y, mo] = k.split("-");
                    return (
                      <option key={k} value={`m:${k}`}>
                        {MONTH_FULL[Number(mo) - 1]}/{y}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

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

            {/* Recent vs overall */}
            {recent && (
              <section className="mb-8 grid grid-cols-2 gap-3">
                <TrendCard label="Gols (últ. 5)" recent={recent.goalsRecent} all={recent.goalsAll} />
                <TrendCard label="Assist. (últ. 5)" recent={recent.assistsRecent} all={recent.assistsAll} />
              </section>
            )}

            {/* Sequences */}
            <section className="mb-8 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Sequências</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Jogos consecutivos com gol, assistência ou participação (gol + assistência). Mostra a sequência atual e o recorde histórico.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SequenceCard label="Com gol" current={sequences.goal.current} best={sequences.goal.best} />
                <SequenceCard label="Com assistência" current={sequences.assist.current} best={sequences.assist.best} />
                <SequenceCard label="Com participação" current={sequences.participation.current} best={sequences.participation.best} highlight />
              </div>
            </section>

            {bestMatches && (
              <section className="mb-8">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Recordes pessoais</h2>
                  <button
                    onClick={shareBest}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Compartilhar
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <BestMatchCard label="Partida com mais gols" value={bestMatches.byGoals.goals} date={bestMatches.byGoals.date} accent record />
                  <BestMatchCard label="Partida com mais assistências" value={bestMatches.byAssists.assists} date={bestMatches.byAssists.date} record />
                  <BestMatchCard label="Partida com mais participações" value={bestMatches.byGA.goals + bestMatches.byGA.assists} date={bestMatches.byGA.date} highlight record />
                </div>
              </section>
            )}

            {/* Distribution donut */}
            {distribution && (
              <section className="mb-8 rounded-2xl border border-border bg-card p-5">
                <h2 className="mb-4 text-lg font-semibold">Distribuição dos jogos</h2>
                <DistributionDonut d={distribution} />
              </section>
            )}

            <section className="mb-8">
              <Link
                to="/melhores-lances"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Film className="h-4 w-4" /> Meus melhores lances
              </Link>
            </section>

            {chartData.length > 1 && (
              <section className="mb-8 rounded-2xl border border-border bg-card p-5">
                <h2 className="mb-1 text-lg font-semibold">Evolução no Futebol semanal</h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Gols e assistências por semana. Quando os valores coincidem, as linhas ficam lado a lado.
                </p>
                <LineChart data={chartData} />
              </section>
            )}

            {monthly.length > 0 && (
              <section className="mb-8 rounded-2xl border border-border bg-card p-5">
                <h2 className="mb-1 text-lg font-semibold">Desempenho por mês</h2>
                <p className="mb-4 text-xs text-muted-foreground">Participações em gols ao longo do ano</p>
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
                              <span className="ml-2 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">melhor</span>
                            )}
                            {worstMonth?.key === m.key && bestMonth?.key !== m.key && (
                              <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">pior</span>
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

            {/* Month compare (after monthly chart so all month-related metrics are together) */}
            <section className="mb-8 rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 text-lg font-semibold">Mês atual vs anterior</h2>
              <div className="grid grid-cols-3 gap-3">
                <CompareCell label="Gols" cur={monthCompare.current.goals} prev={monthCompare.previous.goals} />
                <CompareCell label="Assist." cur={monthCompare.current.assists} prev={monthCompare.previous.assists} />
                <CompareCell label="Partic." cur={monthCompare.current.ga} prev={monthCompare.previous.ga} />
              </div>
            </section>

            {/* Physical performance (last metric section, above historical records) */}
            <section className="mb-8 rounded-2xl border border-border bg-card p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Performance física</h2>
                <button
                  onClick={() => setProfileOpen(true)}
                  aria-label="Editar perfil"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-4 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Calorias e km são <strong className="mx-1 font-medium text-foreground">estimativas</strong> baseadas em médias dos seus valores brutos. Adicione mais medições do seu smartwatch para refinar.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PhysicalStatCard
                  icon={<Flame className="h-4 w-4" />}
                  label="Calorias gastas"
                  value={Math.round(stats.calories).toLocaleString("pt-BR")}
                  hint={`~${physical.cal.mean.toFixed(0)}${physical.cal.std > 0 ? ` ± ${physical.cal.std.toFixed(0)}` : ""} cal / partida${physical.cal.isDefault ? " (padrão)" : ""}`}
                  onEdit={() => setSamplesOpen("calories")}
                  accent
                />
                <PhysicalStatCard
                  icon={<Ruler className="h-4 w-4" />}
                  label="Distância percorrida"
                  value={`${stats.km.toFixed(1).replace(".", ",")} km`}
                  hint={`~${physical.km.mean.toFixed(2).replace(".", ",")}${physical.km.std > 0 ? ` ± ${physical.km.std.toFixed(2).replace(".", ",")}` : ""} km / partida${physical.km.isDefault ? " (padrão)" : ""}`}
                  onEdit={() => setSamplesOpen("distance")}
                />
                <PhysicalCard
                  icon={<Timer className="h-4 w-4" />}
                  label="Tempo jogado"
                  value={`${stats.minutes.toLocaleString("pt-BR")} min`}
                  hint={formatHours(stats.minutes)}
                />
                <BMICard bmi={bmi} onEdit={() => setProfileOpen(true)} />
              </div>
            </section>

          </>
        )}

        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Registrar jogo</h2>
          <form onSubmit={addMatch} className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Data</span>
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Tipo</span>
              <select value={form.type}
                onChange={(e) => {
                  const type = e.target.value as MatchType;
                  setForm({ ...form, type, location: type === "quinta" ? QUINTA_LOCATION : "" });
                }}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary">
                <option value="quinta">Futebol semanal</option>
                <option value="pelada">Pelada eventual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Local (opcional)</span>
              <input type="text" placeholder="Ex: Quadra do bairro" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Gols</span>
              <input type="number" min={0} value={form.goals}
                onChange={(e) => setForm({ ...form, goals: Number(e.target.value) })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Assistências</span>
              <input type="number" min={0} value={form.assists}
                onChange={(e) => setForm({ ...form, assists: Number(e.target.value) })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Duração (minutos)</span>
              <input type="number" min={1} value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
            </label>
            <button type="submit"
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <Plus className="h-4 w-4" /> Adicionar jogo
            </button>
          </form>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Histórico</h2>
            {sorted.length > 0 && (
              <button onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Download className="h-3.5 w-3.5" /> Exportar CSV
              </button>
            )}
          </div>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {matches.length === 0 ? "Nenhum jogo registrado ainda." : "Nenhum jogo neste período."}
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((m) => (
                <MatchRow key={m.id} match={m}
                  onSave={saveMatchStats}
                  onRequestRemove={() => setConfirmDelete(m)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover jogo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>Jogo de <strong>{formatDate(confirmDelete.date)}</strong> com {confirmDelete.goals} gol(s) e {confirmDelete.assists} assistência(s).</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) removeMatch(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
        onSave={saveProfile}
      />

      <SamplesDialog
        kind={samplesOpen}
        onOpenChange={(o) => { if (!o) setSamplesOpen(null); }}
        samples={samples.filter((s) => s.kind === samplesOpen)}
        defaultValue={samplesOpen === "calories" ? DEFAULT_CAL_PER_GAME : DEFAULT_KM_PER_GAME}
        onAdd={(v, n) => samplesOpen && addSample(samplesOpen, v, n)}
        onRemove={removeSample}
      />
    </main>
  );
}

// ---- Components ----

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

function StatCard({
  label, value, accent, highlight, small,
}: {
  label: string; value: number | string; accent?: boolean; highlight?: boolean; small?: boolean;
}) {
  const numeric = typeof value === "number" ? value : Number(value);
  const animate = !Number.isNaN(numeric) && typeof value !== "string";
  const displayed = useCountUp(animate ? numeric : 0);
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card"}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${small ? "text-2xl" : "text-3xl"} ${accent || highlight ? "text-primary" : "text-foreground"}`}>
        {animate ? Math.round(displayed).toLocaleString("pt-BR") : value}
      </p>
    </div>
  );
}

function PhysicalCard({
  icon, label, value, hint, accent,
}: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"}`}>
      <p className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wide ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {icon} {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PhysicalStatCard({
  icon, label, value, hint, onEdit, accent,
}: { icon: React.ReactNode; label: string; value: string; hint?: string; onEdit: () => void; accent?: boolean }) {
  return (
    <div className={`relative rounded-xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"}`}>
      <button
        onClick={onEdit}
        aria-label="Ver valores brutos"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <p className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wide ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {icon} {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BMICard({ bmi, onEdit }: { bmi: { value: number; label: string; tone: "ok" | "warn" | "bad" } | null; onEdit: () => void }) {
  if (!bmi) {
    return (
      <button onClick={onEdit} className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-left transition-colors hover:border-primary/60">
        <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Activity className="h-4 w-4" /> IMC
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">Toque para inserir altura e peso</p>
      </button>
    );
  }
  const toneClass =
    bmi.tone === "ok" ? "text-primary" : bmi.tone === "warn" ? "text-foreground" : "text-destructive";
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Activity className="h-4 w-4" /> IMC
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{bmi.value.toFixed(1)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{bmi.label}</p>
    </div>
  );
}

function SequenceCard({ label, current, best, highlight }: { label: string; current: number; best: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${current > 0 ? "text-primary" : "text-muted-foreground"}`}>
        {current}<span className="text-sm font-normal text-muted-foreground"> atual</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Recorde: {best}</p>
    </div>
  );
}

function TrendCard({ label, recent, all }: { label: string; recent: number; all: number }) {
  const diff = recent - all;
  const up = diff > 0.01;
  const down = diff < -0.01;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums text-foreground">{recent.toFixed(2)}</p>
        <span className={`inline-flex items-center gap-0.5 text-xs ${up ? "text-primary" : down ? "text-destructive" : "text-muted-foreground"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : null}
          {diff >= 0 ? "+" : ""}{diff.toFixed(2)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">média geral: {all.toFixed(2)}</p>
    </div>
  );
}

function CompareCell({ label, cur, prev }: { label: string; cur: number; prev: number }) {
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : cur > 0 ? 100 : 0;
  const up = diff > 0;
  const down = diff < 0;
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{cur}</p>
      <p className={`mt-1 inline-flex items-center gap-0.5 text-xs ${up ? "text-primary" : down ? "text-destructive" : "text-muted-foreground"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : null}
        {prev > 0 ? `${pct > 0 ? "+" : ""}${pct}%` : "—"}
      </p>
      <p className="text-[10px] text-muted-foreground">vs {prev}</p>
    </div>
  );
}

function DistributionDonut({ d }: { d: { total: number; withGoal: number; onlyAssist: number; blank: number } }) {
  const segs = [
    { label: "Com gol", value: d.withGoal, color: "var(--primary)" },
    { label: "Só assist.", value: d.onlyAssist, color: "var(--accent)" },
    { label: "Em branco", value: d.blank, color: "var(--muted-foreground)" },
  ];
  const size = 140, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size/2} cy={size/2} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
        {segs.map((s, i) => {
          const frac = d.total ? s.value / d.total : 0;
          const len = frac * c;
          const dasharray = `${len} ${c - len}`;
          const dashoffset = -offset;
          offset += len;
          return (
            <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={dasharray} strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${size/2} ${size/2})`} />
          );
        })}
        <text x={size/2} y={size/2 - 4} textAnchor="middle" className="fill-foreground" style={{ fontSize: 18, fontWeight: 700 }}>
          {d.total}
        </text>
        <text x={size/2} y={size/2 + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
          jogos
        </text>
      </svg>
      <div className="flex flex-col gap-2 text-sm">
        {segs.map((s, i) => {
          const pct = d.total ? Math.round((s.value / d.total) * 100) : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
              <span className="text-foreground">{s.label}</span>
              <span className="text-muted-foreground">— {s.value} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SamplesDialog({
  kind, onOpenChange, samples, defaultValue, onAdd, onRemove,
}: {
  kind: "calories" | "distance" | null;
  onOpenChange: (o: boolean) => void;
  samples: Sample[];
  defaultValue: number;
  onAdd: (value: number, note: string) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (kind) { setValue(""); setNote(""); } }, [kind]);
  if (!kind) return null;
  const isCal = kind === "calories";
  const unit = isCal ? "cal" : "km";
  const title = isCal ? "Calorias por partida" : "Distância por partida";
  const placeholder = isCal ? "Ex: 681" : "Ex: 4.30";
  const values = samples.map((s) => s.value);
  const total = values.reduce((a, b) => a + b, 0);
  const mean = values.length ? total / values.length : defaultValue;
  const std = values.length > 1
    ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1))
    : 0;
  return (
    <AlertDialog open={!!kind} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Adicione medições do seu smartwatch para que a média seja calculada com base nos seus dados reais. Quanto mais valores, mais precisa fica a estimativa.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border border-border bg-background/40 p-3 text-sm">
          {values.length === 0 ? (
            <p className="text-muted-foreground">
              Sem medições ainda. Usando valor padrão de <strong className="text-foreground">{defaultValue.toString().replace(".", ",")} {unit}</strong> por partida.
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-foreground">
                Média: <strong className="text-primary">{isCal ? mean.toFixed(1).replace(".", ",") : mean.toFixed(2).replace(".", ",")} {unit}</strong>
              </span>
              {std > 0 && (
                <span className="text-muted-foreground">
                  ± {isCal ? std.toFixed(1).replace(".", ",") : std.toFixed(2).replace(".", ",")}
                </span>
              )}
              <span className="text-muted-foreground">
                · {values.length} medição{values.length > 1 ? "ões" : ""}
              </span>
              <span className="text-muted-foreground">
                · total {isCal ? Math.round(total).toLocaleString("pt-BR") : total.toFixed(2).replace(".", ",")} {unit}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Adicionar nova medição</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number" step={isCal ? "1" : "0.01"} min={0}
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-28 rounded-lg border border-border bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => {
                const v = Number(value.replace(",", "."));
                if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
                onAdd(v, note);
                setValue(""); setNote("");
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Salvar
            </button>
          </div>
        </div>

        {samples.length > 0 && (
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {samples.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium tabular-nums">
                    {isCal ? s.value.toFixed(0) : s.value.toFixed(2).replace(".", ",")} {unit}
                  </span>
                  {s.note && <span className="ml-2 text-xs text-muted-foreground">— {s.note}</span>}
                </div>
                <button
                  onClick={() => onRemove(s.id)} aria-label="Remover"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Fechar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Trophy className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold">Comece registrando seu primeiro jogo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Suas métricas, sequências e calorias aparecem aqui assim que você adicionar uma partida.
      </p>
    </div>
  );
}

function formatHours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function BestMatchCard({
  label, value, date, accent, highlight, record,
}: { label: string; value: number; date: string; accent?: boolean; highlight?: boolean; record?: boolean }) {
  return (
    <div className={`relative rounded-2xl border p-4 ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card"}`}>
      {record && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
          🏆 Recorde
        </span>
      )}
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent || highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Calendar className="h-3.5 w-3.5 text-primary" /> {formatDate(date)}
      </p>
    </div>
  );
}

function MatchRow({
  match, onSave, onRequestRemove,
}: {
  match: Match;
  onSave: (id: string, goals: number, assists: number) => Promise<boolean>;
  onRequestRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState(match.goals);
  const [assists, setAssists] = useState(match.assists);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) { setGoals(match.goals); setAssists(match.assists); }
  }, [match.goals, match.assists, editing]);

  async function handleSave() {
    setSaving(true);
    const ok = await onSave(match.id, goals, assists);
    setSaving(false);
    if (ok) setEditing(false);
  }

  function handleCancel() {
    setGoals(match.goals); setAssists(match.assists); setEditing(false);
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/50 hover:bg-primary/[0.02]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {formatDate(match.date)}
            <span className="ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
              {match.type === "quinta" ? "Futebol semanal" : "Pelada"}
            </span>
            <span className="ml-1.5 text-xs text-muted-foreground">· {match.duration_minutes}min</span>
          </p>
          {match.location && <p className="truncate text-xs text-muted-foreground">{match.location}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-primary">
          <Target className="h-4 w-4" aria-label="Gols" />
          {editing ? (
            <input type="number" min={0} value={goals} onChange={(e) => setGoals(Number(e.target.value))}
              className="w-12 rounded-md border border-border bg-input/40 px-1.5 py-1 text-center text-foreground outline-none focus:border-primary" />
          ) : (
            <span className="w-6 text-center font-medium tabular-nums">{match.goals}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-accent">
          <Handshake className="h-4 w-4" aria-label="Assistências" />
          {editing ? (
            <input type="number" min={0} value={assists} onChange={(e) => setAssists(Number(e.target.value))}
              className="w-12 rounded-md border border-border bg-input/40 px-1.5 py-1 text-center text-foreground outline-none focus:border-primary" />
          ) : (
            <span className="w-6 text-center font-medium tabular-nums">{match.assists}</span>
          )}
        </span>
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving} aria-label="Salvar"
              className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button onClick={handleCancel} disabled={saving} aria-label="Cancelar"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} aria-label="Editar"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onRequestRemove} aria-label="Remover"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ProfileDialog({
  open, onOpenChange, profile, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: Profile;
  onSave: (height: number, weight: number) => void;
}) {
  const [height, setHeight] = useState<string>(profile.height_cm?.toString() ?? "");
  const [weight, setWeight] = useState<string>(profile.weight_kg?.toString() ?? "");
  useEffect(() => {
    setHeight(profile.height_cm?.toString() ?? "");
    setWeight(profile.weight_kg?.toString() ?? "");
  }, [profile, open]);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Meu perfil</AlertDialogTitle>
          <AlertDialogDescription>
            Usamos altura e peso só para calcular o seu IMC.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Altura (cm)</span>
            <input type="number" min={50} max={250} value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="175"
              className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Peso (kg)</span>
            <input type="number" min={20} max={300} step="0.1" value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="78.5"
              className="rounded-lg border border-border bg-input/40 px-3 py-2 text-foreground outline-none focus:border-primary" />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              const h = Number(height), w = Number(weight);
              if (!h || !w || h < 50 || h > 250 || w < 20 || w > 300) {
                toast.error("Informe altura (50–250 cm) e peso (20–300 kg) válidos");
                return;
              }
              onSave(h, w);
            }}
          >
            Salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const OFFSET = 2.5;
  const goalsAdj = goalsPts.map((p, i) => ({ x: p.x, y: data[i].goals === data[i].assists ? p.y - OFFSET : p.y }));
  const assistsAdj = assistsPts.map((p, i) => ({ x: p.x, y: data[i].goals === data[i].assists ? p.y + OFFSET : p.y }));
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
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfico de gols e assistências por semana">
        {yTicks.map((t) => {
          const y = padding.top + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y}
                className="stroke-border" strokeDasharray="3 4" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>{t}</text>
            </g>
          );
        })}
        {data.length > 0 && (
          <>
            <text x={padding.left} y={height - 8} className="fill-muted-foreground" style={{ fontSize: 10 }}>{shortDate(data[0].date)}</text>
            <text x={width - padding.right} y={height - 8} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>{shortDate(data[data.length - 1].date)}</text>
          </>
        )}
        <path d={toPath(assistsAdj)} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <path d={toPath(goalsAdj)} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {assistsAdj.map((p, i) => (<circle key={`a-${i}`} cx={p.x} cy={p.y} r={3} className="fill-accent" />))}
        {goalsAdj.map((p, i) => (<circle key={`g-${i}`} cx={p.x} cy={p.y} r={3} className="fill-primary" />))}
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
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Histograma de gols e assistências por mês">
        {yTicks.map((t) => {
          const y = padding.top + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y}
                className="stroke-border" strokeDasharray="3 4" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>{t}</text>
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
              <rect x={gx} y={padding.top + innerH - gH} width={barW} height={gH} rx={2} className="fill-primary" />
              <rect x={ax} y={padding.top + innerH - aH} width={barW} height={aH} rx={2} className="fill-accent" />
              <text x={cx} y={height - 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

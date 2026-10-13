import { useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MatchDatePicker({ value, onChange, label = "Data do jogo" }: {
  value: string; onChange: (value: string) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseISO(value);
  const selected = isValid(parsed) ? parsed : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={`${label}: ${selected ? format(selected, "dd/MM/yyyy") : "selecionar"}`}
          className="h-11 w-full justify-between border-2 border-border bg-input/40 px-3 text-foreground">
          <span>{selected ? format(selected, "dd/MM/yyyy") : "Selecionar data"}</span>
          <CalendarIcon className="text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="pointer-events-auto w-auto max-w-[calc(100vw-2rem)] p-0">
        <Calendar mode="single" selected={selected} defaultMonth={selected} locale={ptBR}
          captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(new Date().getFullYear() + 1, 11)}
          autoFocus className="pointer-events-auto p-3 [--cell-size:2.5rem]"
          onSelect={(date) => { if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); } }} />
      </PopoverContent>
    </Popover>
  );
}
"use client";

import { PaymentBreakdown } from "@/components/ui/payment-breakdown";
import { paymentPartsError, type PaymentPart } from "@/lib/payment-breakdown";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FiAlertTriangle, FiCalendar, FiCheck, FiChevronDown, FiChevronRight, FiChevronUp, FiPercent, FiSettings } from "react-icons/fi";
import { Avatar } from "@/components/dashboard/instructors-panel";
import { EmptyCard, ToggleRow, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { clientApiFetch } from "@/lib/client-api";
import type { InstructorCycleView, InstructorPaySettingsView, InstructorPaymentsView, TeamPaySummary } from "@/lib/instructor-ledger";
import type { InstructorPaymentDetail, InstructorPaymentItem, PaymentHistoryGroup } from "@/lib/instructor-payments";
import { longDate, upcomingPayDates, type PayFrequency } from "@/lib/instructor-cycle-time";
import { WEEKDAYS, dateKeyToDate, daysBetweenKeys, formatTimeKey } from "@/lib/studio-time";
import { cn, currency } from "@/lib/web-utils";

type Configured = Extract<InstructorPaymentsView, { configurado: true }>;
type Person = Configured["instructores"][number];

function formatDate(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-CO", { ...options, timeZone: "UTC" }).format(dateKeyToDate(key));
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Spec 023 fases 2 y 3: lo que se le debe a cada instructor en sus ciclos, pagar
 * y el historial (como la pagina de Pagos de CliqCut).
 */
export function InstructorPaymentsPanel({
  data,
  history,
  canPay = true,
  canConfigure = true
}: {
  data: InstructorPaymentsView;
  history: PaymentHistoryGroup[];
  /** Spec 024: "Realizar pagos" (pagar y anular) y editar el ciclo (dueña y socio). */
  canPay?: boolean;
  canConfigure?: boolean;
}) {
  const [configuring, setConfiguring] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Pagos a instructores</h1>
          <p className="mt-1 text-sm text-ink-500">Lo que le debes a tu equipo en cada ciclo</p>
        </div>
        {data.configurado && canConfigure && data.equipo.instructores ? (
          <Button variant="secondary" className="w-full rounded-xl px-4 py-2 font-medium sm:w-auto" onClick={() => setConfiguring(true)}>
            <FiSettings className="size-4" />
            Configurar ciclo de pago
          </Button>
        ) : null}
      </div>

      {data.configurado ? (
        <Ledger data={data} history={history} canPay={canPay} />
      ) : !data.equipo.instructores ? (
        // Sin instructores con forma de pago no hay a quien pagarle: primero el equipo.
        <EmptyCard
          title="Primero registra a tus instructores"
          description="Para configurar el ciclo de pago necesitas al menos un instructor con su forma de pago (sueldo, por clase o por alumno)."
          action={
            <Link
              href="/dashboard/colaboradores"
              className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Ir a Colaboradores
            </Link>
          }
        />
      ) : (
        <EmptyCard
          title="Configura tu ciclo de pago"
          description="Elige cada cuánto les pagas a tus instructores. Desde ese día Duali calcula, clase por clase, lo que le debes a cada uno. No se genera deuda de antes."
          action={
            canConfigure ? (
              <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setConfiguring(true)}>
                <FiSettings className="size-4" />
                Configurar ciclo de pago
              </Button>
            ) : null
          }
        />
      )}

      {configuring ? (
        <SettingsModal settings={data.configurado ? data.settings : null} team={data.equipo} today={data.configurado ? data.hoy : null} onClose={() => setConfiguring(false)} />
      ) : null}
    </div>
  );
}

function Ledger({ data, history, canPay }: { data: Configured; history: PaymentHistoryGroup[]; canPay: boolean }) {
  const [tab, setTab] = useState<"pendientes" | "historial">("pendientes");
  const paymentsCount = history.reduce((sum, group) => sum + group.pagos.length, 0);

  return (
    <>
      <div className={cn("grid gap-3", data.equipo.comision && data.equipo.sueldo && "md:grid-cols-2")}>
        {data.equipo.comision ? <CycleBanner title="Comisiones" window={data.ciclos.comision} today={data.hoy} /> : null}
        {data.equipo.sueldo ? <CycleBanner title="Sueldos" window={data.ciclos.sueldo} today={data.hoy} /> : null}
      </div>

      {/* Pestañas subrayadas, como Pagos de CliqCut. */}
      <nav className="flex gap-1 border-b border-ink-200" role="tablist" aria-label="Pagos">
        {(
          [
            ["pendientes", "Pendientes", data.resumen.instructores],
            ["historial", "Historial", paymentsCount]
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
              tab === value ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
            )}
          >
            {label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", tab === value ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500")}>
              {count}
            </span>
          </button>
        ))}
      </nav>

      {tab === "historial" ? <HistoryList history={history} canPay={canPay} /> : <Pending data={data} canPay={canPay} />}
    </>
  );
}

function Pending({ data, canPay }: { data: Configured; canPay: boolean }) {
  const commission = data.instructores.filter((person) => person.comision.length);
  const salary = data.instructores.filter((person) => person.sueldo.length);
  const pendingOf = (cycles: InstructorCycleView[]) => cycles.reduce((sum, cycle) => sum + Math.max(0, cycle.pendiente), 0);

  return (
    <>

      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-sm">
        <p className="text-sm font-medium text-white/80">Total pendiente de pago</p>
        <p className="mt-1 text-3xl font-black tabular-nums">{currency(data.resumen.totalPendiente)}</p>
        <p className="mt-1 text-sm text-white/80">
          {[
            plural(data.resumen.instructores, "instructor", "instructores"),
            plural(data.resumen.clases, "clase"),
            data.resumen.saldosAnteriores ? plural(data.resumen.saldosAnteriores, "saldo anterior", "saldos anteriores") : null
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {!data.instructores.length ? (
        <p className="rounded-2xl border border-dashed border-ink-200 py-10 text-center text-sm text-ink-500">
          Aún no hay ciclos. Asigna instructores con forma de pago a tus horarios en{" "}
          <Link href="/dashboard/colaboradores" className="font-medium text-brand-600 hover:underline">
            Colaboradores
          </Link>
          .
        </p>
      ) : null}

      {commission.length ? (
        <section className="space-y-3">
          <SectionTitle
            title="Por clases y alumnos"
            detail={`${data.ciclos.comision.frecuencia} — pendiente ${currency(commission.reduce((sum, person) => sum + pendingOf(person.comision), 0))}`}
          />
          <div className="grid gap-3 xl:grid-cols-2">
            {commission.map((person) => (
              <PersonCard key={person.id} person={person} cycles={person.comision} payDay={data.ciclos.comision.venceEl} today={data.hoy} canPay={canPay} />
            ))}
          </div>
        </section>
      ) : null}

      {salary.length ? (
        <section className="space-y-3">
          <SectionTitle
            title="Sueldos"
            detail={`${data.ciclos.sueldo.frecuencia} — pendiente ${currency(salary.reduce((sum, person) => sum + pendingOf(person.sueldo), 0))}`}
          />
          <div className="grid gap-3 xl:grid-cols-2">
            {salary.map((person) => (
              <PersonCard key={person.id} person={person} cycles={person.sueldo} payDay={data.ciclos.sueldo.venceEl} today={data.hoy} canPay={canPay} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <h2 className="text-xs font-black uppercase tracking-wide text-ink-500">{title}</h2>
      <span className="text-xs text-ink-400">· {detail}</span>
    </div>
  );
}

function CycleBanner({ title, window, today }: { title: string; window: Configured["ciclos"]["comision"]; today: string }) {
  const days = daysBetweenKeys(today, window.venceEl);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <FiCalendar className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-800">
            {title}: {window.etiqueta}
          </p>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", days === 0 ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-600")}>
            {days === 0 ? "Hoy se paga" : `Faltan ${plural(days, "día")}`}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          Se paga el {formatDate(window.venceEl, { weekday: "long", day: "numeric", month: "short" })} · {window.frecuencia}
        </p>
      </div>
    </div>
  );
}

function PersonCard({
  person,
  cycles,
  payDay,
  today,
  canPay
}: {
  person: Person;
  cycles: InstructorCycleView[];
  payDay: string;
  today: string;
  canPay: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const current = cycles.find((cycle) => cycle.actual) ?? cycles.at(-1)!;
  const previous = cycles.filter((cycle) => cycle !== current && cycle.pendiente > 0);
  const previousTotal = previous.reduce((sum, cycle) => sum + cycle.pendiente, 0);
  const unmarked = cycles.reduce((sum, cycle) => sum + cycle.sinMarcar, 0);
  const total = previousTotal + Math.max(0, current.pendiente);
  const isSalary = current.tipo === "SUELDO";

  return (
    <article className="rounded-2xl border border-ink-200 bg-white shadow-sm">
      {previous.length || unmarked ? (
        <div className="space-y-1 border-b border-ink-100 px-4 py-2.5">
          {previous.length ? (
            <p className="flex items-center justify-between gap-2 text-xs font-medium text-amber-700">
              <span className="flex items-center gap-1.5">
                <FiAlertTriangle className="size-3.5" />
                Saldo anterior ({previous.map((cycle) => cycle.etiqueta).join(", ")})
              </span>
              <span className="tabular-nums">{currency(previousTotal)}</span>
            </p>
          ) : null}
          {unmarked ? (
            <p className="flex items-center justify-between gap-2 text-xs font-medium text-amber-700">
              <span className="flex items-center gap-1.5">
                <FiAlertTriangle className="size-3.5" />
                {plural(unmarked, "reserva")} sin asistencia marcada
              </span>
              <Link href="/dashboard/horario?vista=asistencia" className="font-semibold text-brand-600 hover:underline">
                Marcar ›
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={person.nombre} color={person.color} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-800">{person.nombre}</p>
            <p className="truncate text-xs text-ink-500">{person.descripcionPago}</p>
          </div>
          {current.congelado ? (
            <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">Con pagos</span>
          ) : null}
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-ink-50/70 p-3 text-center">
          <Stat label={isSalary ? "Clases (info)" : "Clases"} value={String(current.clases)} />
          <Stat label="Alumnos" value={isSalary ? "—" : String(current.alumnos)} />
          <Stat label={isSalary ? "Sueldo" : "Generado"} value={currency(isSalary ? current.sueldo : current.generado)} />
        </dl>

        {current.cobradoDespues || current.ajustes || current.adelantos || current.pagado ? (
          <ul className="space-y-1 text-xs text-ink-600">
            {current.cobradoDespues ? <Line label="Cobrado después" value={current.cobradoDespues} /> : null}
            {current.ajustes ? <Line label="Ajustes" value={current.ajustes} /> : null}
            {current.adelantos ? <Line label="Adelantos" value={-current.adelantos} /> : null}
            {current.pagado ? <Line label="Ya pagado" value={-current.pagado} /> : null}
          </ul>
        ) : null}

        <div className="flex items-end justify-between gap-3 border-t border-ink-100 pt-3">
          <div>
            <p className="text-xs text-ink-500">A pagar · ciclo {current.etiqueta}</p>
            <p className="text-xl font-black tabular-nums text-ink-900">{currency(total)}</p>
          </div>
          {canPay ? (
            <Button className="rounded-xl px-4 py-2 text-sm font-semibold shadow-none" disabled={total <= 0} onClick={() => setPaying(true)}>
              {total > 0 ? `Pagar ${currency(total)}` : "Al día"}
            </Button>
          ) : null}
        </div>

        <div className="flex justify-end">
          {current.detalle.length ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
            >
              {open ? "Ocultar clases" : "Ver clases"}
              {open ? <FiChevronUp className="size-3.5" /> : <FiChevronDown className="size-3.5" />}
            </button>
          ) : null}
        </div>

        {open ? (
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
            {current.detalle.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-700">
                    {formatDate(row.fecha, { weekday: "short", day: "numeric", month: "short" })} · {row.disciplina}{" "}
                    {formatTimeKey(row.horaInicio)}
                  </p>
                  <p className="text-ink-500">
                    {plural(row.alumnos, "alumno")}
                    {row.sinMarcar ? ` · ${row.sinMarcar} sin marcar` : ""}
                    {row.regla === "MINIMO" ? " · mínimo por clase" : row.regla === "POCOS_ALUMNOS" ? " · no llega a los alumnos mínimos" : ""}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-ink-800">{currency(row.ganado)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {paying ? (
        <PayModal person={person} current={current} previous={previous} isPayDay={today === payDay} payDay={payDay} onClose={() => setPaying(false)} />
      ) : null}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-black tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={cn("font-semibold tabular-nums", value < 0 ? "text-rose-600" : "text-brand-700")}>
        {value < 0 ? "−" : "+"}
        {currency(Math.abs(value))}
      </span>
    </li>
  );
}

// ─── Configurar ciclo de pago (R6), como el de CliqCut ────────────────────────

const FREQUENCY_OPTIONS: Array<{ value: PayFrequency; label: string; desc: string }> = [
  { value: "DIARIO", label: "Diario", desc: "Cada día" },
  { value: "SEMANAL", label: "Semanal", desc: "Una vez/semana" },
  { value: "QUINCENAL", label: "Quincenal", desc: "Ancla mensual + 15 días" },
  { value: "MENSUAL", label: "Mensual", desc: "Una vez/mes" }
];

// En pantalla de domingo a sábado, como CliqCut; se guarda el dia ISO (lunes 1 … domingo 7).
const WEEK_ORDER = [7, 1, 2, 3, 4, 5, 6];
const DAY_SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom" };
const DAY_FULL: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo" };

type Form = Omit<InstructorPaySettingsView, "activadoEl">;

const DEFAULTS: Form = {
  frecuencia: "SEMANAL",
  diaPago: 7,
  frecuenciaSueldo: "MENSUAL",
  diaPagoSueldo: 15,
  diaPagoAbreSiguiente: false,
  inasistenciasCuentan: false,
  pagarClasesVacias: false,
  basePorcentaje: "VENDIDO"
};

function defaultDay(frecuencia: PayFrequency) {
  return frecuencia === "SEMANAL" ? 1 : frecuencia === "DIARIO" ? 1 : 15;
}

function SettingsModal({
  settings,
  team,
  today,
  onClose
}: {
  settings: InstructorPaySettingsView | null;
  team: TeamPaySummary;
  today: string | null;
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const [form, setForm] = useState<Form>(() => {
    if (!settings) return DEFAULTS;
    const { activadoEl: _activadoEl, ...rest } = settings;
    return rest;
  });
  const [tab, setTab] = useState<"comision" | "sueldo">(team.comision ? "comision" : "sueldo");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const hasTabs = team.comision && team.sueldo;
  const onCommission = tab === "comision";

  async function save() {
    setSaving(true);
    const saved = await request(
      "/api/instructor-payments/settings",
      { method: "PUT", body: JSON.stringify(form) },
      settings ? "Ciclo de pago actualizado" : "Ciclo de pago activado"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal
      open
      size="md"
      onClose={() => (saving ? undefined : onClose())}
      title="Configurar ciclo de pago"
      description={hasTabs ? "Cuándo y con qué frecuencia pagas" : team.comision ? "Ciclo de comisiones por clase y por alumno" : "Ciclo de sueldos fijos"}
      footer={
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1 rounded-2xl py-3" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" className="flex-1 rounded-2xl py-3 font-bold shadow-none" loading={saving} onClick={save}>
            <FiCheck className="size-4" />
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!settings ? <p className="text-xs text-ink-500">Los ciclos empiezan hoy: no se genera deuda de antes.</p> : null}

        {/* Pestañas solo si hay instructores de los dos tipos, como CliqCut. */}
        {hasTabs ? (
          <div className="flex gap-1 rounded-xl bg-ink-100 p-1">
            {(
              [
                ["comision", "Comisiones", FiPercent],
                ["sueldo", "Sueldos", FiCalendar]
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all",
                  tab === value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {onCommission ? (
          <CycleSection
            title="Comisiones por clase y por alumno"
            subtitle="Para instructores que ganan según las clases que dictan o los alumnos que asisten"
            icon={<FiPercent className="size-4 text-sky-500" />}
            tone="border-sky-100 bg-sky-50/40"
            frecuencia={form.frecuencia}
            dia={form.diaPago}
            today={today}
            onFrequency={(value) => setForm((current) => ({ ...current, frecuencia: value, diaPago: defaultDay(value) }))}
            onDay={(value) => set("diaPago", value)}
          />
        ) : (
          <CycleSection
            title="Sueldos fijos"
            subtitle="Para instructores con sueldo, y la parte fija de sueldo + variable"
            icon={<FiCalendar className="size-4 text-violet-500" />}
            tone="border-violet-100 bg-violet-50/40"
            frecuencia={form.frecuenciaSueldo}
            dia={form.diaPagoSueldo}
            today={today}
            onFrequency={(value) => setForm((current) => ({ ...current, frecuenciaSueldo: value, diaPagoSueldo: defaultDay(value) }))}
            onDay={(value) => set("diaPagoSueldo", value)}
          />
        )}

        {/* El corte es uno solo para el estudio: el interruptor se ve igual en las dos pestañas. */}
        <PayDayBoundaryToggle
          frecuencia={onCommission ? form.frecuencia : form.frecuenciaSueldo}
          dia={onCommission ? form.diaPago : form.diaPagoSueldo}
          value={form.diaPagoAbreSiguiente}
          onChange={(value) => set("diaPagoAbreSiguiente", value)}
        />

        {/* Reglas de lo que cuenta (D3 y D2): solo las que aplican a tu equipo. */}
        {onCommission && (team.porAlumno || team.porClase) ? (
          <div className="space-y-3 rounded-2xl border-2 border-ink-100 bg-ink-50/60 p-4">
            <p className="text-sm font-bold text-ink-800">Qué cuenta en las comisiones</p>
            {team.porAlumno ? (
              <RuleToggle
                label="Las inasistencias también cuentan"
                description="Una alumna que reservó y no llegó cuenta como alumno de la clase."
                checked={form.inasistenciasCuentan}
                onChange={(value) => set("inasistenciasCuentan", value)}
              />
            ) : null}
            {team.porClase ? (
              <RuleToggle
                label="Pagar clases aunque no llegue nadie"
                description="Para quien cobra por clase dictada: la clase se paga aunque no haya asistido nadie."
                checked={form.pagarClasesVacias}
                onChange={(value) => set("pagarClasesVacias", value)}
              />
            ) : null}
            {team.porcentaje ? (
              <div>
                <p className="text-xs font-semibold text-ink-500">El porcentaje por alumno sale de</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["VENDIDO", "Precio vendido", "Aunque la clienta aún no haya pagado"],
                      ["COBRADO", "Solo lo cobrado", "El resto se suma cuando lo pague"]
                    ] as const
                  ).map(([value, label, description]) => (
                    <OptionCard key={value} selected={form.basePorcentaje === value} label={label} description={description} onClick={() => set("basePorcentaje", value)} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Tarjeta de opcion con su check, como el selector de frecuencia de CliqCut. */
function OptionCard({ selected, label, description, onClick }: { selected: boolean; label: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border-2 p-3.5 text-left transition-all active:scale-95",
        selected ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
      )}
    >
      {selected ? (
        <span className="absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full bg-brand-500">
          <FiCheck className="size-2.5 text-white" />
        </span>
      ) : null}
      <p className="pr-5 text-sm font-bold text-ink-900">{label}</p>
      <p className="mt-0.5 text-[11px] text-ink-400">{description}</p>
    </button>
  );
}

function CycleSection({
  title,
  subtitle,
  icon,
  tone,
  frecuencia,
  dia,
  today,
  onFrequency,
  onDay
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: string;
  frecuencia: PayFrequency;
  dia: number;
  today: string | null;
  onFrequency: (value: PayFrequency) => void;
  onDay: (value: number) => void;
}) {
  return (
    <div className={cn("space-y-4 rounded-2xl border-2 p-4", tone)}>
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/60">{icon}</div>
        <div>
          <p className="text-sm font-bold text-ink-800">{title}</p>
          <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <OptionCard key={option.value} selected={frecuencia === option.value} label={option.label} description={option.desc} onClick={() => onFrequency(option.value)} />
        ))}
      </div>
      {frecuencia === "SEMANAL" ? <WeekDayPicker value={dia} onChange={onDay} /> : null}
      {frecuencia === "QUINCENAL" || frecuencia === "MENSUAL" ? (
        <MonthDayPicker value={dia} onChange={onDay} biweekly={frecuencia === "QUINCENAL"} today={today} />
      ) : null}
      {frecuencia === "DIARIO" ? <p className="py-1 text-center text-xs text-ink-400">Se liquida cada día automáticamente</p> : null}
    </div>
  );
}

function WeekDayPicker({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-ink-500">Día de la semana</p>
      <div className="grid grid-cols-7 gap-1">
        {WEEK_ORDER.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={value === day}
            aria-label={DAY_FULL[day]}
            onClick={() => onChange(day)}
            className={cn(
              "rounded-xl py-2.5 text-xs font-bold transition-all active:scale-95",
              value === day ? "bg-brand-500 text-white shadow-sm" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            )}
          >
            {DAY_SHORT[day]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink-400">
        Pago cada <span className="font-semibold text-ink-600">{DAY_FULL[value]}</span>
      </p>
    </div>
  );
}

function MonthDayPicker({ value, onChange, biweekly, today }: { value: number; onChange: (day: number) => void; biweekly: boolean; today: string | null }) {
  const reference = today ?? new Date().toISOString().slice(0, 10);
  const upcoming = biweekly ? upcomingPayDates("QUINCENAL", value, reference, 2) : [];
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-ink-500">{biweekly ? "Primer día de pago del mes (el segundo será +15 días)" : "Día del mes"}</p>
      <div className="grid max-h-32 grid-cols-7 gap-1 overflow-y-auto">
        {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={value === day}
            onClick={() => onChange(day)}
            className={cn(
              "aspect-square rounded-xl text-xs font-bold transition-all active:scale-95",
              value === day ? "bg-brand-500 text-white shadow-sm" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            )}
          >
            {day}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink-400">
        {biweekly ? (
          `próximos pagos: ${longDate(upcoming[0])} y ${longDate(upcoming[1])}`
        ) : (
          <>
            Pago el día <span className="font-semibold text-ink-600">{value}</span> de cada mes
          </>
        )}
      </p>
    </div>
  );
}

/** "Lo del día de pago entra al ciclo siguiente" con la frase de qué pasa, como CliqCut. */
function boundaryCopy(frecuencia: PayFrequency, dia: number, enabled: boolean) {
  if (frecuencia === "DIARIO") {
    return enabled
      ? "Cada día le pagas a tu equipo lo dictado el día anterior. Lo de hoy se paga mañana."
      : "Cada día le pagas a tu equipo lo dictado ese mismo día, incluido lo del propio día.";
  }
  if (frecuencia === "SEMANAL") {
    const pay = DAY_FULL[dia].toLocaleLowerCase("es");
    const before = DAY_FULL[dia === 1 ? 7 : dia - 1].toLocaleLowerCase("es");
    return enabled
      ? `El ${pay} le pagas a tu equipo lo dictado hasta el ${before}. Lo que se dicte el ${pay} arranca el ciclo nuevo y se paga en la siguiente liquidación.`
      : `El ${pay} le pagas a tu equipo lo dictado hasta ese mismo ${pay}, incluido lo del día de pago.`;
  }
  const before = dia > 1 ? `el ${dia - 1}` : "el último día del mes anterior";
  const second = frecuencia === "QUINCENAL" ? ` Lo mismo aplica al pago del ${dia + 15}.` : "";
  return enabled
    ? `El ${dia} le pagas a tu equipo lo dictado hasta ${before}. Lo que se dicte el ${dia} arranca el ciclo nuevo y se paga en la siguiente liquidación.${second}`
    : `El ${dia} le pagas a tu equipo lo dictado hasta ese mismo ${dia}, incluido lo del día de pago.${second}`;
}

function PayDayBoundaryToggle({
  frecuencia,
  dia,
  value,
  onChange
}: {
  frecuencia: PayFrequency;
  dia: number;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-ink-100 bg-ink-50/60 p-4">
      <RuleToggle
        label="Lo del día de pago entra al ciclo siguiente"
        description="Define si lo dictado el día de pago se paga ese mismo día o en la próxima liquidación."
        checked={value}
        onChange={onChange}
      />
      <div className={cn("mt-3 rounded-xl border px-3 py-2.5", value ? "border-brand-100 bg-brand-50" : "border-ink-200 bg-white")}>
        <p className={cn("text-xs leading-relaxed", value ? "text-brand-800" : "text-ink-600")}>
          <span className="font-bold">{value ? "Activado." : "Desactivado."}</span> {boundaryCopy(frecuencia, dia, value)}
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-ink-400">Los ciclos que ya tienen pagos conservan el corte con el que se crearon.</p>
    </div>
  );
}

function RuleToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-ink-800">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors", checked ? "bg-brand-500" : "bg-ink-300")}
      >
        <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
      </button>
    </div>
  );
}

// ─── Pagar (R11) ──────────────────────────────────────────────────────────────

type Scope = "TODO" | "SALDO" | "ACTUAL";

function methodLabel(value: string) {
  if (value === "MIXTO") return "Mixto";
  return PAYMENT_METHODS.find((item) => item.value === value)?.label ?? value;
}

/** Como PayConfirmModal de CliqCut: saldo anterior, ciclo actual o los dos; total o parcial. */
function PayModal({
  person,
  current,
  previous,
  isPayDay,
  payDay,
  onClose
}: {
  person: Person;
  current: InstructorCycleView;
  previous: InstructorCycleView[];
  isPayDay: boolean;
  payDay: string;
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const previousTotal = previous.reduce((sum, cycle) => sum + cycle.pendiente, 0);
  const currentTotal = Math.max(0, current.pendiente);
  const candidates: Array<[Scope, string, number] | null> = [
    previousTotal && currentTotal ? ["TODO", "Saldo + ciclo actual", previousTotal + currentTotal] : null,
    previousTotal ? ["SALDO", "Solo saldo anterior", previousTotal] : null,
    currentTotal ? ["ACTUAL", "Solo ciclo actual", currentTotal] : null
  ];
  const scopes = candidates.filter((item): item is [Scope, string, number] => item !== null);
  const [scope, setScope] = useState<Scope>(scopes[0]?.[0] ?? "TODO");
  const max = scopes.find(([value]) => value === scope)?.[2] ?? 0;
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState(String(max));
  // Spec 027: el mismo selector de pago en dos partes de todo Duali.
  const [parts, setParts] = useState<PaymentPart[]>([{ metodo: "EFECTIVO", monto: max }]);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  const total = partial ? Number(amount || 0) : max;
  // Con una sola forma, esa forma lleva el total.
  const methods = parts.length === 1 ? [{ ...parts[0], monto: total }] : parts;
  const error = total <= 0 ? "Escribe el monto" : total > max ? `El máximo es ${currency(max)}` : paymentPartsError(total, methods);

  function chooseScope(value: Scope) {
    const next = scopes.find(([item]) => item === value)?.[2] ?? 0;
    setScope(value);
    setAmount(String(next));
    setParts((list) => (list.length === 1 ? [{ ...list[0], monto: next }] : list));
  }

  async function pay() {
    if (error) return;
    setSaving(true);
    const saved = await request(
      "/api/instructor-payments/pay",
      {
        method: "POST",
        body: JSON.stringify({
          instructorId: person.id,
          tipo: current.tipo,
          alcance: scope,
          monto: total,
          metodos: methods.map((item) => ({ metodo: item.metodo, monto: Number(item.monto) })),
          nota: nota.trim() || null
        })
      },
      `Pago de ${currency(total)} registrado`
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal open onClose={() => (saving ? undefined : onClose())} title={`Pagar a ${person.nombre}`} description={person.descripcionPago}>
      <div className="space-y-4">
        <ul className="space-y-1.5 rounded-xl bg-ink-50/70 p-3 text-sm">
          {previous.map((cycle) => (
            <li key={cycle.id} className="flex justify-between gap-2 text-amber-800">
              <span>Saldo anterior ({cycle.etiqueta})</span>
              <span className="font-semibold tabular-nums">{currency(cycle.pendiente)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2 text-ink-700">
            <span>Ciclo actual ({current.etiqueta})</span>
            <span className="font-semibold tabular-nums">{currency(current.neto)}</span>
          </li>
          {current.pagado ? (
            <li className="flex justify-between gap-2 text-ink-500">
              <span>Ya pagado de este ciclo</span>
              <span className="tabular-nums">−{currency(current.pagado)}</span>
            </li>
          ) : null}
          <li className="flex justify-between gap-2 border-t border-ink-200 pt-1.5 font-bold text-ink-900">
            <span>Total sugerido</span>
            <span className="tabular-nums">{currency(previousTotal + currentTotal)}</span>
          </li>
        </ul>

        {scopes.length > 1 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {scopes.map(([value, label, amountFor]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => chooseScope(value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  scope === value ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                )}
              >
                <p className="text-xs font-bold text-ink-800">{label}</p>
                <p className="text-[11px] text-ink-500">{currency(amountFor)}</p>
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-ink-200 p-3">
          <ToggleRow label="Pago parcial" checked={partial} onChange={setPartial} />
          {partial ? (
            <div className="mt-2">
              <MoneyInput value={amount} onChange={setAmount} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Monto a pagar" />
              <p className="mt-1 text-[11px] text-ink-500">
                Máximo {currency(max)}.{total > 0 && total < max ? ` Quedan ${currency(max - total)} pendientes.` : ""}
              </p>
            </div>
          ) : null}
        </div>

        <PaymentBreakdown label="¿Con qué le pagas?" total={total > 0 ? total : 0} value={parts} onChange={setParts} />

        <div>
          <label className={labelClass} htmlFor="pay-note">
            Nota <span className="text-ink-400">(opcional)</span>
          </label>
          <input id="pay-note" className={inputClass} value={nota} maxLength={300} onChange={(event) => setNota(event.target.value)} />
        </div>

        {!isPayDay ? (
          <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Hoy no es el día de pago configurado ({formatDate(payDay, { weekday: "long", day: "numeric", month: "short" })}). Puedes pagar igual.
          </p>
        ) : null}
        {error && total > 0 ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" className="flex-1 rounded-xl py-2.5 shadow-none" loading={saving} disabled={Boolean(error)} onClick={pay}>
            Pagar {currency(total)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Historial y detalle (R13) ────────────────────────────────────────────────

function formatInstant(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(new Date(iso));
}

function HistoryList({ history, canPay }: { history: PaymentHistoryGroup[]; canPay: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!history.length) {
    return <p className="rounded-2xl border border-dashed border-ink-200 py-10 text-center text-sm text-ink-500">Aún no has registrado pagos.</p>;
  }
  return (
    <div className="space-y-4">
      {history.map((group) => (
        <section key={group.key} className="rounded-2xl border border-ink-200 bg-white shadow-sm">
          <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-ink-800">
              {group.etiqueta} <span className="font-normal text-ink-500">· {group.tipo === "SUELDO" ? "Sueldos" : "Comisiones"} · {plural(group.pagos.length, "pago")}</span>
            </p>
            <span className="text-sm font-black tabular-nums text-ink-900">{currency(group.total)}</span>
          </header>
          <ul className="divide-y divide-ink-100">
            {group.pagos.map((payment) => (
              <li key={payment.id}>
                <PaymentRow payment={payment} onOpen={() => setSelected(payment.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {selected ? <PaymentDetailModal id={selected} canVoid={canPay} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function PaymentRow({ payment, onOpen }: { payment: InstructorPaymentItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50/60">
      <Avatar name={payment.instructor.nombre} color={payment.instructor.color} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", payment.anulado ? "text-ink-400 line-through" : "text-ink-800")}>{payment.instructor.nombre}</p>
        <p className="text-xs text-ink-500">
          {formatInstant(payment.fecha)} · {methodLabel(payment.metodo)}
        </p>
      </div>
      {payment.anulado ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">Anulado</span> : null}
      <span className={cn("text-sm font-bold tabular-nums", payment.anulado ? "text-ink-400 line-through" : "text-ink-900")}>{currency(payment.monto)}</span>
      <FiChevronRight className="size-4 text-ink-400" />
    </button>
  );
}

/** Como PaymentHistoryDetailModal de CliqCut: la fotografia de lo que se pago. */
function PaymentDetailModal({ id, canVoid, onClose }: { id: string; canVoid: boolean; onClose: () => void }) {
  const { data: auth } = useSession();
  const token = auth?.user.apiToken ?? "";
  const request = useStudioRequest();
  const [detail, setDetail] = useState<InstructorPaymentDetail | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    clientApiFetch<InstructorPaymentDetail>(`/api/instructor-payments/${id}`, token)
      .then(setDetail)
      .catch(() => onClose());
  }, [id, token, onClose]);

  async function voidPayment() {
    setSaving(true);
    const done = await request(`/api/instructor-payments/${id}`, { method: "DELETE", body: JSON.stringify({ motivo }) }, "Pago anulado");
    setSaving(false);
    if (done) onClose();
  }

  return (
    <Modal open onClose={() => (saving ? undefined : onClose())} title="Detalle del pago" description={detail ? `${detail.instructor.nombre} · ${formatInstant(detail.fecha)}` : "Cargando…"}>
      {!detail ? (
        <p className="py-6 text-center text-sm text-ink-400">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end justify-between rounded-xl bg-ink-50/70 p-3">
            <div>
              <p className="text-xs text-ink-500">{detail.tipo === "SUELDO" ? "Sueldo" : "Comisiones"} · {methodLabel(detail.metodo)}</p>
              <p className={cn("text-2xl font-black tabular-nums", detail.anulado ? "text-ink-400 line-through" : "text-ink-900")}>{currency(detail.monto)}</p>
            </div>
            {detail.anulado ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">Anulado</span> : null}
          </div>

          {detail.anulado && detail.motivoAnulacion ? <p className="text-xs text-rose-700">Motivo: {detail.motivoAnulacion}</p> : null}
          {detail.metodos.length > 1 ? (
            <ul className="space-y-1 text-sm">
              {detail.metodos.map((item) => (
                <li key={item.metodo} className="flex justify-between">
                  <span className="text-ink-600">{methodLabel(item.metodo)}</span>
                  <span className="font-semibold tabular-nums">{currency(item.monto)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {detail.nota ? <p className="rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-600">{detail.nota}</p> : null}

          {detail.detalleCiclos.map((item) => (
            <section key={item.ciclo.id} className="rounded-xl border border-ink-200">
              <header className="flex justify-between gap-2 border-b border-ink-100 px-3 py-2 text-sm">
                <span className="font-semibold text-ink-800">Ciclo {item.ciclo.etiqueta}</span>
                <span className="tabular-nums text-ink-600">aplicado {currency(item.aplicado)}</span>
              </header>
              <div className="space-y-1 px-3 py-2 text-xs text-ink-600">
                <p>Forma de pago congelada: {item.formaDePago}</p>
                <p>
                  {item.ciclo.tipo === "SUELDO" ? `Sueldo ${currency(item.ciclo.sueldo)}` : `${plural(item.ciclo.clases, "clase")} · ${plural(item.ciclo.alumnos, "alumno")} · generado ${currency(item.ciclo.generado)}`}
                  {item.ciclo.cobradoDespues ? ` · cobrado después ${currency(item.ciclo.cobradoDespues)}` : ""}
                </p>
                <p>
                  Pagado {currency(item.ciclo.pagado)} · pendiente {currency(Math.max(0, item.ciclo.pendiente))}
                </p>
              </div>
              {item.ciclo.detalle.length ? (
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {item.ciclo.detalle.map((row) => (
                    <li key={row.id} className="flex justify-between gap-2 px-3 py-1.5 text-xs">
                      <span className="text-ink-600">
                        {formatDate(row.fecha, { weekday: "short", day: "numeric", month: "short" })} · {row.disciplina} · {plural(row.alumnos, "alumno")}
                        {row.regla === "MINIMO" ? " (mínimo)" : ""}
                      </span>
                      <span className="font-semibold tabular-nums text-ink-800">{currency(row.ganado)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          {!detail.anulado && canVoid ? (
            voiding ? (
              <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <label className={labelClass} htmlFor="void-reason">
                  ¿Por qué lo anulas?
                </label>
                <input id="void-reason" className={inputClass} value={motivo} maxLength={200} onChange={(event) => setMotivo(event.target.value)} />
                <p className="text-[11px] text-ink-500">El saldo vuelve a quedar pendiente y se borra su egreso.</p>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2" onClick={() => setVoiding(false)}>
                    Volver
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 rounded-xl bg-rose-600 py-2 shadow-none hover:bg-rose-700"
                    loading={saving}
                    disabled={motivo.trim().length < 3}
                    onClick={voidPayment}
                  >
                    Anular pago
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setVoiding(true)} className="text-xs font-semibold text-rose-600 hover:underline">
                Anular pago
              </button>
            )
          ) : null}
        </div>
      )}
    </Modal>
  );
}

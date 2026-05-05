"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiCalendar, FiChevronDown, FiChevronUp, FiPlus } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";
import type { ExpenseItem } from "@/lib/web-types";

type ExpenseFormValues = {
  concepto: string;
  descripcion?: string;
  monto: number;
  fecha: string;
  categoria?: string;
};

type ExpenseFilterMode = "day" | "month";

const MONTH_NAMES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic"
];

export function ExpensesPanel({ expenses }: { expenses: ExpenseItem[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const token = session?.user.apiToken ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseItem | null>(null);
  const [filterMode, setFilterMode] = useState<ExpenseFilterMode>("day");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<ExpenseFormValues>({
    defaultValues: createDefaultValues(buildSelectedDate(currentMonthValue(), new Date().getDate()))
  });

  const monthDays = useMemo(() => buildMonthDays(selectedMonth), [selectedMonth]);
  const selectedDate = useMemo(() => buildSelectedDate(selectedMonth, selectedDay), [selectedMonth, selectedDay]);
  const monthlyExpenses = useMemo(
    () => expenses.filter((expense) => normalizeDateKey(expense.fecha).startsWith(selectedMonth)),
    [expenses, selectedMonth]
  );

  useEffect(() => {
    const totalDays = monthDays.length;
    if (selectedDay > totalDays) {
      setSelectedDay(totalDays);
    }
  }, [monthDays, selectedDay]);

  useEffect(() => {
    const key = buildSelectedDate(selectedMonth, selectedDay);
    dayButtonRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [selectedDay, selectedMonth]);

  const expensesForSelectedDay = useMemo(
    () => monthlyExpenses.filter((expense) => normalizeDateKey(expense.fecha) === selectedDate),
    [monthlyExpenses, selectedDate]
  );

  const countByDay = useMemo(() => {
    const map = new Map<string, number>();

    for (const expense of monthlyExpenses) {
      const key = normalizeDateKey(expense.fecha);
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return map;
  }, [monthlyExpenses]);

  const totalForSelectedDay = useMemo(
    () => expensesForSelectedDay.reduce((sum, expense) => sum + Number(expense.monto), 0),
    [expensesForSelectedDay]
  );

  const monthSummary = useMemo(
    () => ({
      totalCount: monthlyExpenses.length,
      totalAmount: monthlyExpenses.reduce((sum, expense) => sum + Number(expense.monto), 0)
    }),
    [monthlyExpenses]
  );

  const groupedMonthExpenses = useMemo(() => groupExpensesByDay(monthlyExpenses), [monthlyExpenses]);

  function openCreateModal() {
    reset(createDefaultValues(filterMode === "day" ? selectedDate : buildSelectedDate(selectedMonth, 1)));
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (isSubmitting) return;
    setCreateOpen(false);
    reset(createDefaultValues(filterMode === "day" ? selectedDate : buildSelectedDate(selectedMonth, 1)));
  }

  async function onSubmit(values: ExpenseFormValues) {
    await clientApiFetch("/api/expenses", token, {
      method: "POST",
      body: JSON.stringify(values)
    })
      .then(() => {
        sileo.success({ title: "Egreso registrado" });
        closeCreateModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function deleteExpense() {
    if (!deleteTarget) return;

    await clientApiFetch(`/api/expenses/${deleteTarget.id}`, token, { method: "DELETE" })
      .then(() => {
        sileo.success({ title: "Egreso eliminado" });
        setDeleteTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  function toggleDaySection(key: string) {
    setCollapsedDays((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="space-y-5">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Finanzas</p>
                <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-ink-950 sm:text-[2.2rem]">Egresos</h1>
                <p className="mt-2 text-sm text-ink-500">
                  {filterMode === "day"
                    ? `${expensesForSelectedDay.length} ese día · ${currency(totalForSelectedDay)}`
                    : `${monthSummary.totalCount} en el mes · ${currency(monthSummary.totalAmount)}`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFilterMode("day")}
                  className={cn(
                    "rounded-[16px] border px-4 py-2 text-[13px] font-semibold transition",
                    filterMode === "day"
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  )}
                >
                  Por día
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("month")}
                  className={cn(
                    "rounded-[16px] border px-4 py-2 text-[13px] font-semibold transition",
                    filterMode === "month"
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  )}
                >
                  Por mes
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-center">
                <div className="relative min-w-0">
                  <FiCalendar className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="field-base h-11 w-full rounded-[18px] pl-11 pr-4 text-[14px]"
                  />
                </div>
                <Button className="min-h-11 w-full rounded-[18px] px-5 text-sm font-semibold sm:w-auto" onClick={openCreateModal}>
                  <FiPlus className="size-4" />
                  Nuevo egreso
                </Button>
              </div>
            </div>

            {filterMode === "day" ? (
              <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
                <div className="flex min-w-max gap-3">
                  {monthDays.map((day) => {
                    const isSelected = day.day === selectedDay;
                    const count = countByDay.get(day.dateKey) ?? 0;

                    return (
                      <button
                        key={day.dateKey}
                        ref={(node) => {
                          dayButtonRefs.current[day.dateKey] = node;
                        }}
                        type="button"
                        onClick={() => setSelectedDay(day.day)}
                        className={cn(
                          "relative rounded-[18px] px-5 py-3 text-sm font-semibold transition",
                          isSelected
                            ? "bg-rose-500 text-white shadow-soft"
                            : "border border-ink-200 bg-ink-50 text-ink-700 hover:border-ink-300 hover:bg-white"
                        )}
                      >
                        {day.label}
                        {count > 0 ? (
                          <span
                            className={cn(
                              "absolute right-2 top-2 size-2 rounded-full",
                              isSelected ? "bg-white/85" : "bg-rose-400"
                            )}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {filterMode === "day" ? (
          expensesForSelectedDay.length ? (
            <section className="grid gap-4 xl:grid-cols-2">
              {expensesForSelectedDay.map((expense) => (
                <ExpenseCard key={expense.id} expense={expense} onDelete={() => setDeleteTarget(expense)} />
              ))}
            </section>
          ) : (
            <section className="rounded-[28px] border border-ink-100 bg-white px-6 py-16 text-center shadow-soft">
              <div className="mx-auto flex size-20 items-center justify-center rounded-[28px] bg-ink-50 text-ink-300">
                <FiCalendar className="size-8" />
              </div>
              <h2 className="mt-6 text-[1.9rem] font-black tracking-tight text-ink-950">Sin egresos ese día</h2>
              <p className="mt-2 text-sm text-ink-500">Toca el botón para registrar un gasto del día seleccionado.</p>
            </section>
          )
        ) : groupedMonthExpenses.length ? (
          groupedMonthExpenses.map((group) => {
            const isCollapsed = Boolean(collapsedDays[group.key]);

            return (
              <section key={group.key} className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
                <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-[1.45rem] font-black tracking-tight text-ink-950">{group.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-ink-400">
                      {group.count} {group.count === 1 ? "registro" : "registros"} · {currency(group.totalAmount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDaySection(group.key)}
                    className="rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                    aria-label={isCollapsed ? "Mostrar egresos del día" : "Ocultar egresos del día"}
                  >
                    {isCollapsed ? <FiChevronDown className="size-6" /> : <FiChevronUp className="size-6" />}
                  </button>
                </div>

                {isCollapsed ? null : (
                  <div className="grid gap-4 border-t border-ink-100 px-4 py-4 sm:px-6 sm:py-6 xl:grid-cols-2">
                    {group.items.map((expense) => (
                      <ExpenseCard key={expense.id} expense={expense} onDelete={() => setDeleteTarget(expense)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <section className="rounded-[28px] border border-ink-100 bg-white px-6 py-16 text-center shadow-soft">
            <div className="mx-auto flex size-20 items-center justify-center rounded-[28px] bg-ink-50 text-ink-300">
              <FiCalendar className="size-8" />
            </div>
            <h2 className="mt-6 text-[1.9rem] font-black tracking-tight text-ink-950">Sin egresos ese mes</h2>
            <p className="mt-2 text-sm text-ink-500">Selecciona otro mes o registra un nuevo gasto.</p>
          </section>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title="Nuevo egreso"
        description="Registra un gasto operativo y déjalo asociado al día que corresponda."
      >
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Concepto" error={errors.concepto?.message}>
              <input className="field-base" {...register("concepto", { required: "Ingresa el concepto" })} />
            </Field>

            <Field label="Monto" error={errors.monto?.message}>
              <input
                type="number"
                className="field-base"
                {...register("monto", { valueAsNumber: true, required: "Ingresa el monto" })}
              />
            </Field>

            <Field label="Fecha" error={errors.fecha?.message}>
              <input type="date" className="field-base" {...register("fecha", { required: "Selecciona la fecha" })} />
            </Field>

            <Field label="Categoria">
              <input className="field-base" {...register("categoria")} />
            </Field>
          </div>

          <Field label="Descripcion">
            <textarea className="field-base min-h-28 resize-none" {...register("descripcion")} />
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11 flex-1 rounded-[18px]" type="button" variant="secondary" onClick={closeCreateModal}>
              Cancelar
            </Button>
            <Button className="min-h-11 flex-1 rounded-[18px]" type="submit" loading={isSubmitting}>
              Registrar egreso
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar egreso"
        description={`Eliminarás el egreso "${deleteTarget?.concepto}". Esta acción impacta tus métricas financieras.`}
        notice="Elimina este egreso solo si fue registrado por error o si realmente no debe contar en tu caja."
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteExpense}
      />
    </div>
  );
}

function ExpenseCard({ expense, onDelete }: { expense: ExpenseItem; onDelete: () => void }) {
  return (
    <article className="rounded-[24px] border border-ink-100 bg-white px-5 py-5 shadow-[0_10px_26px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">{expense.categoria || "General"}</p>
          <h3 className="mt-2 text-[15px] font-semibold text-ink-950">{expense.concepto}</h3>
          <p className="mt-2 text-sm text-ink-500">{expense.descripcion || "Sin descripción."}</p>
        </div>
        <Button type="button" variant="danger" onClick={onDelete}>
          Eliminar
        </Button>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">Fecha</p>
          <p className="mt-2 text-sm font-semibold text-ink-900">{formatDate(expense.fecha)}</p>
        </div>
        <p className="text-[1.9rem] font-black tracking-tight text-rose-700">{currency(expense.monto)}</p>
      </div>
    </article>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-black text-ink-900">{label}</span>
      {children}
      {error ? <span className="block text-sm font-semibold text-rose-600">{error}</span> : null}
    </label>
  );
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildSelectedDate(monthValue: string, day: number) {
  const [year, month] = monthValue.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildMonthDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();

  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      day,
      dateKey,
      label: `${day} de ${MONTH_NAMES[month - 1] ?? month}`
    };
  });
}

function normalizeDateKey(date: string) {
  const parsed = new Date(date);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function createDefaultValues(date: string): ExpenseFormValues {
  return {
    concepto: "",
    descripcion: "",
    monto: 0,
    fecha: date,
    categoria: ""
  };
}

function groupExpensesByDay(expenses: ExpenseItem[]) {
  const map = new Map<
    string,
    {
      key: string;
      title: string;
      count: number;
      totalAmount: number;
      date: Date;
      items: ExpenseItem[];
    }
  >();

  for (const expense of expenses) {
    const rawDate = new Date(expense.fecha);
    const key = normalizeDateKey(expense.fecha);

    if (!map.has(key)) {
      map.set(key, {
        key,
        title: `${rawDate.getDate()} de ${MONTH_NAMES[rawDate.getMonth()]} de ${rawDate.getFullYear()}`,
        count: 0,
        totalAmount: 0,
        date: rawDate,
        items: []
      });
    }

    const bucket = map.get(key)!;
    bucket.count += 1;
    bucket.totalAmount += Number(expense.monto);
    bucket.items.push(expense);
  }

  return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

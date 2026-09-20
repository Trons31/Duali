"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Controller, useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiCalendar, FiChevronDown, FiChevronUp, FiFilter, FiPlus, FiTrendingDown } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, findExpenseCategory } from "@/lib/expense-categories";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";
import { parseMoney } from "@/lib/money-input";
import type { ExpenseItem } from "@/lib/web-types";

type ExpenseFormValues = {
  concepto: string;
  descripcion?: string;
  monto: string;
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<ExpenseFormValues>({
    defaultValues: createDefaultValues(buildSelectedDate(currentMonthValue(), new Date().getDate()))
  });

  // El selector escribe con `setValue`, asi que el campo se registra aparte
  // para que su regla de obligatorio siga corriendo al enviar.
  register("categoria", { required: "Elige el tipo de egreso" });
  const selectedCategory = watch("categoria");

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
  }, [filtersOpen, selectedDay, selectedMonth]);

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
      body: JSON.stringify({ ...values, monto: parseMoney(values.monto) })
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
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start justify-between gap-3 px-1">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <FiTrendingDown className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-rose-600">Finanzas</p>
              <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Egresos</h1>
              <p className="mt-2 hidden text-sm leading-5 text-ink-500 sm:block">Registra y consulta los gastos de tu negocio.</p>
            </div>
          </div>
          <Button className="min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold sm:px-4 sm:text-sm" onClick={openCreateModal}>
            <FiPlus className="size-4" />
            Nuevo egreso
          </Button>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-500">
                {filterMode === "day"
                  ? monthDays.find((day) => day.day === selectedDay)?.label
                  : formatMonthLabel(selectedMonth)}
              </p>
              <p className="mt-1 text-base font-black text-ink-950 sm:text-lg">
                {filterMode === "day"
                  ? `${expensesForSelectedDay.length} egresos · ${currency(totalForSelectedDay)}`
                  : `${monthSummary.totalCount} egresos · ${currency(monthSummary.totalAmount)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-brand-100",
                filtersOpen
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              )}
              aria-expanded={filtersOpen}
              aria-controls="expense-filters"
            >
              <FiFilter className="size-4" />
              <span className="hidden min-[360px]:inline">Filtros</span>
              <FiChevronDown className={cn("size-3.5 transition", filtersOpen && "rotate-180")} />
            </button>
          </div>

          {filtersOpen ? (
            <div id="expense-filters" className="mt-4 border-t border-ink-100 pt-4">
              <p className="text-sm font-bold text-ink-800">Periodo</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-sm">
                {([
                  { value: "day", label: "Por día" },
                  { value: "month", label: "Por mes" }
                ] as const).map((option) => {
                  const active = filterMode === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilterMode(option.value)}
                      className={cn(
                        "min-h-10 rounded-xl border px-3 text-xs font-semibold transition sm:text-sm",
                        active
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-ink-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-brand-50"
                      )}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <label className="mt-4 block max-w-xs">
                <span className="mb-2 block text-xs font-bold text-ink-600">Mes</span>
                <span className="relative block">
                  <FiCalendar className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="field-base h-11 w-full rounded-xl py-2 pl-10 pr-3 text-sm"
                  />
                </span>
              </label>

              {filterMode === "day" ? (
                <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                  <div className="flex min-w-max gap-2">
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
                            "relative min-h-10 rounded-xl border px-3 text-xs font-semibold transition",
                            isSelected
                              ? "border-rose-500 bg-rose-500 text-white"
                              : "border-ink-200 bg-ink-50 text-ink-700 hover:bg-white"
                          )}
                        >
                          {day.label}
                          {count > 0 ? (
                            <span
                              className={cn(
                                "absolute right-1.5 top-1.5 size-1.5 rounded-full",
                                isSelected ? "bg-white" : "bg-rose-400"
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
          ) : null}
        </section>

        {filterMode === "day" ? (
          expensesForSelectedDay.length ? (
            <section className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              {expensesForSelectedDay.map((expense) => (
                <ExpenseCard key={expense.id} expense={expense} onDelete={() => setDeleteTarget(expense)} />
              ))}
            </section>
          ) : (
            <section className="rounded-[24px] border border-ink-100 bg-white px-6 py-12 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-300">
                <FiCalendar className="size-5" />
              </div>
              <h2 className="mt-4 text-base font-black text-ink-950">Sin egresos ese día</h2>
              <p className="mt-2 text-sm text-ink-500">Registra un gasto para la fecha seleccionada.</p>
            </section>
          )
        ) : groupedMonthExpenses.length ? (
          groupedMonthExpenses.map((group) => {
            const isCollapsed = Boolean(collapsedDays[group.key]);

            return (
              <section key={group.key} className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-lg font-black text-ink-950">{group.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-ink-400">
                      {group.count} {group.count === 1 ? "registro" : "registros"} · {currency(group.totalAmount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDaySection(group.key)}
                    className="rounded-xl p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                    aria-label={isCollapsed ? "Mostrar egresos del día" : "Ocultar egresos del día"}
                  >
                    {isCollapsed ? <FiChevronDown className="size-5" /> : <FiChevronUp className="size-5" />}
                  </button>
                </div>

                {isCollapsed ? null : (
                  <div className="grid gap-3 border-t border-ink-100 p-4 sm:gap-4 sm:p-6 lg:grid-cols-2">
                    {group.items.map((expense) => (
                      <ExpenseCard key={expense.id} expense={expense} onDelete={() => setDeleteTarget(expense)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <section className="rounded-[24px] border border-ink-100 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-300">
              <FiCalendar className="size-5" />
            </div>
            <h2 className="mt-4 text-base font-black text-ink-950">Sin egresos ese mes</h2>
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
            <Field label="Descripción" error={errors.concepto?.message}>
              <input
                className="field-base"
                placeholder="En que se gasto"
                {...register("concepto", { required: "Ingresa la descripción" })}
              />
            </Field>

            <Field label="Monto" error={errors.monto?.message}>
              <Controller
                control={control}
                name="monto"
                rules={{
                  required: "Ingresa el monto",
                  validate: (value) => parseMoney(value) > 0 || "Ingresa el monto"
                }}
                render={({ field }) => (
                  <MoneyInput
                    name={field.name}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
            </Field>

            <Field label="Fecha" error={errors.fecha?.message}>
              <input type="date" className="field-base" {...register("fecha", { required: "Selecciona la fecha" })} />
            </Field>
          </div>

          <Field label="Tipo de egreso" error={errors.categoria?.message}>
            <div className="grid grid-cols-3 gap-2">
              {EXPENSE_CATEGORIES.map((category) => {
                const active = selectedCategory === category.id;
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setValue("categoria", category.id, { shouldValidate: true })}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 transition",
                      active
                        ? cn("border-transparent shadow-sm", category.tone)
                        : "border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="text-center text-[10px] font-bold leading-tight">{category.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="flex gap-3">
            <Button className="min-h-11 flex-1 rounded-xl" type="button" variant="secondary" onClick={closeCreateModal}>
              Cancelar
            </Button>
            <Button className="min-h-11 flex-1 rounded-xl" type="submit" loading={isSubmitting}>
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
  const category = findExpenseCategory(expense.categoria);
  const CategoryIcon = category?.icon;

  return (
    <article className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold",
              category?.tone ?? "bg-ink-50 text-ink-500"
            )}
          >
            {CategoryIcon ? <CategoryIcon className="size-3" /> : null}
            {expenseCategoryLabel(expense.categoria)}
          </span>
          <h3 className="mt-2 text-[15px] font-semibold text-ink-950">{expense.concepto}</h3>
          {expense.descripcion ? <p className="mt-2 text-sm text-ink-500">{expense.descripcion}</p> : null}
        </div>
        <Button className="min-h-9 shrink-0 rounded-xl px-3 text-xs" type="button" variant="danger" onClick={onDelete}>
          Eliminar
        </Button>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4 border-t border-ink-100 pt-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">Fecha</p>
          <p className="mt-2 text-sm font-semibold text-ink-900">{formatDate(expense.fecha)}</p>
        </div>
        <p className="shrink-0 text-2xl font-black leading-none text-rose-700">{currency(expense.monto)}</p>
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

function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
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
    monto: "",
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

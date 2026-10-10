import { FiAlertCircle, FiAlertTriangle, FiCalendar, FiCreditCard, FiFileText, FiRotateCcw, FiUserCheck } from "react-icons/fi";
import { ReceiptReviewList } from "@/components/dashboard/receipt-review-list";
import type { ReceiptView } from "@/lib/receipts";
import { ReminderList } from "@/components/dashboard/reminder-list";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import type { ReminderItem } from "@/lib/studio-reminders";
import { auth } from "@/lib/web-auth";

type Reminders = {
  manana: ReminderItem[];
  porVencer: ReminderItem[];
  saldos: ReminderItem[];
  listaEspera: ReminderItem[];
  vencidos: ReminderItem[];
  saldosVencidos: ReminderItem[];
};

/** Avisos por WhatsApp para los clientes del estudio (spec 011 R4). */
export default async function RemindersPage() {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Avisos" />;

  const [reminders, receipts] = await Promise.all([
    apiFetch<Reminders>("/api/studio-reminders"),
    apiFetch<ReceiptView[]>("/api/payment-receipts?estado=POR_REVISAR")
  ]);
  const sections = [
    { title: "Clases de mañana", description: "Recuérdales su cupo", icon: <FiCalendar />, items: reminders.manana, empty: "Nadie tiene clase mañana" },
    { title: "Paquetes por vencer", description: "Vencen en 3 días o les quedan pocas clases", icon: <FiAlertCircle />, items: reminders.porVencer, empty: "Ningún paquete por vencer" },
    // Spec 020 R8.
    { title: "Planes vencidos sin renovar", description: "Vencieron hace 60 días o menos", icon: <FiRotateCcw />, items: reminders.vencidos, empty: "Nadie con el plan vencido" },
    { title: "Saldos vencidos", description: "Pasó la fecha para pagar", icon: <FiAlertTriangle />, items: reminders.saldosVencidos, empty: "Ningún saldo vencido" },
    { title: "Saldos pendientes", description: "Aún en plazo, con tus métodos de pago", icon: <FiCreditCard />, items: reminders.saldos, empty: "Nadie debe" }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Avisos</h1>
        <p className="mt-1 text-sm text-ink-500">Mensajes listos para enviar por WhatsApp con un toque</p>
      </div>
      {receipts.length ? (
        <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <FiFileText className="size-4 text-amber-500" />
            <div>
              <h2 className="font-semibold text-ink-800">
                Comprobantes por revisar <span className="font-normal text-ink-400">({receipts.length})</span>
              </h2>
              <p className="text-xs text-ink-400">Enviados desde tu página. Al aprobar se registra el pago.</p>
            </div>
          </div>
          <ReceiptReviewList receipts={receipts} />
        </section>
      ) : null}

      {reminders.listaEspera.length ? (
        <section className="rounded-2xl border border-brand-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <FiUserCheck className="size-4 text-brand-500" />
            <div>
              <h2 className="font-semibold text-ink-800">
                Cupos de la lista de espera <span className="font-normal text-ink-400">({reminders.listaEspera.length})</span>
              </h2>
              <p className="text-xs text-ink-400">Se liberó un cupo y ya quedaron reservadas. Avísales.</p>
            </div>
          </div>
          <div className="mt-2">
            <ReminderList items={reminders.listaEspera} empty="" />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-4 shrink-0 text-brand-500 [&>svg]:size-4">{section.icon}</span>
              <div className="min-w-0">
                <h2 className="font-semibold text-ink-800">
                  {section.title} <span className="font-normal text-ink-400">({section.items.length})</span>
                </h2>
                <p className="text-xs text-ink-400">{section.description}</p>
              </div>
            </div>
            <div className="mt-2">
              <ReminderList items={section.items} empty={section.empty} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

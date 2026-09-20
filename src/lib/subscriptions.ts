import { Prisma } from "@prisma/client";
import { startOfLocalDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const defaultPlanPrice = Number(process.env.DUALI_DEFAULT_PLAN_PRICE ?? "50000");
const defaultPlanName = process.env.DUALI_DEFAULT_PLAN_NAME ?? "Plan Duali";
const defaultPlanDescription =
  process.env.DUALI_DEFAULT_PLAN_DESCRIPTION ??
  "Acceso completo al panel web, gestión de estudiantes, grupos, cobros, egresos, contabilidad y recordatorios.";

const defaultPlanFeatures = [
  "Estudiantes y grupos ilimitados",
  "Mensualidades generadas automáticamente",
  "Control de pendientes y vencidos",
  "Abonos parciales y saldos por cobrar",
  "Cobros de inscripción y útiles",
  "Recordatorios de pago por WhatsApp",
  "Egresos y contabilidad mensual",
  "Historial de pagos por estudiante"
];

export const planPeriodDays = 30;
let defaultPlanPromise: ReturnType<typeof loadDefaultPlan> | null = null;

export function addPlanPeriod(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + planPeriodDays);
  return next;
}

export function daysUntil(date: Date, from = new Date()) {
  const fromStart = startOfLocalDay(from).getTime();
  const toStart = startOfLocalDay(date).getTime();
  return Math.ceil((toStart - fromStart) / 86_400_000);
}

export function resolveSubscriptionStatus(nextBillingAt: Date, storedStatus: string) {
  if (["CANCELADA", "SUSPENDIDA"].includes(storedStatus)) return storedStatus;
  return nextBillingAt < startOfLocalDay() ? "VENCIDA" : "ACTIVA";
}

export function ensureDefaultPlan() {
  if (!defaultPlanPromise) {
    defaultPlanPromise = loadDefaultPlan().catch((error) => {
      defaultPlanPromise = null;
      throw error;
    });
  }

  return defaultPlanPromise;
}

async function loadDefaultPlan() {
  const existing = await prisma.plan.findUnique({ where: { slug: "duali-base" } });
  const price = new Prisma.Decimal(defaultPlanPrice);
  const featuresChanged = JSON.stringify(existing?.features ?? null) !== JSON.stringify(defaultPlanFeatures);

  if (
    existing &&
    existing.name === defaultPlanName &&
    existing.description === defaultPlanDescription &&
    existing.price.equals(price) &&
    existing.isActive &&
    !featuresChanged
  ) {
    return existing;
  }

  return prisma.plan.upsert({
    where: { slug: "duali-base" },
    update: {
      name: defaultPlanName,
      description: defaultPlanDescription,
      price,
      features: defaultPlanFeatures,
      isActive: true
    },
    create: {
      name: defaultPlanName,
      slug: "duali-base",
      description: defaultPlanDescription,
      price,
      features: defaultPlanFeatures,
      isActive: true
    }
  });
}

export async function ensureClientSubscription(clientId: string) {
  const plan = await ensureDefaultPlan();
  const existing = await prisma.clientSubscription.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      plan: true,
      payments: { orderBy: [{ periodEnd: "desc" }, { paidAt: "desc" }] }
    }
  });

  if (existing) {
    const currentPeriodStart = existing.payments[0]?.periodStart ?? existing.startedAt;
    const normalizedNextBillingAt = addPlanPeriod(currentPeriodStart);
    const status = resolveSubscriptionStatus(normalizedNextBillingAt, existing.status);
    const priceChanged = !new Prisma.Decimal(existing.price).equals(plan.price);
    const periodChanged = existing.nextBillingAt.getTime() !== normalizedNextBillingAt.getTime();

    if (status !== existing.status || priceChanged || existing.planId !== plan.id || periodChanged) {
      return prisma.clientSubscription.update({
        where: { id: existing.id },
        data: {
          status: status as never,
          planId: plan.id,
          price: plan.price,
          endsAt: normalizedNextBillingAt,
          nextBillingAt: normalizedNextBillingAt
        },
        include: {
          plan: true,
          payments: { orderBy: [{ periodEnd: "desc" }, { paidAt: "desc" }] }
        }
      });
    }

    return existing;
  }

  const now = new Date();
  const nextBillingAt = addPlanPeriod(now);

  return prisma.clientSubscription.create({
    data: {
      clientId,
      planId: plan.id,
      status: "ACTIVA",
      price: plan.price,
      startedAt: now,
      endsAt: nextBillingAt,
      nextBillingAt
    },
    include: {
      plan: true,
      payments: { orderBy: [{ periodEnd: "desc" }, { paidAt: "desc" }] }
    }
  });
}

export async function markSubscriptionPaid({
  subscriptionId,
  paymentMethod,
  notes,
  paidAt = new Date()
}: {
  subscriptionId: string;
  paymentMethod?: string | null;
  notes?: string | null;
  paidAt?: Date;
}) {
  const subscription = await prisma.clientSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true }
  });

  if (!subscription) {
    return null;
  }

  const periodStart = subscription.nextBillingAt > paidAt ? subscription.nextBillingAt : paidAt;
  const periodEnd = addPlanPeriod(periodStart);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        clientId: subscription.clientId,
        amount: subscription.price,
        periodStart,
        periodEnd,
        paidAt,
        paymentMethod,
        notes
      }
    });

    const updatedSubscription = await tx.clientSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVA",
        endsAt: periodEnd,
        nextBillingAt: periodEnd
      },
      include: {
        plan: true,
        payments: { orderBy: [{ periodEnd: "desc" }, { paidAt: "desc" }] }
      }
    });

    return { payment, subscription: updatedSubscription };
  });
}

export function serializeSubscription(subscription: Awaited<ReturnType<typeof ensureClientSubscription>>) {
  const status = resolveSubscriptionStatus(subscription.nextBillingAt, subscription.status);

  return {
    id: subscription.id,
    status,
    price: Number(subscription.price),
    startedAt: subscription.startedAt.toISOString(),
    endsAt: subscription.endsAt.toISOString(),
    nextBillingAt: subscription.nextBillingAt.toISOString(),
    daysUntilNextBilling: daysUntil(subscription.nextBillingAt),
    notes: subscription.notes,
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      slug: subscription.plan.slug,
      description: subscription.plan.description,
      price: Number(subscription.plan.price),
      features: Array.isArray(subscription.plan.features) ? subscription.plan.features : []
    },
    payments: subscription.payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      periodStart: payment.periodStart.toISOString(),
      periodEnd: payment.periodEnd.toISOString(),
      paidAt: payment.paidAt.toISOString(),
      paymentMethod: payment.paymentMethod,
      notes: payment.notes
    }))
  };
}

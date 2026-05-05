export type StudentStatus = "ACTIVO" | "INACTIVO";
export type PaymentStatus = "PENDIENTE" | "PAGADO" | "VENCIDO";
export type MonthlyBillingMode = "ANTICIPADA" | "VENCIDA";

export type SafeClient = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  businessName: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupSummary = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioMensualidadDefault: number | string;
  createdAt: string;
  students: Array<{
    id: string;
    estado: StudentStatus;
    precioMensualidad: number | string | null;
  }>;
  _count: {
    students: number;
    monthlyPayments: number;
    suppliesPayments: number;
  };
};

export type GroupDetailStudent = {
  id: string;
  nombre: string;
  apellido: string;
  edad: number;
  celular: string | null;
  esMenorDeEdad: boolean;
  telefonoPadre: string | null;
  estado: StudentStatus;
  precioMensualidad: number | string | null;
  diaCobro: number | null;
  modalidadMensualidad: MonthlyBillingMode;
  createdAt: string;
  monthlyPayments: Array<{
    id: string;
    mes: number;
    anio: number;
    monto: number | string;
    estado: PaymentStatus;
    fechaVencimiento: string;
    fechaPago: string | null;
  }>;
};

export type GroupDetailResponse = {
  id: string;
  nombre: string;
  descripcion: string | null;
  clientId: string;
  createdAt: string;
  _count: {
    students: number;
    monthlyPayments: number;
  };
  period: {
    mes: number;
    anio: number;
    label: string;
  };
  summary: {
    totalStudents: number;
    activeStudents: number;
    studentsWithMonthlyFee: number;
    estimatedIncome: number;
    pendingCount: number;
    overdueCount: number;
  };
  students: GroupDetailStudent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    q: string;
    status: "todos" | "pendientes" | "pagados" | "vencidos";
  };
};

export type StudentListItem = {
  id: string;
  nombre: string;
  apellido: string;
  edad: number;
  celular: string | null;
  esMenorDeEdad: boolean;
  nombrePadre: string | null;
  telefonoPadre: string | null;
  parentesco: string | null;
  grupoId: string;
  clientId: string;
  estado: StudentStatus;
  precioMensualidad: number | string | null;
  diaCobro: number | null;
  modalidadMensualidad: MonthlyBillingMode;
  createdAt: string;
  group: {
    id: string;
    nombre: string;
  };
  enrollmentPayment?: EnrollmentPaymentItem | null;
  monthlyPayments?: MonthlyPaymentItem[];
};

export type StudentListFilter = "todos" | "activos" | "aldia" | "pendientes" | "inactivos";

export type StudentListResponse = {
  items: StudentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    q: string;
    status: StudentListFilter;
    groupId?: string;
  };
};

export type MonthlyPaymentItem = {
  id: string;
  estudianteId: string;
  grupoId: string;
  clientId: string;
  mes: number;
  anio: number;
  monto: number | string;
  fechaVencimiento: string;
  fechaPago: string | null;
  estado: PaymentStatus;
  metodoPago: string | null;
  comprobanteUrl: string | null;
  notas: string | null;
  createdAt: string;
  student: {
    id: string;
    nombre: string;
    apellido: string;
    celular: string | null;
    telefonoPadre: string | null;
  };
  group: {
    id: string;
    nombre: string;
  };
};

export type EnrollmentPaymentItem = {
  id: string;
  estudianteId: string;
  clientId: string;
  monto: number | string;
  estado: PaymentStatus;
  fechaVencimiento: string;
  fechaPago: string | null;
  metodoPago: string | null;
  notas: string | null;
  createdAt: string;
  student: {
    id: string;
    nombre: string;
    apellido: string;
    esMenorDeEdad?: boolean;
    telefonoPadre: string | null;
    celular: string | null;
    group?: {
      id: string;
      nombre: string;
    } | null;
  };
};

export type SuppliesPaymentItem = {
  id: string;
  nombreConcepto: string;
  descripcion: string | null;
  monto: number | string;
  grupoId: string | null;
  estudianteId: string | null;
  clientId: string;
  estado: "PENDIENTE" | "PAGADO";
  fechaVencimiento: string;
  fechaPago: string | null;
  createdAt: string;
  group?: {
    id: string;
    nombre: string;
  } | null;
  student?: {
    id: string;
    nombre: string;
    apellido: string;
  } | null;
};

export type ExpenseItem = {
  id: string;
  clientId: string;
  concepto: string;
  descripcion: string | null;
  monto: number | string;
  fecha: string;
  categoria: string | null;
  createdAt: string;
};

export type NotificationItem = {
  id: string;
  sequence: number;
  type?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  error: string | null;
  createdAt: string;
};

export type PaymentHistoryFilter = "week" | "month";

export type PaymentHistoryItem = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  label: "Mensualidad" | "Inscripcion";
  monto: number;
  fechaPago: string;
  mes?: number | null;
  anio?: number | null;
  student: {
    id: string;
    nombre: string;
    apellido: string;
  };
  group?: {
    id: string;
    nombre: string;
  } | null;
};

export type PaymentHistoryResponse = {
  filters: {
    period: PaymentHistoryFilter;
    month: string;
  };
  summary: {
    totalCount: number;
    totalAmount: number;
    from: string;
    to: string;
  };
  items: PaymentHistoryItem[];
};

export type AccountingSummary = {
  ingresosMensualidades: number;
  ingresosUtiles: number;
  ingresosInscripciones: number;
  ingresosTotales: number;
  gastosTotales: number;
  balance: number;
  pendientesPorCobrar: number;
  pagosRecibidosEsteMes: number;
  estudiantesActivos: number;
  mensualidadesPendientes: number;
  mensualidadesVencidas: number;
  inscripcionesPendientes: number;
  inscripcionesVencidas: number;
};

export type AccountingPeriod = {
  year: number;
  month: number;
  monthLabel: string;
  from: string;
  to: string;
};

export type AccountingPaymentMethod = {
  method: string;
  amount: number;
  count: number;
  percentage: number;
};

export type AccountingMovement = {
  id: string;
  date: string;
  type: "MENSUALIDAD" | "INSCRIPCION" | "EGRESO";
  title: string;
  subtitle: string;
  amount: number;
  direction: "income" | "expense";
};

export type AccountingOverview = {
  period: AccountingPeriod;
  summary: {
    ingresos: number;
    egresos: number;
    balance: number;
    movimientos: number;
  };
  paymentMethods: AccountingPaymentMethod[];
  movements: AccountingMovement[];
};

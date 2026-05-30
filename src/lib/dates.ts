export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function startOfNextLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export function startOfCurrentMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfCurrentMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function localDateAtNoon(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function currentMonthlyPeriod(date = new Date()) {
  return {
    mes: date.getMonth() + 1,
    anio: date.getFullYear()
  };
}

export function nextMonthlyPeriod(mes: number, anio: number) {
  return mes === 12 ? { mes: 1, anio: anio + 1 } : { mes: mes + 1, anio };
}

export function previousMonthlyPeriod(mes: number, anio: number) {
  return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}

export function monthlyDueDateForPeriod(
  mes: number,
  anio: number,
  diaCobro: number,
  modalidadMensualidad: "ANTICIPADA" | "VENCIDA"
) {
  if (modalidadMensualidad === "ANTICIPADA") {
    return localDateAtNoon(anio, mes, diaCobro);
  }

  const nextPeriod = nextMonthlyPeriod(mes, anio);
  return addDays(localDateAtNoon(nextPeriod.anio, nextPeriod.mes, diaCobro), -1);
}

export function paymentStatusForDueDate(fechaVencimiento: Date) {
  return fechaVencimiento < startOfLocalDay() ? "VENCIDO" : "PENDIENTE";
}

export function nextValidMonthlyDueDate(
  fromDate: Date,
  diaCobro: number,
  modalidadMensualidad: "ANTICIPADA" | "VENCIDA"
) {
  let mes = fromDate.getMonth() + 1;
  let anio = fromDate.getFullYear();
  const todayStart = startOfLocalDay(fromDate);

  for (let attempts = 0; attempts < 24; attempts += 1) {
    const dueDate = monthlyDueDateForPeriod(mes, anio, diaCobro, modalidadMensualidad);
    if (dueDate >= todayStart) return { mes, anio, dueDate };
    const nextPeriod = nextMonthlyPeriod(mes, anio);
    mes = nextPeriod.mes;
    anio = nextPeriod.anio;
  }

  const dueDate = monthlyDueDateForPeriod(mes, anio, diaCobro, modalidadMensualidad);
  return { mes, anio, dueDate };
}

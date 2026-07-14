import "../src/lib/prisma-debug";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const client = await prisma.client.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      nombre: "Admin Demo",
      email: "admin@demo.com",
      passwordHash,
      telefono: "3001234567",
      businessName: "Academia Demo"
    }
  });

  const group = await prisma.group.create({
    data: {
      nombre: "Grupo A",
      descripcion: "Grupo inicial para pruebas",
      precioMensualidadDefault: 85000,
      clientId: client.id
    }
  });

  const students = await prisma.student.createManyAndReturn({
    data: [
      {
        nombre: "Laura",
        apellido: "Gómez",
        edad: 12,
        celular: "3011111111",
        esMenorDeEdad: true,
        nombrePadre: "Marta Gómez",
        telefonoPadre: "3022222222",
        parentesco: "Madre",
        grupoId: group.id,
        clientId: client.id
      },
      {
        nombre: "Carlos",
        apellido: "Rojas",
        edad: 19,
        celular: "3033333333",
        esMenorDeEdad: false,
        grupoId: group.id,
        clientId: client.id
      }
    ]
  });

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  for (const student of students) {
    await prisma.monthlyPayment.upsert({
      where: { estudianteId_mes_anio: { estudianteId: student.id, mes: currentMonth, anio: currentYear } },
      update: {},
      create: {
        estudianteId: student.id,
        grupoId: group.id,
        clientId: client.id,
        mes: currentMonth,
        anio: currentYear,
        monto: student.precioMensualidad ?? 85000,
        fechaVencimiento: new Date(currentYear, currentMonth - 1, 10),
        estado: "PENDIENTE"
      }
    });
  }

  await prisma.expense.create({
    data: {
      clientId: client.id,
      concepto: "Material de oficina",
      descripcion: "Marcadores y hojas",
      monto: 45000,
      fecha: now,
      categoria: "Operación"
    }
  });

}

main()
  .catch(() => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# Specs

Duali se desarrolla con **spec-driven development**: cada cambio empieza como una
spec en esta carpeta, se aprueba, y solo entonces se implementa.

## Regla de diseño

**CliqCut (`D:\MVPs\CliqCut-Web`) es la referencia visual.** Cuando una pantalla
de Duali tenga equivalente en CliqCut, se copia su estructura (cabecera, tarjetas,
botones, textos de ayuda) adaptando colores (`brand`/`ink`) y contenido de Duali.

## Flujo

1. Crear `specs/NNN-nombre/spec.md` con: contexto, referencia en CliqCut,
   requisitos (R1, R2…), criterios de aceptación y fuera de alcance.
2. Revisar la spec con el equipo; el estado pasa a `Aprobada`.
3. Implementar. Cada requisito debe poder señalarse en el código.
4. Escribir pruebas unitarias (funciones puras) y funcionales (API real contra
   una base temporal) para cada requisito; de punta a punta para las pantallas.
5. Verificar los criterios de aceptación y marcar la spec como `Implementada`.

## Pruebas

| Comando | Qué corre | Tiempo |
| ------- | --------- | ------ |
| `npm run test:unit` | Funciones puras (`src/**/*.test.ts`) | ~2 s |
| `npm run test:functional` | Route handlers reales contra un PostgreSQL temporal con todas las migraciones aplicadas desde cero (`tests/functional`) | ~30 s |
| `npm run test:e2e` | La app real (`next dev`) contra esa base, por HTTP: proxy, páginas y login (`tests/e2e`) | ~2 min |
| `npm test` / `npm run test:all` | unit + functional / todo | |

La base temporal la levanta `embedded-postgres` en un puerto libre y se borra al
terminar. **Nunca usa la base del `.env`**: las migraciones corren sobre una copia
del esquema con la URL local escrita a mano, y las pruebas se niegan a correr si
`DATABASE_URL` no es esa base local.

## Reglas de producción

- Cambios de base de datos **solo aditivos**: tablas nuevas y columnas con
  `DEFAULT` o nullable. Nada de renombrar, borrar ni reescribir datos.
- Las migraciones se generan sin conexión (`prisma migrate diff`) y se aplican
  con `npm run db:deploy` **antes** de desplegar el código que las usa.

## Índice

| #   | Spec                                         | Estado       |
| --- | -------------------------------------------- | ------------ |
| 001 | [Sidebar CUENTA y página Ajustes](001-ajustes/spec.md) | Implementada y probada |
| —   | [Modo Estudio: propuesta general (002–011)](estudio/propuesta.md) | Completa |
| 002 | [Módulos del negocio y sidebar](002-modulos-sidebar/spec.md) | Implementada y probada |
| 003 | [Disciplinas y combos](003-disciplinas/spec.md) | Implementada y probada |
| 004 | [Paquetes y precios](004-paquetes/spec.md) | Implementada y probada |
| 005 | [Horario de clases y cupos](005-horario-cupos/spec.md) | Implementada y probada |
| 006 | [Clientes del estudio y venta de paquetes](006-venta-paquetes/spec.md) | Implementada y probada |
| 007 | [Reservas, asistencia y clase suelta](007-reservas-asistencia/spec.md) | Implementada y probada |
| 008 | [Página pública del estudio](008-pagina-publica/spec.md) | Implementada y probada |
| 009 | [Reserva pública de cupos](009-reserva-publica/spec.md) | Implementada y probada |
| 010 | [Contenido: fotos, videos y portadas](010-contenido/spec.md) | Implementada y probada |
| 011 | [Notificaciones del estudio](011-notificaciones/spec.md) | Implementada y probada |
| 012 | [Experiencia de la página pública (rediseño)](012-rediseno-pagina-publica/spec.md) | Implementada y probada |
| 013 | [Inicio del panel para el estudio](013-inicio-estudio/spec.md) | Implementada y probada |
| 014 | [Comprobante de pago en la reserva web](014-comprobantes/spec.md) | Implementada y probada |
| 015 | [Lista de espera](015-lista-espera/spec.md) | Implementada y probada |
| 016 | [Logo nuevo y estudio demo](016-logo-y-demo/spec.md) | Implementada y probada |
| 017 | [Navegación de la página pública y filas desplazables](017-navegacion-publica/spec.md) | Implementada y probada |
| 018 | [Pantalla de error que no se rompe en el navegador](018-errores-navegador/spec.md) | Implementada y probada |
| 019 | [Clientes, clases sueltas y asistencia](019-clientes-asistencia/spec.md) | Implementada y probada |
| 020 | [Renovaciones, pagos y vencimientos](020-renovaciones-pagos/spec.md) | Propuesta |
| 021 | [Comprar un plan en línea y reservar con él](021-compra-plan-en-linea/spec.md) | Implementada |

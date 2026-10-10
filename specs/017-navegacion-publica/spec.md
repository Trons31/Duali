# 017 · Navegación de la página pública y filas desplazables

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

La portada del estudio tenía una segunda barra de secciones bajo la portada
(Horario, Clases, Planes, Novedades, Cómo pagar), que ocupaba espacio y se
duplicaba con la barra superior. En el celular las filas con scroll horizontal
(días, disciplinas, clases) no dejaban ver que había más contenido a la derecha.

## Referencias

- **Floristería** (`D:\MVPs\Floristeria\floristeria2`, `Header.tsx`): menú
  colapsable del celular.
- **CliqCut** (`D:\MVPs\CliqCut-Web`, `components/ui/ScrollableTabs.tsx`):
  flechas de ayuda en las filas desplazables.

## Requisitos

- **R1 — Menú en la barra superior.** En computador, **Horario · Clases · Planes**
  van centrados en la barra superior, entre el nombre del estudio y los botones.
  "Novedades" y "Cómo pagar" salen del menú (las secciones siguen en la página).
  La barra es opaca y las secciones dejan espacio para no quedar tapadas al saltar.
- **R2 — Menú colapsable en el celular.** Un botón ☰ abre un panel bajo la barra
  con las secciones y "Reservar clase"; el resto de la página se oscurece
  (también la barra inferior) y no se desplaza. Se cierra al elegir una sección,
  al tocar fuera, con ✕ o con Escape.
- **R3 — Flechas en las filas desplazables.** Componente `ScrollHint`: degradado
  con flecha en el borde solo mientras haya contenido hacia ese lado; tocarla
  avanza la fila; la barra de scroll del navegador se oculta. Se usa en todas
  las filas con scroll horizontal: días y disciplinas de la portada, tarjetas de
  Clases, días del asistente de reserva y días de Gastos en el panel.

## Criterios de aceptación

- [x] En computador el menú se ve centrado en la barra; en el celular, solo el ☰.
- [x] Elegir "Planes" en el menú del celular cierra el menú y baja a la sección.
- [x] Con el menú abierto, el fondo y la barra inferior quedan oscurecidos.
- [x] Al cargar una fila desplazable solo aparece la flecha derecha; al llegar al
      final aparece la izquierda y desaparece la derecha.
- [x] En computador, donde todo cabe, no aparecen flechas.

## Pruebas

E2E: la portada trae el menú centrado, el botón del menú del celular y no lista
"Cómo pagar" en la barra. Revisión en navegador (Chrome sin ventana, 390 px):
menú abierto y cerrado, salto a Planes y flecha que avanza la fila.

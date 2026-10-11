# 026 · Invitación propia para activar las notificaciones

**Estado:** Implementada y probada · **Fecha:** 2026-10-11

## Contexto

Al entrar al panel, `NotificationBootstrap` llamaba `Notification.requestPermission()`
de inmediato: aparecía el diálogo del navegador ("duali-backend.vercel.app wants to
show notifications") sin ninguna explicación. Es una sola línea sin contexto y, si
el estudio lo bloquea, la página ya no puede volver a pedirlo.

## Referencia

`CliqCut-Shop/components/notifications/NotificationsPrompt.tsx` (y
`NotificationsPermissionPrompt` en CliqCut-App): un modal propio que explica para
qué sirven y solo al tocar **Activar** abre el diálogo del navegador. Se copia la
estructura (ilustración teléfono + campana, título, tres beneficios, acciones al
pie "Ahora no" / "Activar") con los colores `brand`/`ink` y textos de Duali.

## Requisitos

- **R1 — El navegador no pregunta solo.** Se quita la petición automática del
  permiso; el diálogo del sistema solo se abre desde el botón **Activar**.
- **R2 — Cuándo aparece** (`src/lib/notification-prompt.ts`). Se ofrece cuando
  el permiso está en `default`, el navegador soporta notificaciones y no se ha
  preguntado antes en ese navegador (`localStorage`, clave
  `duali:notifications-prompt-seen-v1`). Aparece 2,5 s después de cargar el panel.
  Con permiso concedido, bloqueado o sin soporte, no aparece.
- **R3 — iPhone/iPad sin instalar.** Safari solo entrega push a la web instalada
  en la pantalla de inicio: en vez de "Activar" se explica cómo agregar Duali a
  la pantalla de inicio (botón "Entendido").
- **R4 — Una sola vez.** "Ahora no", la X, Escape, tocar fuera o "Activar"
  marcan que ya se preguntó.
- **R5 — Al conceder, se registra el dispositivo.** Tras "Activar" con permiso
  concedido se registra la suscripción Web Push como antes.
- **R6 — Se puede activar después.** En *Notificaciones* hay un botón
  "Activar en este dispositivo" mientras el permiso no esté concedido; abre el
  mismo modal (si está bloqueado, explica cómo permitirlas desde el navegador).

## Criterios de aceptación

- Entrar al panel con permiso `default` muestra el modal de Duali, no el del navegador.
- "Ahora no" lo cierra y no vuelve a salir al recargar.
- "Activar" abre el diálogo del navegador; al permitir, el dispositivo queda registrado.
- Pruebas unitarias de R2/R3 en `src/lib/notification-prompt.test.ts`.

## Fuera de alcance

- Cambiar qué notificaciones se envían o su contenido.

# Nola Labs · Tablero Financiero · v2

Tablero financiero corporativo y personal de Nola Labs, con el look and feel oficial de la marca (Crema · Verde Hondo · Jade · Sage · Rust). Une tus **dos cuentas** —la caja de la empresa y tu bolsillo personal— en una sola lectura, y desde la v2 (sep 2026) también es el archivo financiero de la empresa: libro de movimientos, cuentas de cobro del equipo, planillas de seguridad social, documentos de la declaración de renta y alarmas parametrizables.

En vivo: https://nolalabs.github.io/Dash_financiero/ — se entra con tu cuenta (correo y contraseña, o Google) y, si la activaste, el código de tu app de autenticación.

---

## Qué hay de nuevo en la v2

**Interfaz**
- **Navegación flotante:** un dock en la parte inferior con las vistas principales, un menú "Más" para las secundarias y una campana con el número de alertas activas. En el celular el dock se compacta a cinco accesos.
- **Hero tipográfico:** cada vista abre con su título en tipografía grande y una cifra protagonista (la caja de la empresa, el resultado real del mes, la nómina del equipo, los aportes del año…).
- **Cards interactivas:** se elevan al pasar el cursor, se expanden al hacer clic (movimientos, meses de cada persona, planillas) y llevan la acción al lugar donde se resuelve.
- **Motion cues:** aparición escalonada al navegar, cifras que cuentan hasta su valor, gráficas que se dibujan, indicador del dock que se desliza. Respeta `prefers-reduced-motion`.

**Módulos**
- **Movimientos** — el libro real de ingresos y egresos de las dos cuentas: fecha, contraparte, concepto, bruto, retención, neto, estado (pendiente / hecho) y comprobante adjunto. Gráfica de ingresos vs. egresos de los últimos 12 meses, rentabilidad real del año, cuentas por cobrar, exportación a CSV. Los pagos que marcás en **Pagos del mes** y las planillas de **Seguridad social** entran solos.
- **Equipo** — cada persona con sus cuentas de cobro mes a mes: monto, cuenta de cobro adjunta, planilla de seguridad social del contratista, comprobante de pago, estado (pendiente → recibida → pagada). Marcar pagada registra el pago en Pagos del mes y en el libro. Las personas que salen quedan inactivas con su historial.
- **Seguridad social** — tus planillas PILA por mes (salud, pensión, ARL, caja), fecha y cuenta desde la que se pagó, planilla y comprobante adjuntos. Total del año listo para el certificado de aportes.
- **Renta** — un espacio por año gravable: la lista de documentos que pide la declaración en Colombia con estado y archivo adjunto; la fecha límite con cuenta regresiva y alarma; el formulario 210 presentado con sus casillas clave; y lo que el tablero ya te resuelve solo desde el libro.
- **Alertas** — reglas parametrizables: fecha límite, umbral de una métrica, PILA del mes, cuentas de cobro del equipo, pagos pendientes, cobros demorados, documentos y vencimiento de la renta. Cada alerta se puede silenciar; avisos del navegador opcionales para las críticas.

**Documentos adjuntos.** En modo nube los archivos suben a un bucket privado de Supabase Storage (`documentos`, carpeta por usuario, políticas RLS, solo PDF / PNG / JPG / WebP / Word / Excel / CSV, máximo 10 MB, con el tipo verificado por la cabecera del archivo) y se abren con enlaces firmados. En modo local se guardan en el navegador (IndexedDB) de ese dispositivo.

---

## Seguridad (endurecido el 14 sep 2026)

- **Sin contraseñas en el código ni en este README.** La cuenta se crea en Supabase (Authentication → Users); el registro desde la app está cerrado y además bloqueado en la base con un trigger sobre `auth.users`.
- **Verificación en dos pasos (TOTP):** se activa desde **Nube · Ajustes → Seguridad de tu cuenta**. Con dos pasos activados, las políticas RLS de la base (`public.mfa_ok()`) no entregan datos ni archivos a una sesión que no haya pasado el código.
- **Cambio de contraseña** desde la app (mínimo 12 caracteres). Activá también en Supabase la protección contra contraseñas filtradas (Auth → Attack protection) y un mínimo de 12 caracteres.
- **Login con Google** (OAuth con flujo PKCE). Requiere habilitar el proveedor en Supabase y registrar la URL del tablero en Redirect URLs.
- **Content Security Policy** en `index.html`: scripts solo propios (supabase-js vendorizado en `vendor/`, versión fija), conexiones solo al proyecto Supabase del tablero.
- **Publishable key** de Supabase (rotable) en lugar de la anon key legacy. Es pública por diseño: la seguridad la dan el login, RLS y MFA.
- **Base:** `updated_at` lo fija el servidor (trigger), el JSON de cada tablero tiene tope de 2 MB, el bucket restringe tipos y tamaño.
- **Mensajes de error genéricos** en pantalla; el detalle va a la consola.
- **CAPTCHA opcional** (Cloudflare Turnstile) en el formulario de entrada: poné el site key en `CAPTCHA_SITE_KEY` en `app.js` y activá el proveedor en Supabase → Auth → Attack protection.
- **Modo local:** la clave local se crea la primera vez que abrís el archivo y se guarda como hash SHA-256 en ese navegador. Es un candado contra miradas casuales, no seguridad real: los datos importantes van en la nube.

---

## Vistas

- **Resumen** — saldo de las dos cuentas, resultado real del mes, por cobrar, alertas activas, salud financiera, caja proyectada a 12 meses.
- **Empresa** — P&L recurrente, estructura de costos, punto de equilibrio, facturación real vs. meta, ingresos únicos.
- **Personal** — presupuesto, % del ingreso por gasto, runway, salario que cubre tu vida.
- **Pagos del mes** — checklist mensual (nómina, licencias, tu salario, gastos personales). Marcar descuenta del saldo; desmarcar devuelve.
- **Movimientos · Equipo · Seguridad social · Renta · Alertas** — módulos v2 (arriba).
- **Salud financiera** — scoring 0–100 empresa y personal, 5 dimensiones cada uno.
- **Proyecciones** — palancas: crecer clientes, prender la Fase 2 del proyecto, subir tu salario, contratar/soltar gente.
- **Datos · Editar** — todo editable: equipo, licencias, clientes, gastos, saldos reales, proyecto único (con "ya recibido"), perfil tributario.
- **Nube · Ajustes** — estado de sincronización, seguridad de la cuenta (contraseña, dos pasos), respaldo (export/import), conexión.

El código trae una **plantilla genérica** de arranque; tus datos reales viven en la nube (Supabase) y se cargan al iniciar sesión.

---

## Cómo usarlo

**En vivo (recomendado):** abrí la URL del tablero y entrá con tu cuenta. Todo se sincroniza en vivo entre tus dispositivos.

**Local:** abrí `index.html` con doble clic; la primera vez creás una clave local. Los datos y los archivos viven solo en ese navegador. La nube necesita https (no funciona por `file://`).

## La nube

- **Proyecto Supabase:** `baqevhsyawugvekqbwsm` (us-east-1).
- **Tablas `tableros` y `portafolios`:** una fila JSON por usuario, RLS + realtime, `updated_at` por trigger, tope de tamaño.
- **Bucket `documentos`:** privado, un directorio por usuario (`<uid>/<módulo>/<año>/…`), tipos y tamaño restringidos.
- **Funciones `public.mfa_ok()`, `public.set_updated_at()`, `public.block_signups()`** — ver `supabase-setup.sql`.

Para un proyecto nuevo: correr `supabase-setup.sql` en el SQL Editor, crear el usuario en Authentication → Users con una contraseña larga, pegar URL y publishable key en **Nube · Ajustes** (o en `DEFAULT_CLOUD` de `app.js`) y ajustar `connect-src` en la CSP de `index.html`.

## Respaldo
**Datos · Editar** o **Nube · Ajustes** → Exportar `.json` / Importar. Los archivos adjuntos no van en el `.json`; viven en el bucket (nube) o en el navegador (local).

## Archivos
```
TABLERO FINANCIERO/
├── index.html            · estructura (CSP, dock flotante, vistas)
├── styles.css            · sistema visual Nola v2
├── motion.js             · motion cues
├── app.js                · motor de cálculo, gráficas, nube, login, seguridad de la cuenta
├── modules.js            · documentos, movimientos, equipo, seguridad social, renta, alertas
├── vendor/supabase.js    · supabase-js (versión fija, ver vendor/VERSION)
├── supabase-setup.sql    · base de datos, seguridad, bucket y endurecimiento (correr una vez)
├── assets/               · logotipos oficiales
└── README.md             · esta guía
```

---
*Nola Labs• — FÁCIL EXPERIMENTACIÓN, RÁPIDA EJECUCIÓN.*

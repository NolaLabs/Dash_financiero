# Nola Labs · Tablero Financiero · v2

Tablero financiero corporativo y personal de Nola Labs, con el look and feel oficial de la marca (Crema · Verde Hondo · Jade · Sage · Rust). Une tus **dos cuentas** —la caja de la empresa y tu bolsillo personal— en una sola lectura, y desde la v2 (sep 2026) también es el archivo financiero de la empresa: libro de movimientos, cuentas de cobro del equipo, planillas de seguridad social, documentos de la declaración de renta y alarmas parametrizables.

Clave de acceso local: **`[redactado]`** · En vivo: https://nolalabs.github.io/Dash_financiero/

---

## Qué hay de nuevo en la v2

**Interfaz**
- **Navegación flotante:** un dock en la parte inferior con las vistas principales, un menú "Más" para las secundarias y una campana con el número de alertas activas. En el celular el dock se compacta a cinco accesos.
- **Hero tipográfico:** cada vista abre con su título en tipografía grande y una cifra protagonista (la caja de la empresa, el resultado real del mes, la nómina del equipo, los aportes del año…).
- **Cards interactivas:** se elevan al pasar el cursor, se expanden al hacer clic (movimientos, meses de cada persona, planillas) y llevan la acción al lugar donde se resuelve.
- **Motion cues:** aparición escalonada al navegar, cifras que cuentan hasta su valor, gráficas que se dibujan, indicador del dock que se desliza. Respeta `prefers-reduced-motion`.

**Módulos**
- **Movimientos** — el libro real de ingresos y egresos de las dos cuentas: fecha, contraparte, concepto, bruto, retención, neto, estado (pendiente / hecho) y comprobante adjunto. Gráfica de ingresos vs. egresos de los últimos 12 meses, rentabilidad real del año (lo que entró contra lo que salió), cuentas por cobrar, exportación a CSV. Los pagos que marcás en **Pagos del mes** y las planillas de **Seguridad social** entran solos.
- **Equipo** — cada persona con sus cuentas de cobro mes a mes: monto, cuenta de cobro adjunta, planilla de seguridad social del contratista, comprobante de pago, estado (pendiente → recibida → pagada). Marcar pagada registra el pago en Pagos del mes y en el libro. Las personas que salen quedan inactivas con su historial.
- **Seguridad social** — tus planillas PILA por mes (salud, pensión, ARL, caja), fecha y cuenta desde la que se pagó, planilla y comprobante adjuntos. Total del año listo para el certificado de aportes.
- **Renta** — un espacio por año gravable: la lista de documentos que pide la declaración en Colombia (certificado de ingresos y retenciones, certificados bancarios, de deudas, de aportes, de clientes, exógena, RUT…) con estado y archivo adjunto; la fecha límite con cuenta regresiva y alarma; el formulario 210 presentado con sus casillas clave; y lo que el tablero ya te resuelve solo desde el libro (ingresos por cliente, retenciones, pagos a contratistas, seguridad social, herramientas).
- **Alertas** — reglas parametrizables: fecha límite (única, mensual o anual, con anticipación), umbral de una métrica (caja, cuenta personal, reserva en meses, runway, margen, resultado del mes), PILA del mes sin registrar, cuentas de cobro del equipo sin recibir, pagos pendientes, cobros a clientes con más de N días, documentos de renta pendientes y vencimiento de la renta. Cada alerta se puede silenciar hasta mañana, 7 días o fin de mes. Avisos del navegador opcionales para las críticas.

**Documentos adjuntos.** En modo nube los archivos suben a un bucket privado de Supabase Storage (`documentos`, carpeta por usuario, RLS) y se abren con enlaces firmados. En modo local se guardan en el navegador (IndexedDB) de ese dispositivo.

---

## Vistas

- **Resumen** — saldo de las dos cuentas, resultado real del mes, por cobrar, alertas activas, salud financiera, caja proyectada a 12 meses.
- **Empresa** — P&L recurrente, estructura de costos, punto de equilibrio, facturación real vs. meta, ingresos únicos.
- **Personal** — presupuesto, % del ingreso por gasto, runway, salario que cubre tu vida.
- **Pagos del mes** — checklist mensual (nómina, licencias, tu salario, gastos personales). Marcar descuenta del saldo; desmarcar devuelve.
- **Movimientos · Equipo · Seguridad social · Renta · Alertas** — módulos v2 (arriba).
- **Salud financiera** — scoring 0–100 empresa y personal, 5 dimensiones cada uno.
- **Proyecciones** — palancas: crecer clientes, prender la Fase 2 del proyecto, subir tu salario, contratar/soltar gente.
- **Datos · Editar** — todo editable: equipo (con vínculo, documento y activo/inactivo), licencias, clientes, gastos, saldos reales, proyecto único (con "ya recibido" y neto real), perfil tributario.
- **Nube · Ajustes** — conexión, respaldo (export/import), seguridad.

El código trae una **plantilla genérica** de arranque; tus datos reales viven en la nube (Supabase) y se cargan al iniciar sesión.

---

## Cómo usarlo

**En vivo (recomendado):** abrí https://nolalabs.github.io/Dash_financiero/ y entrá con tu correo y tu contraseña. Todo se sincroniza en vivo entre tus dispositivos.

**Local:** abrí `index.html` con doble clic, clave `[redactado]`. Los datos y los archivos viven solo en ese navegador. La nube necesita https (no funciona por `file://`).

---

## La nube

- **Proyecto Supabase:** `baqevhsyawugvekqbwsm` (us-east-1).
- **Tabla `tableros`:** una fila JSON por usuario, RLS + realtime.
- **Bucket `documentos`:** privado, un directorio por usuario (`<uid>/<módulo>/<año>/…`), políticas RLS en `supabase-setup.sql`.
- La *anon key* embebida en `app.js` es pública por diseño; la seguridad la da el RLS. La `service_role key` nunca está en el código.

Para un proyecto nuevo: correr `supabase-setup.sql` una vez en el SQL Editor y crear el usuario en Authentication.

## Cambiar la clave
- **Local:** `ACCESS_KEY` al inicio de `app.js`.
- **Nube:** contraseña del usuario en Supabase → Authentication → Users.

## Respaldo
**Datos · Editar** o **Nube · Ajustes** → Exportar `.json` / Importar. Los archivos adjuntos no van en el `.json`; viven en el bucket (nube) o en el navegador (local).

## Archivos
```
TABLERO FINANCIERO/
├── index.html            · estructura (dock flotante, vistas)
├── styles.css            · sistema visual Nola v2 (tokens, hero, cards, motion, módulos)
├── motion.js             · motion cues (cifras que cuentan, aparición escalonada, indicador del dock)
├── app.js                · motor de cálculo, gráficas, nube, vistas originales
├── modules.js            · documentos, movimientos, equipo, seguridad social, renta, alertas
├── supabase-setup.sql    · base de datos, seguridad y bucket (correr una vez)
├── assets/               · logotipos oficiales
└── README.md             · esta guía
```

---
*Nola Labs• — FÁCIL EXPERIMENTACIÓN, RÁPIDA EJECUCIÓN.*

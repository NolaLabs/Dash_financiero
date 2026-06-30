# Nola Labs · Tablero Financiero

Tablero financiero corporativo y personal de Mateo Gaviria / Nola Labs, con el look and feel oficial de la marca (Crema · Verde Hondo · Ochre · Sage · Rust). Une tus **dos cuentas** —la caja de la empresa y tu bolsillo personal— en una sola lectura, con punto de equilibrio, proyecciones a 12 meses y un **scoring de salud financiera** que reacciona a cada gasto.

Clave de acceso: **`Nola$2026`**

---

## Qué hace

- **Resumen** — KPIs principales: resultado recurrente, runway personal, salario CEO sostenible vs. salario para cubrir tu vida, fondo de crecimiento del proyecto único. Gráfica firma "empresa vs. bolsillo" a 12 meses.
- **Empresa** — P&L recurrente, estructura de costos, **punto de equilibrio** (con y sin tu salario, en pesos y en número de clientes), facturación 2026 real vs. meta.
- **Personal** — presupuesto, cada gasto con su **% del ingreso** y semáforo de impacto, runway, y cuánto debe subir tu salario para cubrir tu vida.
- **Salud financiera** — scoring 0–100 para empresa y para tu bolsillo, desglosado en 5 dimensiones cada uno. Tabla de impacto por gasto.
- **Proyecciones** — palancas interactivas: crecer clientes, prender el **proyecto Fase 2**, subir tu salario, contratar/soltar gente. Todo recalcula la caja y el runway en vivo.
- **Datos · Editar** — todo editable: nº de empleados y nómina de cada uno, nº de clientes y facturación por cliente, licencias, gastos personales, saldos reales de tus dos cuentas, proyecto único.
- **Nube · Ajustes** — conexión a la nube, respaldo (export/import) y seguridad.

El código trae una **plantilla genérica** de arranque; tus datos reales viven en la nube (Supabase) y se cargan al iniciar sesión.

---

## Cómo usarlo ya mismo (modo local)

1. Abrí `index.html` con doble clic (Chrome o Safari).
2. Clave: `Nola$2026`.
3. Editá lo que quieras en **Datos · Editar** — se guarda solo en este dispositivo (en el navegador).

> En modo local la clave es un candado simple, no seguridad real, y los datos viven solo en este computador. Para editar en vivo desde el celular y el computador con login real, activá la nube (abajo).

---

## La nube ya está configurada ✅

Tu proyecto Supabase, la base de datos con seguridad RLS, la sincronización en vivo y tu usuario de login ya quedaron creados, y la conexión viene **embebida en el tablero**. No tenés que pegar ni configurar nada.

- **Proyecto:** NolaLabs's Project (`baqevhsyawugvekqbwsm`, región us-east-1)
- **Login:** tu correo · contraseña `Nola$2026`
- **Datos:** tabla `tableros` protegida por RLS (cada usuario solo ve su propia fila) + realtime para sync en vivo.

> La *anon key* embebida es pública por diseño; la seguridad la da el RLS. La `service_role key` nunca está en el código.

### Para usar la nube: publicá el tablero en una URL
La sincronización en vivo necesita **https** (no funciona abriendo el archivo con `file://`). Subí esta carpeta a cualquier hosting estático gratis:

- **Netlify Drop** — https://app.netlify.com/drop → arrastrá la carpeta `TABLERO FINANCIERO`. Te da una URL al instante.
- **Vercel** — https://vercel.com → *Add New → Project* → subí la carpeta o conectala a un repo.
- **Cloudflare Pages / GitHub Pages** — también sirven.

Abrí esa URL (en el celular o el computador) y entrá directo con tu correo + `Nola$2026` — la conexión ya viene puesta. Tus cambios se sincronizan en vivo entre todos tus dispositivos.

---

## Cambiar la clave
- **Modo local:** editá `ACCESS_KEY` al inicio de `app.js`.
- **Modo nube:** cambiá la contraseña del usuario en Supabase → Authentication → Users.

## Respaldo
En **Datos · Editar** o **Nube · Ajustes** podés **Exportar** un `.json` con todo, y **Importar** para restaurar o mover entre dispositivos sin nube.

## Archivos
```
TABLERO FINANCIERO/
├── index.html            · estructura
├── styles.css            · sistema visual Nola (paleta, tipografía, componentes)
├── app.js                · motor de cálculo, gráficas, nube
├── supabase-setup.sql    · base de datos + seguridad (correr una vez)
├── assets/               · logotipos oficiales
└── README.md             · esta guía
```

---
*Nola Labs• — EJECUTAR, NO PRESENTAR.*

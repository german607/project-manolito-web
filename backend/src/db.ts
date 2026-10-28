import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PRODUCTOS, BOXES } from './seed.js';

// Las fechas (tipo date) llegan como texto 'YYYY-MM-DD', no como Date con zona horaria
pg.types.setTypeParser(1082, v => v);

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL (en desarrollo: docker compose up -d, ver backend/.env.example)');

export const pool = new pg.Pool({
  connectionString: url,
  // La red interna de Railway no usa SSL; la URL pública sí (DATABASE_SSL=true)
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  // DB_SCHEMA: los tests usan un esquema aparte para no tocar los datos de desarrollo
  options: process.env.DB_SCHEMA ? `-c search_path=${process.env.DB_SCHEMA}` : undefined,
  max: 10,
});

// ---------- Consultas y transacciones ----------
// Dentro de tx(), q() usa automáticamente la conexión de la transacción (AsyncLocalStorage):
// no hace falta pasar la conexión de función en función.
const enTx = new AsyncLocalStorage<pg.PoolClient>();

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (enTx.getStore() ?? pool).query(sql, params)).rows;
}
export async function q1<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (enTx.getStore()) return fn(); // ya estamos dentro de una transacción
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await enTx.run(c, fn);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

// ---------- Esquema ----------
const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS productos (
    id             text PRIMARY KEY,
    nombre         text NOT NULL,
    descripcion    text,
    precio         integer NOT NULL CHECK (precio >= 0),
    colores        jsonb,                -- array o NULL si no tiene colores
    personalizable boolean NOT NULL DEFAULT false, -- lleva nombre del bebé
    foto           text,
    stock          integer,              -- cantidad cargada (se guarda aunque no se controle)
    controla_stock boolean NOT NULL DEFAULT false, -- false = "Ignorar stock": se vende sin mirar la cantidad
    activo         boolean NOT NULL DEFAULT true,
    orden          integer GENERATED ALWAYS AS IDENTITY
  );

  CREATE TABLE IF NOT EXISTS boxes (
    id       text PRIMARY KEY,
    nombre   text NOT NULL,
    precio   integer NOT NULL CHECK (precio >= 0),
    items    jsonb NOT NULL,             -- lo que trae, para mostrar
    colores  jsonb,                      -- colores en que viene (el cliente elige uno); NULL = sin elección
    foto     text,
    etiqueta text,                       -- ej. "PREMIUM"
    activo   boolean NOT NULL DEFAULT true
  );

  -- Productos que trae cada box: venderla descuenta su stock
  CREATE TABLE IF NOT EXISTS box_productos (
    box_id      text NOT NULL REFERENCES boxes(id),
    producto_id text NOT NULL REFERENCES productos(id),
    cantidad    integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    orden       integer GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (box_id, producto_id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email  text NOT NULL,
    nombre text NOT NULL,
    hash   text NOT NULL,                -- scrypt (nunca la contraseña)
    rol    text NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin')),
    creado timestamptz NOT NULL DEFAULT now(),
    notif_vistas timestamptz             -- admin: última vez que abrió las notificaciones
  );
  CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email ON usuarios (lower(email));

  CREATE TABLE IF NOT EXISTS sesiones (
    token_hash text PRIMARY KEY,         -- sha256 del token de la cookie
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    vence      bigint NOT NULL           -- milisegundos (Date.now())
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creado        timestamptz NOT NULL DEFAULT now(),
    estado        text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','pagado','enviado','entregado','cancelado')),
    nombre        text NOT NULL,
    telefono      text NOT NULL,
    email         text NOT NULL,
    direccion     text,
    entrega       text NOT NULL CHECK (entrega IN ('cadeteria','pickup','interior')),
    pago          text NOT NULL CHECK (pago IN ('transferencia','abitab_redpagos','prex_midinero','mercadopago')),
    items         jsonb NOT NULL,        -- copia de lo comprado con su precio en ese momento
    subtotal      integer NOT NULL,
    recargo       integer NOT NULL DEFAULT 0,
    total         integer NOT NULL,
    mp_payment_id text,
    usuario_id    integer REFERENCES usuarios(id), -- NULL = compra sin cuenta
    token_pago    text,                  -- sha256 del token para ver los datos de pago y subir el comprobante
    comprobante   text,                  -- clave del archivo privado (bucket o disco) del comprobante de pago
    comprobante_tipo   text,
    comprobante_subido timestamptz,      -- con comprobante, el pedido no vence: queda en revisión
    cupon         text,                  -- código de descuento usado (ver cupones)
    descuento     integer NOT NULL DEFAULT 0,
    origen        text,                  -- de dónde llegó: utm_source del link (instagram, …) o el sitio de referencia (google)
    campana       text,                  -- utm_campaign del link (qué publicación o promo)
    vence         timestamptz            -- plazo para pagar fijado a mano (ej. al reclamar el pago); NULL = el normal según el medio
  );

  -- Códigos de descuento (admin → Cupones)
  CREATE TABLE IF NOT EXISTS cupones (
    codigo   text PRIMARY KEY,           -- en mayúsculas
    tipo     text NOT NULL CHECK (tipo IN ('porcentaje','monto')),
    valor    integer NOT NULL CHECK (valor > 0),
    minimo   integer NOT NULL DEFAULT 0, -- compra mínima
    usos_max integer,                    -- NULL = sin límite
    usos     integer NOT NULL DEFAULT 0, -- pedidos no cancelados que lo usaron
    vence    date,                       -- último día válido (hora de Uruguay); NULL = no vence
    activo   boolean NOT NULL DEFAULT true,
    creado   timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS pedidos_pendientes ON pedidos (creado) WHERE estado = 'pendiente';

  -- Métricas de uso: contadores por día, sin datos personales ni cookies
  CREATE TABLE IF NOT EXISTS eventos (
    dia  date NOT NULL,
    tipo text NOT NULL,
    ref  text NOT NULL DEFAULT '',       -- página, box o producto según el tipo
    n    integer NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, tipo, ref)
  );

  -- Historial: quién cambió qué y cuándo (precios, stock, fotos, estados de pedidos)
  CREATE TABLE IF NOT EXISTS historial (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cuando     timestamptz NOT NULL DEFAULT now(),
    autor      text NOT NULL,             -- email del admin, "cliente", "sistema" o "mercadopago"
    entidad    text NOT NULL,             -- producto | box | pedido
    entidad_id text NOT NULL,
    accion     text NOT NULL,             -- crear | editar | foto | estado
    cambios    jsonb NOT NULL DEFAULT '{}' -- { campo: [antes, después] }
  );
  CREATE INDEX IF NOT EXISTS historial_entidad ON historial (entidad, entidad_id, cuando DESC);
  CREATE INDEX IF NOT EXISTS historial_cuando ON historial (cuando DESC);

  -- Ajustes editables desde el admin (ej. datos bancarios para transferencias)
  CREATE TABLE IF NOT EXISTS ajustes (
    clave text PRIMARY KEY,
    valor jsonb NOT NULL
  );

  CREATE TABLE IF NOT EXISTS migraciones (
    n        integer PRIMARY KEY,
    aplicada timestamptz NOT NULL DEFAULT now()
  );
`;

// ---------- Migraciones: cambios a bases que ya tienen datos ----------
// Para cambiar la estructura o el catálogo de una base existente, agregar una función AL FINAL.
// Cada una corre una sola vez (se anota en la tabla migraciones). No borrar ni reordenar.
const MIGRACIONES: (() => Promise<void>)[] = [
  // 1: precios nuevos de las boxes (commit "Nuevos precios de las boxes") y etiqueta PREMIUM.
  // Solo si siguen con el valor viejo exacto: no pisa lo que se haya editado desde el admin.
  async () => {
    const precios: [string, number, number][] = [
      ['mini-box', 890, 990], ['dulce-llegada', 1490, 1390], ['esencial', 1490, 1590], ['dulce-suenos', 1590, 1690],
      ['primeros-mimos', 1990, 1790], ['pequeno-tesoro', 2190, 2090], ['especial-manolito', 3190, 3290],
    ];
    for (const [id, viejo, nuevo] of precios) {
      const r = await q('UPDATE boxes SET precio = $1 WHERE id = $2 AND precio = $3 RETURNING id', [nuevo, id, viejo]);
      if (r.length) await registrar('migración', 'box', id, 'editar', { precio: [viejo, nuevo] });
    }
    await q("UPDATE boxes SET etiqueta = 'PREMIUM' WHERE id = 'especial-manolito' AND etiqueta = 'COMPLETA'");
  },
  // 3 (abajo) agrega los colores de las boxes.
  // 2: pagos manuales (transferencia, Abitab, Prex): token del pedido y comprobante subido por el cliente
  async () => {
    await q(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS token_pago text, ADD COLUMN IF NOT EXISTS comprobante text,
      ADD COLUMN IF NOT EXISTS comprobante_tipo text, ADD COLUMN IF NOT EXISTS comprobante_subido timestamptz`);
  },
  // 3: colores de cada box (el cliente tiene que elegir uno al comprar). Se toman del catálogo inicial
  async () => {
    await q('ALTER TABLE boxes ADD COLUMN IF NOT EXISTS colores jsonb');
    for (const b of BOXES) await q('UPDATE boxes SET colores = $1 WHERE id = $2 AND colores IS NULL', [JSON.stringify(b.colores), b.id]);
  },
  // 4: códigos de descuento en los pedidos (la tabla cupones la crea el esquema)
  async () => {
    await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupon text, ADD COLUMN IF NOT EXISTS descuento integer NOT NULL DEFAULT 0');
  },
  // 5: el babero suelto ("Armá tu box") viene en rosa, celeste o verde (sin beige ni estampado)
  async () => {
    await q(`UPDATE productos SET colores = '["Rosa", "Celeste", "Verde"]' WHERE id = 'babero'`);
  },
  // 6: el sonajero se elige entre los dos de la foto (va en el campo color, como opción)
  async () => {
    await q(`UPDATE productos SET colores = '["Conejito aro", "Conejito bastón"]' WHERE id = 'sonajero'`);
  },
  // 7: notificaciones del admin (qué ya vio)
  async () => {
    await q('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notif_vistas timestamptz');
  },
  // 8: de dónde llegó cada pedido (métricas "De dónde vienen las ventas")
  async () => {
    await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origen text, ADD COLUMN IF NOT EXISTS campana text');
  },
  // 9: plazo de pago propio por pedido (al reclamar el pago se dan 4 h más desde el mail)
  async () => {
    await q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS vence timestamptz');
  },
];

// Crea las tablas, aplica migraciones y carga el catálogo inicial si la base está vacía.
// El lock evita que dos instancias del server lo hagan a la vez (ej. durante un deploy).
export async function iniciarDb() {
  await tx(async () => {
    await q('SELECT pg_advisory_xact_lock(4242)');
    await q(ESQUEMA);
    const hechas = new Set((await q<{ n: number }>('SELECT n FROM migraciones')).map(r => r.n));
    for (const [i, migrar] of MIGRACIONES.entries()) {
      if (hechas.has(i + 1)) continue;
      await migrar();
      await q('INSERT INTO migraciones (n) VALUES ($1)', [i + 1]);
    }
    if (!(await q1('SELECT 1 FROM productos LIMIT 1'))) {
      for (const p of PRODUCTOS) {
        await q('INSERT INTO productos (id, nombre, descripcion, precio, colores, personalizable, foto) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [p.id, p.nombre, p.descripcion, p.precio, p.colores && JSON.stringify(p.colores), p.personalizable, p.foto]);
      }
      for (const b of BOXES) {
        await q('INSERT INTO boxes (id, nombre, precio, items, foto, etiqueta, colores) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [b.id, b.nombre, b.precio, JSON.stringify(b.items), b.foto, b.etiqueta, JSON.stringify(b.colores)]);
        for (const p of b.productos) await q('INSERT INTO box_productos (box_id, producto_id) VALUES ($1, $2)', [b.id, p]);
      }
    }
  });
}

// ---------- Historial ----------
// Llamar dentro de la misma transacción que el cambio: así nunca queda un cambio sin registrar (ni al revés)
export type Autor = string; // email del admin, 'cliente', 'sistema', 'mercadopago'
export const registrar = (autor: Autor, entidad: 'producto' | 'box' | 'pedido' | 'ajustes' | 'cupon', id: string | number, accion: string, cambios: Record<string, unknown> = {}) =>
  q('INSERT INTO historial (autor, entidad, entidad_id, accion, cambios) VALUES ($1, $2, $3, $4, $5)',
    [autor, entidad, String(id), accion, JSON.stringify(cambios)]);

// { campo: [antes, después] } solo con lo que cambió
export function diferencias<T extends Record<string, unknown>>(antes: T, despues: T, campos: (keyof T)[]) {
  const d: Record<string, [unknown, unknown]> = {};
  for (const c of campos) if (antes[c] !== despues[c]) d[c as string] = [antes[c], despues[c]];
  return d;
}

// ---------- Catálogo ----------
export type Producto = {
  id: string; nombre: string; descripcion: string | null; precio: number;
  colores: string[] | null; personalizable: boolean; foto: string | null;
  activo: boolean;
  stock: number | null;   // el que usan las ventas: null = sin límite (no se controla)
  stockCargado: number | null; controlaStock: boolean; // lo que se edita en el admin
};
export type Componente = { id: string; nombre: string; cantidad: number; stock: number | null };
export type Box = {
  id: string; nombre: string; precio: number; items: string[]; colores: string[] | null;
  foto: string | null; etiqueta: string | null; activo: boolean;
  componentes: Componente[]; agotada: boolean; // agotada = algún producto que trae no tiene stock suficiente
};

// Stock que usan las ventas, en SQL: NULL si el producto tiene "Ignorar stock"
export const STOCK_SQL = 'CASE WHEN controla_stock THEN COALESCE(stock, 0) END';

const toProducto = ({ controla_stock, orden: _orden, ...r }: any): Producto => ({
  ...r, stock: controla_stock ? (r.stock ?? 0) : null, stockCargado: r.stock, controlaStock: controla_stock,
});

// Cada box con sus componentes en una sola consulta
const SELECT_BOX = `SELECT b.*, COALESCE((
    SELECT json_agg(json_build_object('id', p.id, 'nombre', p.nombre, 'cantidad', bp.cantidad, 'stock', CASE WHEN p.controla_stock THEN COALESCE(p.stock, 0) END) ORDER BY bp.orden)
    FROM box_productos bp JOIN productos p ON p.id = bp.producto_id WHERE bp.box_id = b.id
  ), '[]') AS componentes
  FROM boxes b`;
const toBox = (r: any): Box => ({
  ...r, agotada: (r.componentes as Componente[]).some(c => c.stock !== null && c.stock < c.cantidad),
});

export const productos = {
  todos: async (soloActivos = true): Promise<Producto[]> =>
    (await q(`SELECT * FROM productos ${soloActivos ? 'WHERE activo' : ''} ORDER BY orden`)).map(toProducto),
  uno: async (id: string): Promise<Producto | undefined> => {
    const r = await q1('SELECT * FROM productos WHERE id = $1', [id]);
    return r && toProducto(r);
  },
};

export const boxes = {
  todas: async (soloActivas = true): Promise<Box[]> =>
    (await q(`${SELECT_BOX} ${soloActivas ? 'WHERE b.activo' : ''} ORDER BY b.precio, b.id`)).map(toBox),
  una: async (id: string): Promise<Box | undefined> => {
    const r = await q1(`${SELECT_BOX} WHERE b.id = $1`, [id]);
    return r && toBox(r);
  },
};

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
    foto     text,
    etiqueta text,                       -- ej. "COMPLETA"
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
    creado timestamptz NOT NULL DEFAULT now()
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
    usuario_id    integer REFERENCES usuarios(id) -- NULL = compra sin cuenta
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

  CREATE TABLE IF NOT EXISTS migraciones (
    n        integer PRIMARY KEY,
    aplicada timestamptz NOT NULL DEFAULT now()
  );
`;

// ---------- Migraciones: cambios a bases que ya tienen datos ----------
// Para cambiar la estructura o el catálogo de una base existente, agregar una función AL FINAL.
// Cada una corre una sola vez (se anota en la tabla migraciones). No borrar ni reordenar.
const MIGRACIONES: (() => Promise<void>)[] = [];

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
        await q('INSERT INTO boxes (id, nombre, precio, items, foto, etiqueta) VALUES ($1, $2, $3, $4, $5, $6)',
          [b.id, b.nombre, b.precio, JSON.stringify(b.items), b.foto, b.etiqueta]);
        for (const p of b.productos) await q('INSERT INTO box_productos (box_id, producto_id) VALUES ($1, $2)', [b.id, p]);
      }
    }
  });
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
  id: string; nombre: string; precio: number; items: string[];
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

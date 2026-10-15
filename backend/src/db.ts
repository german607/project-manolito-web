import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PRODUCTOS, BOXES } from './seed.js';

const DB_PATH = process.env.DB_PATH ?? 'data/manolito.db';
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id             TEXT PRIMARY KEY,
    nombre         TEXT NOT NULL,
    descripcion    TEXT,
    precio         INTEGER NOT NULL CHECK (precio >= 0),
    colores        TEXT,              -- JSON array o NULL si no tiene colores
    personalizable INTEGER NOT NULL DEFAULT 0, -- lleva nombre del bebé
    foto           TEXT,
    stock          INTEGER,           -- cantidad cargada (se guarda aunque no se controle)
    controla_stock INTEGER NOT NULL DEFAULT 0, -- 0 = "Ignorar stock": se vende sin mirar la cantidad
    activo         INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS boxes (
    id       TEXT PRIMARY KEY,
    nombre   TEXT NOT NULL,
    precio   INTEGER NOT NULL CHECK (precio >= 0),
    items    TEXT NOT NULL,           -- JSON array con lo que trae
    foto     TEXT,
    etiqueta TEXT,                    -- ej. "COMPLETA"
    activo   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    creado        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','pagado','enviado','entregado','cancelado')),
    nombre        TEXT NOT NULL,
    telefono      TEXT NOT NULL,
    email         TEXT NOT NULL,
    direccion     TEXT,
    entrega       TEXT NOT NULL CHECK (entrega IN ('cadeteria','pickup','interior')),
    pago          TEXT NOT NULL CHECK (pago IN ('transferencia','abitab_redpagos','prex_midinero','mercadopago')),
    items         TEXT NOT NULL,      -- JSON: copia de lo comprado con su precio en ese momento
    subtotal      INTEGER NOT NULL,
    recargo       INTEGER NOT NULL DEFAULT 0,
    total         INTEGER NOT NULL,
    mp_payment_id TEXT
  );

  -- Productos que trae cada box: venderla descuenta su stock
  CREATE TABLE IF NOT EXISTS box_productos (
    box_id      TEXT NOT NULL REFERENCES boxes(id),
    producto_id TEXT NOT NULL REFERENCES productos(id),
    cantidad    INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    PRIMARY KEY (box_id, producto_id)
  );

  -- Métricas de uso: contadores por día, sin datos personales ni cookies
  CREATE TABLE IF NOT EXISTS eventos (
    dia  TEXT NOT NULL,               -- YYYY-MM-DD
    tipo TEXT NOT NULL,
    ref  TEXT NOT NULL DEFAULT '',    -- página, box o producto según el tipo
    n    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, tipo, ref)
  );
`);

// ---------- Migraciones: cambios a bases que ya existen. user_version = última aplicada ----------
const MIGRACIONES: (() => void)[] = [
  // 1: interruptor "Ignorar stock". Antes, stock NULL significaba "sin límite"
  () => {
    const cols = (db.prepare("SELECT name FROM pragma_table_info('productos')").all() as { name: string }[]).map(c => c.name);
    if (!cols.includes('controla_stock')) {
      db.exec('ALTER TABLE productos ADD COLUMN controla_stock INTEGER NOT NULL DEFAULT 0');
      db.exec('UPDATE productos SET controla_stock = 1 WHERE stock IS NOT NULL');
    }
  },
];
const version = db.pragma('user_version', { simple: true }) as number;
MIGRACIONES.slice(version).forEach((migrar, i) => db.transaction(() => {
  migrar();
  db.pragma(`user_version = ${version + i + 1}`);
})());

if (!db.prepare('SELECT 1 FROM productos LIMIT 1').get()) {
  const insP = db.prepare('INSERT INTO productos (id, nombre, descripcion, precio, colores, personalizable, foto) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insB = db.prepare('INSERT INTO boxes (id, nombre, precio, items, foto, etiqueta) VALUES (?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const p of PRODUCTOS) insP.run(p.id, p.nombre, p.descripcion, p.precio, p.colores && JSON.stringify(p.colores), p.personalizable ? 1 : 0, p.foto);
    for (const b of BOXES) insB.run(b.id, b.nombre, b.precio, JSON.stringify(b.items), b.foto, b.etiqueta);
  })();
}

// Bases creadas antes de existir box_productos: se completa con el contenido del catálogo inicial
if (!db.prepare('SELECT 1 FROM box_productos LIMIT 1').get()) {
  const ins = db.prepare(`INSERT OR IGNORE INTO box_productos (box_id, producto_id)
    SELECT @box, @prod WHERE EXISTS (SELECT 1 FROM boxes WHERE id = @box) AND EXISTS (SELECT 1 FROM productos WHERE id = @prod)`);
  db.transaction(() => { for (const b of BOXES) for (const p of b.productos) ins.run({ box: b.id, prod: p }); })();
}

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
  componentes: Componente[]; agotada: boolean; // agotada = algún producto que trae tiene stock 0
};

// SQLite guarda JSON como texto y booleanos como 0/1
const toProducto = ({ controla_stock, ...r }: any): Producto => ({
  ...r, colores: r.colores && JSON.parse(r.colores), personalizable: !!r.personalizable, activo: !!r.activo,
  stock: controla_stock ? (r.stock ?? 0) : null, stockCargado: r.stock, controlaStock: !!controla_stock,
});
// Stock que usan las ventas, en SQL: NULL si el producto tiene "Ignorar stock"
export const STOCK_SQL = 'CASE WHEN controla_stock = 1 THEN COALESCE(stock, 0) END';
const componentesDe = db.prepare(`SELECT p.id, p.nombre, bp.cantidad, ${STOCK_SQL} AS stock FROM box_productos bp
  JOIN productos p ON p.id = bp.producto_id WHERE bp.box_id = ? ORDER BY bp.rowid`);
const toBox = (r: any): Box => {
  const componentes = componentesDe.all(r.id) as Componente[];
  return { ...r, items: JSON.parse(r.items), activo: !!r.activo, componentes,
    agotada: componentes.some(c => c.stock !== null && c.stock < c.cantidad) };
};

export const productos = {
  todos: (soloActivos = true): Producto[] =>
    db.prepare(`SELECT * FROM productos ${soloActivos ? 'WHERE activo = 1' : ''} ORDER BY rowid`).all().map(toProducto),
  uno: (id: string): Producto | undefined => {
    const r = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    return r ? toProducto(r) : undefined;
  },
};

export const boxes = {
  todas: (soloActivas = true): Box[] =>
    db.prepare(`SELECT * FROM boxes ${soloActivas ? 'WHERE activo = 1' : ''} ORDER BY precio`).all().map(toBox),
  una: (id: string): Box | undefined => {
    const r = db.prepare('SELECT * FROM boxes WHERE id = ?').get(id);
    return r ? toBox(r) : undefined;
  },
};

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
    stock          INTEGER,           -- NULL = sin límite
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

  -- Métricas de uso: contadores por día, sin datos personales ni cookies
  CREATE TABLE IF NOT EXISTS eventos (
    dia  TEXT NOT NULL,               -- YYYY-MM-DD
    tipo TEXT NOT NULL,
    ref  TEXT NOT NULL DEFAULT '',    -- página, box o producto según el tipo
    n    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, tipo, ref)
  );
`);

if (!db.prepare('SELECT 1 FROM productos LIMIT 1').get()) {
  const insP = db.prepare('INSERT INTO productos (id, nombre, descripcion, precio, colores, personalizable, foto) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insB = db.prepare('INSERT INTO boxes (id, nombre, precio, items, foto, etiqueta) VALUES (?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const p of PRODUCTOS) insP.run(p.id, p.nombre, p.descripcion, p.precio, p.colores && JSON.stringify(p.colores), p.personalizable ? 1 : 0, p.foto);
    for (const b of BOXES) insB.run(b.id, b.nombre, b.precio, JSON.stringify(b.items), b.foto, b.etiqueta);
  })();
}

export type Producto = {
  id: string; nombre: string; descripcion: string | null; precio: number;
  colores: string[] | null; personalizable: boolean; foto: string | null;
  stock: number | null; activo: boolean;
};
export type Box = {
  id: string; nombre: string; precio: number; items: string[];
  foto: string | null; etiqueta: string | null; activo: boolean;
};

// SQLite guarda JSON como texto y booleanos como 0/1
const toProducto = (r: any): Producto => ({ ...r, colores: r.colores && JSON.parse(r.colores), personalizable: !!r.personalizable, activo: !!r.activo });
const toBox = (r: any): Box => ({ ...r, items: JSON.parse(r.items), activo: !!r.activo });

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

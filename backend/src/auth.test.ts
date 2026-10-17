import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, autenticar, asegurarAdmin } from './auth.js';
import { q1 } from './db.js';

test('registro e ingreso de clientes', async () => {
  const u = await registrar('Ana', 'ana@test.com', 'una-clave-segura');
  assert.equal(u.rol, 'cliente');
  const guardado = (await q1<{ hash: string }>('SELECT hash FROM usuarios WHERE id = $1', [u.id]))!;
  assert.ok(guardado.hash.startsWith('scrypt$') && !guardado.hash.includes('una-clave-segura'), 'no se guarda la contraseña');

  assert.equal((await autenticar('ana@test.com', 'una-clave-segura')).id, u.id);
  await assert.rejects(autenticar('ana@test.com', 'otra'), /incorrectos/);
  await assert.rejects(autenticar('nadie@test.com', 'una-clave-segura'), /incorrectos/, 'mismo mensaje: no revela qué emails existen');
  await assert.rejects(registrar('Ana bis', 'ANA@test.com', 'otra-clave-larga'), /Ya hay una cuenta/, 'el email no distingue mayúsculas');
});

test('la cuenta de admin sale de ADMIN_EMAIL y ADMIN_PASSWORD, y se actualiza si cambia la contraseña', async () => {
  process.env.ADMIN_EMAIL = 'Admin@Manolito.com';
  process.env.ADMIN_PASSWORD = 'clave-admin-de-prueba-1';
  await asegurarAdmin();
  assert.equal((await autenticar('admin@manolito.com', 'clave-admin-de-prueba-1')).rol, 'admin');

  process.env.ADMIN_PASSWORD = 'clave-admin-nueva-2';
  await asegurarAdmin();
  await assert.rejects(autenticar('admin@manolito.com', 'clave-admin-de-prueba-1'));
  assert.equal((await autenticar('admin@manolito.com', 'clave-admin-nueva-2')).rol, 'admin');
});

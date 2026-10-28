const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plata = n => '$' + Number(n || 0).toLocaleString('es-UY');
const ddmm = dia => dia.slice(8, 10) + '/' + dia.slice(5, 7);

async function api(path, { method = 'GET', body } = {}) {
  const esArchivo = body instanceof Blob;
  const r = await fetch('/api/admin' + path, {
    method,
    headers: body ? { 'Content-Type': esArchivo ? body.type : 'application/json' } : {},
    body: body && !esArchivo ? JSON.stringify(body) : body,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) { irAlLogin(); throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(data.detalles ? data.detalles.join(', ') : data.error || 'Error');
  return data;
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------- Sesión: se ingresa por la página de login común (/login.html) ----------

const irAlLogin = () => location.replace('/login.html?volver=' + encodeURIComponent('/admin/' + location.hash));

$('#logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login.html';
});

// ---------- Pestañas ----------

const CARGAR = { resumen: cargarResumen, productos: cargarProductos, boxes: cargarBoxes, pedidos: cargarPedidos, cupones: cargarCupones, historial: cargarHistorial, ajustes: cargarAjustes };
const tabActual = () => (CARGAR[location.hash.slice(1)] ? location.hash.slice(1) : 'resumen');

function abrirTab(tab) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => (p.hidden = p.id !== 'tab-' + tab));
  history.replaceState(null, '', '#' + tab);
  CARGAR[tab]().catch(err => toast(err.message));
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => abrirTab(b.dataset.tab)));

// ---------- Resumen ----------

let dias = 30;
document.querySelectorAll('#rango button').forEach(b => b.addEventListener('click', () => {
  dias = Number(b.dataset.dias); cargarResumen().catch(err => toast(err.message));
}));

async function cargarResumen() {
  document.querySelectorAll('#rango button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.dias) === dias));
  const [d, prods] = await Promise.all([api('/resumen?dias=' + dias), api('/productos')]);
  const nombre = Object.fromEntries(prods.map(p => [p.id, p.nombre]));
  const t = d.totales;
  const pedidos = d.pedidos.reduce((s, p) => s + p.cantidad, 0);
  const facturado = d.pedidos.filter(p => ['pagado', 'enviado', 'entregado'].includes(p.estado)).reduce((s, p) => s + p.total, 0);

  // Flecha contra el período anterior del mismo largo
  const delta = (actual, antes) => {
    if (!antes) return actual ? `<em class="delta up">nuevo vs ${dias} días anteriores</em>` : '';
    const p = Math.round(((actual - antes) / antes) * 100);
    return `<em class="delta ${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p > 0 ? '↑' : p < 0 ? '↓' : '='} ${Math.abs(p)}% vs ${dias} días anteriores</em>`;
  };
  const a = d.anterior;
  $('#kpis').innerHTML = [
    ['Visitas', t.visita, delta(t.visita || 0, a.visitas)], ['Clicks a Instagram', t.instagram], ['Boxes vistas', t.box_ver],
    ['Armados enviados', t.arma_enviar], ['Pedidos', pedidos], ['Facturado', plata(facturado)],
  ].map(([k, v, extra = '']) => `<div class="kpi"><small>${k}</small><b>${typeof v === 'string' ? v : (v || 0).toLocaleString('es-UY')}</b>${extra}</div>`).join('');

  grafico(d.visitasPorDia);
  ranking('#topPaginas', d.paginas, r => (r.ref === '/' || r.ref === '/index.html' ? 'Inicio' : r.ref.replace(/^\//, '').replace('.html', '')));
  ranking('#topBoxes', d.boxesVistas, r => r.ref);
  ranking('#topProductos', d.productosAgregados, r => nombre[r.ref] || r.ref);

  // ---- Ventas ----
  const v = d.ventas, abandonos = Math.max(0, (t.checkout || 0) - d.embudo[3].n);
  $('#kpisVentas').innerHTML = [
    ['Vendido', plata(v.resumen.total), delta(v.resumen.total, a.total)], ['Pedidos pagados', v.resumen.pedidos, delta(v.resumen.pedidos, a.pedidos)],
    ['Ticket promedio', plata(v.resumen.ticket), delta(v.resumen.ticket, a.ticket)], ['Carritos abandonados', abandonos],
  ].map(([k, x, extra = '']) => `<div class="kpi"><small>${k}</small><b>${typeof x === 'string' ? x : (x || 0).toLocaleString('es-UY')}</b>${extra}</div>`).join('');

  // ---- Para vender más ----
  $('#conversionBoxes').innerHTML = `<thead><tr><th>Box</th><th>Vistas</th><th>Vendidas</th><th>Conversión</th></tr></thead><tbody>${d.conversionBoxes.map(b =>
    `<tr><td>${esc(b.ref)}</td><td>${b.vistas}</td><td>${b.vendidas}</td><td>${b.vistas ? Math.round((b.vendidas / b.vistas) * 100) + '%' : '—'}</td></tr>`).join('')}</tbody>`;
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const semana = DIAS.map((x, i) => ({ x, n: d.porDiaSemana.find(r => r.dia === i + 1)?.n || 0 }));
  const horas = Array.from({ length: 24 }, (_, h) => ({ x: h, n: d.porHora.find(r => r.hora === h)?.n || 0 }));
  const barras = (filas, etiqueta) => { const max = Math.max(1, ...filas.map(f => f.n));
    return `<div class="barritas">${filas.map(f => `<div title="${esc(etiqueta(f))}: ${f.n} pedido(s)"><i style="height:${(f.n / max) * 100}%"></i><small>${esc(String(f.x))}</small></div>`).join('')}</div>`; };
  const pico = horas.reduce((m, h) => (h.n > m.n ? h : m), { n: 0 });
  $('#cuandoCompran').innerHTML = horas.some(h => h.n)
    ? `<p class="meta">Por día de la semana</p>${barras(semana, f => f.x)}<p class="meta">Por hora${pico.n ? ` · pico a las ${pico.x} h` : ''}</p>${barras(horas, f => f.x + ' h')}`
    : '<p class="empty">Sin pedidos en este período.</p>';
  ranking('#porOrigen', d.porOrigen, r => `${r.ref === 'directo' ? 'Directo (escribieron la dirección o sin dato)' : r.ref}${r.campana ? ' · ' + r.campana : ''} (${r.pedidos})`, plata);
  ranking('#cuponesUso', d.cupones, r => `${r.ref} · ${r.pedidos} pedido(s) · -${plata(r.descuento)} de descuento`, plata);

  // ---- Clientes ----
  $('#kpisClientes').innerHTML = [['Clientes nuevos', d.clientes.nuevos], ['Volvieron a comprar', d.clientes.vuelven]]
    .map(([k, x]) => `<div class="kpi"><small>${k}</small><b>${(x || 0).toLocaleString('es-UY')}</b></div>`).join('');
  $('#mejoresClientes').innerHTML = d.mejoresClientes.length
    ? `<thead><tr><th>Cliente</th><th>Email</th><th>Pedidos</th><th>Total</th></tr></thead><tbody>${d.mejoresClientes.map(c =>
      `<tr><td>${esc(c.nombre)}</td><td>${esc(c.email)}</td><td>${c.pedidos}</td><td>${plata(c.n)}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Todavía no hay compras pagadas.</td></tr></tbody>';
  const base = Math.max(1, d.embudo[0].n);
  $('#embudo').innerHTML = `<div class="rank">${d.embudo.map((p, i) => {
    const previo = i ? d.embudo[i - 1].n : 0;
    const pct = i && previo ? ` <small>· ${Math.round((p.n / previo) * 100)}% del paso anterior</small>` : '';
    return `<div class="rank-row embudo-paso"><span>${p.paso}${pct}</span><b>${p.n.toLocaleString('es-UY')}</b><div class="track"><div class="fill" style="width:${Math.min(100, (p.n / base) * 100)}%"></div></div></div>`;
  }).join('')}</div>`;
  ranking('#masVendidos', v.masVendidos, r => `${r.ref} (${r.unidades} u.)`, plata);
  ranking('#porPago', v.porPago, r => `${PAGOS[r.ref] || r.ref} (${r.pedidos})`, plata);
  ranking('#porEntrega', v.porEntrega, r => ENTREGA[r.ref] || r.ref);

  const bajo = d.stockBajo;
  $('#stockAlert').hidden = !bajo.length;
  $('#stockAlert').innerHTML = `<span aria-hidden="true">⚠</span><span><b>Stock bajo:</b> ${bajo.map(p => `${esc(p.nombre)} (${p.stock})`).join(', ')}</span>`;
}

function grafico(filas) {
  const max = Math.max(1, ...filas.map(f => f.n));
  const total = filas.reduce((s, f) => s + f.n, 0);
  const pico = filas.reduce((a, f) => (f.n > a.n ? f : a), filas[0]);
  const medio = filas[Math.floor(filas.length / 2)];
  const el = $('#chart');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Visitas por día: ${total} en total, máximo ${pico.n} el ${ddmm(pico.dia)}`);
  el.innerHTML = `
    <div class="y"><span>${max}</span><span>${Math.round(max / 2)}</span><span>0</span></div>
    <div class="plot">${filas.map(f => `<div class="col" data-tip="${ddmm(f.dia)}: ${f.n} visita${f.n === 1 ? '' : 's'}"><div class="bar" style="height:${(f.n / max) * 100}%"></div></div>`).join('')}</div>
    <div class="x"><span>${ddmm(filas[0].dia)}</span><span>${ddmm(medio.dia)}</span><span>${ddmm(filas[filas.length - 1].dia)}</span></div>`;
}

const ENTREGA = { cadeteria: 'Cadetería', pickup: 'Pick-up Cordón', interior: 'Interior' };
const PAGOS = { transferencia: 'Transferencia', abitab_redpagos: 'Abitab / Red Pagos', prex_midinero: 'Prex / Mi Dinero', mercadopago: 'Mercado Pago' };

function ranking(sel, filas, etiqueta, formato = n => n.toLocaleString('es-UY')) {
  const max = Math.max(1, ...filas.map(f => f.n));
  $(sel).innerHTML = filas.length
    ? `<div class="rank">${filas.map(f => `<div class="rank-row"><span>${esc(etiqueta(f))}</span><b>${formato(f.n)}</b><div class="track"><div class="fill" style="width:${(f.n / max) * 100}%"></div></div></div>`).join('')}</div>`
    : '<p class="empty">Sin datos en este período.</p>';
}

// ---------- Productos y boxes ----------

async function cargarProductos() { tabla('#tablaProductos', await api('/productos'), 'productos'); }
async function cargarBoxes() { tabla('#tablaBoxes', await api('/boxes'), 'boxes'); }

function tabla(sel, items, tipo) {
  const conStock = tipo === 'productos';
  const t = $(sel);
  t.innerHTML = `<thead><tr><th>Foto</th><th>${conStock ? 'Producto' : 'Box'}</th><th>Precio</th>${conStock ? '<th>Stock</th>' : ''}<th>Activo</th><th></th></tr></thead>
    <tbody>${items.map(p => `
      <tr data-id="${esc(p.id)}" class="${p.activo ? '' : 'off'}">
        <td><img class="thumb" src="../${esc(p.foto)}" alt="" ${conStock ? 'title="Cambiar foto"' : 'style="cursor:default"'}>${conStock ? '<input type="file" accept="image/jpeg,image/png,image/webp" hidden>' : ''}</td>
        <td>${esc(p.nombre)}</td>
        <td><input type="number" name="precio" min="0" step="10" value="${p.precio}" aria-label="Precio de ${esc(p.nombre)}"></td>
        ${conStock ? `<td><div class="stock-cell">
          <input type="number" name="stock" min="0" value="${p.stockCargado ?? ''}" ${p.controlaStock ? '' : 'disabled'} aria-label="Stock de ${esc(p.nombre)}">
          <label class="switch" title="Activado: se vende sin mirar la cantidad"><input type="checkbox" name="ignorar" ${p.controlaStock ? '' : 'checked'}> <span>Ignorar stock</span></label>
        </div></td>` : ''}
        <td><label class="switch"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> <span>${p.activo ? 'Sí' : 'No'}</span></label></td>
        <td><button class="btn sm" disabled>Guardar</button></td>
      </tr>`).join('')}</tbody>`;

  t.querySelectorAll('tbody tr').forEach(tr => {
    const btn = tr.querySelector('.btn');
    const campo = n => tr.querySelector(`[name=${n}]`);
    tr.addEventListener('input', e => {
      btn.disabled = false;
      if (e.target.name === 'ignorar') campo('stock').disabled = e.target.checked;
    });

    btn.addEventListener('click', async () => {
      const body = { precio: Number(campo('precio').value), activo: campo('activo').checked };
      if (conStock) {
        body.controlaStock = !campo('ignorar').checked;
        body.stock = campo('stock').value === '' ? null : Number(campo('stock').value);
      }
      try {
        const p = await api(`/${tipo}/${tr.dataset.id}`, { method: 'PATCH', body });
        btn.disabled = true;
        tr.classList.toggle('off', !p.activo);
        campo('activo').nextElementSibling.textContent = p.activo ? 'Sí' : 'No';
        toast('Guardado ✓');
      } catch (err) { toast(err.message); }
    });

    if (!conStock) return;
    const file = tr.querySelector('input[type=file]');
    const img = tr.querySelector('.thumb');
    img.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try {
        const p = await api(`/productos/${tr.dataset.id}/foto`, { method: 'PUT', body: file.files[0] });
        img.src = '../' + p.foto;
        toast('Foto actualizada ✓');
      } catch (err) { toast(err.message); }
      file.value = '';
    });
  });
}

// ---------- Pedidos ----------

const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];
$('#filtroEstado').addEventListener('change', () => cargarPedidos().catch(err => toast(err.message)));

// Foto del modelo de portachupete elegido ("Silicona N° 4 — detalle" → silicona-4.jpg)
const fotoModelo = m => { const r = /^(Silicona|Madera) N° (\d+)/.exec(m || ''); return r ? `/assets/img/portachupetes/modelos/${r[1].toLowerCase()}-${r[2]}.jpg` : ''; };

async function cargarPedidos() {
  const estado = $('#filtroEstado').value;
  const pedidos = await api('/pedidos' + (estado ? '?estado=' + estado : ''));
  const fecha = s => new Date(s).toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'short', timeStyle: 'short' });
  // Sin pagar se cancela solo: transferencia a las 4 h, el resto a las 2 h (venceHoras en backend/src/pedidos.ts)
  const vence = p => new Date(p.vence || new Date(p.creado).getTime() + (p.pago === 'transferencia' ? 4 : 2) * 3600_000).toLocaleTimeString('es-UY', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  $('#listaPedidos').innerHTML = pedidos.length ? pedidos.map(p => `
    <article class="card pedido" data-id="${p.id}">
      <div>
        <h3>#${p.id} · ${esc(p.nombre)}</h3>
        <p class="meta">${fecha(p.creado)}${p.estado === 'pendiente' ? (p.comprobante ? ' · <b>en revisión (no vence)</b>' : ` · <b>vence ${vence(p)}</b>`) : ''} · ${esc(p.telefono)} · ${esc(p.email)}</p>
        <p class="meta">${ENTREGA[p.entrega] || esc(p.entrega)}${p.direccion ? ' — ' + esc(p.direccion) : ''} · Pago: ${esc(PAGOS[p.pago] || p.pago)} · Ref. MANOLITO-${p.id}</p>
        ${p.comprobante ? `<p class="comprobante">📎 Comprobante recibido ${fecha(p.comprobante_subido)} · <a href="/api/admin/pedidos/${p.id}/comprobante" target="_blank" rel="noopener">Ver comprobante</a></p>` : ''}
      </div>
      <div>
        <p class="tot">${plata(p.total)}</p>${p.descuento ? `<p class="meta">Descuento ${esc(p.cupon)}: -${plata(p.descuento)}</p>` : ''}
        <select class="estado" aria-label="Estado del pedido ${p.id}">${ESTADOS.map(e => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>
        ${p.estado === 'pendiente' && p.pago !== 'mercadopago' ? '<button class="btn sm confirmar" type="button">Confirmar pago</button>' : ''}
        ${p.estado === 'pendiente' && p.pago !== 'mercadopago' && !p.comprobante ? '<button class="btn sm outline reclamar" type="button" title="Le avisa al cliente que no llegó el pago y le reenvía los datos para pagar y el link para mandar el comprobante">Reclamar pago</button>' : ''}
      </div>
      <ul>${(armados => p.items.map(l => `<li>${l.armado ? `<b>Armado ${armados.indexOf(l.armado) + 1}:</b> ` : ''}${l.cantidad} × ${esc(l.nombre)}${l.color ? ` (${esc(l.color)})` : ''}${l.nombreBebe ? ` “${esc(l.nombreBebe)}”` : ''}${l.modelo ? ` · Modelo: ${esc(l.modelo)}` : ''}${l.babero ? ` · Babero: ${esc(l.babero)}` : ''} — ${plata(l.total)}${fotoModelo(l.modelo) ? `<br><a href="${fotoModelo(l.modelo)}" target="_blank" rel="noopener" title="Ver el modelo ${esc(l.modelo)}"><img class="modelo-foto" src="${fotoModelo(l.modelo)}" alt="Modelo ${esc(l.modelo)}"></a>` : ''}</li>`).join(''))([...new Set(p.items.map(l => l.armado).filter(Boolean))])}</ul>
    </article>`).join('')
    : '<p class="empty card">No hay pedidos todavía. Van a aparecer acá cuando la web tenga checkout.</p>';

  // Pago manual: después de ver el comprobante (o la transferencia en el banco), un click
  document.querySelectorAll('.pedido .confirmar').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('.pedido').dataset.id;
    if (!confirm(`¿Confirmás que entró el pago del pedido #${id}? Se le avisa al cliente por mail.`)) return;
    try {
      await api(`/pedidos/${id}`, { method: 'PATCH', body: { estado: 'pagado' } });
      toast('Pago confirmado, se avisó al cliente ✓');
      cargarPedidos();
    } catch (err) { toast(err.message); }
  }));

  // Sin pago: se le avisa al cliente por mail (datos para pagar + link para el comprobante); si no lo manda, se cancela
  document.querySelectorAll('.pedido .reclamar').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('.pedido').dataset.id;
    if (!confirm(`¿Le mandamos un mail al cliente del pedido #${id} avisando que no llegó el pago y que, si no envía el comprobante, se cancela?`)) return;
    b.disabled = true;
    try {
      await api(`/pedidos/${id}/reclamar-comprobante`, { method: 'POST' });
      toast('Mail enviado al cliente ✓'); b.textContent = 'Reclamado ✓';
    } catch (err) { toast(err.message); b.disabled = false; }
  }));

  document.querySelectorAll('.pedido select').forEach(sel => sel.addEventListener('change', async () => {
    try {
      await api(`/pedidos/${sel.closest('.pedido').dataset.id}`, { method: 'PATCH', body: { estado: sel.value } });
      toast(sel.value === 'enviado' ? 'Estado actualizado, se avisó al cliente ✓' : 'Estado actualizado ✓');
    } catch (err) { toast(err.message); }
  }));
}

// ---------- Inicio ----------

fetch('/api/auth/yo').then(r => r.json()).then(({ usuario }) => {
  if (usuario?.rol !== 'admin') return irAlLogin();
  $('#app').hidden = false;
  abrirTab(tabActual());
  cargarNotificaciones();
  setInterval(cargarNotificaciones, 30_000);
  window.addEventListener('focus', cargarNotificaciones);
}).catch(irAlLogin);

// ---------- Notificaciones (campanita) ----------
// Cambios en pedidos que no hiciste vos. Se actualizan cada 30 s; al abrir el panel quedan como vistas

let notifs = [];
const hace = s => {
  const min = Math.round((Date.now() - new Date(s)) / 60_000);
  return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h`
    : new Date(s).toLocaleDateString('es-UY', { timeZone: 'America/Montevideo', day: 'numeric', month: 'short' });
};
function textoNotif(n) {
  const quien = `#${n.pedido}${n.nombre ? ' · ' + esc(n.nombre) : ''}`;
  if (n.accion === 'crear') return `<b>Nuevo pedido ${quien}</b> — ${plata(n.total)} · ${esc(PAGOS[n.pago] || n.pago || '')}`;
  if (n.accion === 'comprobante') return `<b>Comprobante recibido</b> en el pedido ${quien}`;
  if (n.accion === 'recordatorio') return `Se reclamó el pago del pedido ${quien}${n.autor.includes('@') ? ` (por ${esc(n.autor)})` : ''}`;
  if (n.accion === 'estado') {
    const [antes, despues] = n.cambios.estado || [];
    if (n.autor === 'mercadopago' && despues === 'pagado') return `<b>Pago confirmado</b> por Mercado Pago · pedido ${quien}`;
    if (n.autor === 'mercadopago' && despues === 'cancelado') return `<b>Devolución o contracargo</b> en Mercado Pago · pedido ${quien}`;
    if (n.autor.startsWith('sistema') && despues === 'cancelado') return `<b>Venció sin pago</b> el pedido ${quien}`;
    return `Pedido ${quien}: ${esc(antes)} → <b>${esc(despues)}</b>${n.autor.includes('@') ? ` (por ${esc(n.autor)})` : ''}`;
  }
  return `Pedido ${quien}: ${esc(n.accion)}`;
}
async function cargarNotificaciones() {
  try {
    const r = await api('/notificaciones');
    notifs = r.items;
    const badge = $('#notifN');
    badge.textContent = r.noLeidas > 99 ? '99+' : r.noLeidas; badge.hidden = !r.noLeidas;
    document.title = (r.noLeidas ? `(${r.noLeidas}) ` : '') + 'Admin — Manolito';
    if (!$('#notifPanel').hidden) pintarNotificaciones();
  } catch { /* sin conexión: se reintenta en 30 s */ }
}
function pintarNotificaciones() {
  $('#notifLista').innerHTML = notifs.length ? notifs.map(n => `
    <li><button type="button" class="${n.nueva ? 'nueva' : ''}" data-pedido="${esc(n.pedido)}">
      <span>${textoNotif(n)}</span><small>${hace(n.cuando)}</small></button></li>`).join('')
    : '<li class="empty">Todavía no hay novedades.</li>';
}
function abrirNotificaciones(si) {
  $('#notifPanel').hidden = !si; $('#notifBtn').setAttribute('aria-expanded', si);
  if (!si) return;
  pintarNotificaciones();
  // Abrir = vistas: el número se apaga; las nuevas siguen resaltadas mientras el panel está abierto
  $('#notifN').hidden = true; document.title = 'Admin — Manolito';
  api('/notificaciones/vistas', { method: 'POST' }).catch(() => {});
}
$('#notifBtn').addEventListener('click', e => { e.stopPropagation(); abrirNotificaciones($('#notifPanel').hidden); });
$('#notifPanel').addEventListener('click', e => {
  const b = e.target.closest('button[data-pedido]'); if (!b) return;
  abrirNotificaciones(false);
  $('#filtroEstado').value = '';
  abrirTab('pedidos');
  // Lleva al pedido y lo resalta cuando la lista termina de cargar
  let intentos = 0;
  const buscar = () => {
    const art = document.querySelector(`.pedido[data-id="${CSS.escape(b.dataset.pedido)}"]`);
    if (art) { art.scrollIntoView({ behavior: 'smooth', block: 'center' }); art.classList.add('resaltado'); setTimeout(() => art.classList.remove('resaltado'), 2500); }
    else if (++intentos < 20) setTimeout(buscar, 150);
  };
  buscar();
});
document.addEventListener('click', e => { if (!e.target.closest('.notif')) abrirNotificaciones(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') abrirNotificaciones(false); });

// ---------- Historial ----------

const CAMPOS = { recargoMp: 'Recargo de Mercado Pago', cupon: 'Código de descuento', descuento: 'Descuento', minimo: 'Compra mínima', usosMax: 'Usos máximos', vence: 'Vence', comprobante: 'Comprobante', datosDePago: 'Datos para pagar', precio: 'Precio', stockCargado: 'Stock', controlaStock: 'Controla stock', activo: 'Activo', estado: 'Estado', foto: 'Foto', total: 'Total', pago: 'Pago' };
const ACCIONES = { recordatorio: 'Reclamó el pago de', comprobante: 'Subió el comprobante de', crear: 'Creó', editar: 'Editó', foto: 'Cambió la foto de', estado: 'Cambió el estado de' };
const valor = (campo, x) => x === null || x === undefined ? '—' : typeof x === 'boolean' ? (x ? 'sí' : 'no')
  : campo === 'vence' && String(x).length > 10 ? new Date(x).toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' })
  : campo === 'precio' || campo === 'total' || campo === 'minimo' ? plata(x) : campo === 'pago' ? PAGOS[x] || x : campo === 'foto' ? 'imagen' : String(x);
$('#filtroHistorial').addEventListener('change', () => cargarHistorial().catch(err => toast(err.message)));

async function cargarHistorial() {
  const entidad = $('#filtroHistorial').value;
  const [filas, prods, bxs] = await Promise.all([api('/historial' + (entidad ? '?entidad=' + entidad : '')), api('/productos'), api('/boxes')]);
  const nombres = Object.fromEntries([...prods, ...bxs].map(x => [x.id, x.nombre]));
  const fecha = s => new Date(s).toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'short', timeStyle: 'short' });
  const que = h => h.entidad === 'pedido' ? `pedido #${h.entidad_id}` : h.entidad === 'ajustes' ? (h.entidad_id === 'recargo_mp' ? 'el recargo de Mercado Pago' : 'los datos para pagar') : h.entidad === 'cupon' ? `el código ${h.entidad_id}` : nombres[h.entidad_id] || h.entidad_id; // los nombres de las boxes ya dicen "Box ..."
  $('#tablaHistorial').innerHTML = filas.length ? `<thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Cambio</th></tr></thead><tbody>${filas.map(h => `
    <tr><td>${fecha(h.cuando)}</td><td class="quien">${esc(h.autor)}</td><td>${esc(ACCIONES[h.accion] || h.accion)} ${esc(que(h))}</td>
      <td class="cambio">${Object.entries(h.cambios).map(([c, [a, b]]) => `${esc(CAMPOS[c] || c)}: ${a === null ? '' : `<s>${esc(valor(c, a))}</s> → `}<b>${esc(valor(c, b))}</b>`).join('<br>')}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Todavía no hay cambios registrados.</td></tr></tbody>';
}

// ---------- Cupones ----------

async function cargarCupones() {
  const cs = await api('/cupones');
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' }); // AAAA-MM-DD en Uruguay
  const estado = c => !c.activo ? 'Pausado' : c.vence && c.vence < hoy ? 'Vencido' : c.usos_max !== null && c.usos >= c.usos_max ? 'Agotado' : 'Activo';
  $('#tablaCupones').innerHTML = cs.length ? `<thead><tr><th>Código</th><th>Descuento</th><th>Compra mínima</th><th>Usos</th><th>Vence</th><th>Estado</th><th>Activo</th></tr></thead><tbody>${cs.map(c => `
    <tr data-codigo="${esc(c.codigo)}"><td><b>${esc(c.codigo)}</b></td><td>${c.tipo === 'porcentaje' ? c.valor + '%' : plata(c.valor)}</td>
      <td>${c.minimo ? plata(c.minimo) : '—'}</td><td>${c.usos}${c.usos_max !== null ? ' / ' + c.usos_max : ''}</td>
      <td>${c.vence ? ddmm(c.vence) + '/' + c.vence.slice(0, 4) : '—'}</td><td>${estado(c)}</td>
      <td><label class="switch"><input type="checkbox" ${c.activo ? 'checked' : ''}> <span>${c.activo ? 'Sí' : 'No'}</span></label></td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Todavía no hay códigos. Creá el primero arriba.</td></tr></tbody>';
  document.querySelectorAll('#tablaCupones input[type=checkbox]').forEach(cb => cb.addEventListener('change', async () => {
    try {
      await api('/cupones/' + encodeURIComponent(cb.closest('tr').dataset.codigo), { method: 'PATCH', body: { activo: cb.checked } });
      toast(cb.checked ? 'Código activado ✓' : 'Código pausado ✓'); cargarCupones();
    } catch (err) { toast(err.message); cb.checked = !cb.checked; }
  }));
}
$('#formCupon').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements, num = v => (v === '' ? null : Number(v));
  try {
    await api('/cupones', { method: 'POST', body: {
      codigo: f.codigo.value, tipo: f.tipo.value, valor: Number(f.valor.value), minimo: num(f.minimo.value) ?? 0,
      usosMax: num(f.usosMax.value), vence: f.vence.value || null,
    } });
    toast('Código creado ✓'); e.target.reset(); cargarCupones();
  } catch (err) { toast(err.message); }
});

// ---------- Ajustes: recargo de Mercado Pago ----------

$('#formRecargo').elements.activo.addEventListener('change', e => { $('#formRecargo').elements.porcentaje.disabled = !e.target.checked; });
$('#formRecargo').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    await api('/ajustes/recargo-mp', { method: 'PUT', body: { activo: f.activo.checked, porcentaje: Number(f.porcentaje.value) } });
    toast(f.activo.checked ? `Recargo de ${f.porcentaje.value}% guardado ✓` : 'Recargo apagado ✓');
  } catch (err) { toast(err.message); }
});

// ---------- Ajustes: datos para pagar ----------

async function cargarAjustes() {
  const r = await api('/ajustes/recargo-mp');
  const fr = $('#formRecargo');
  fr.elements.activo.checked = r.activo; fr.elements.porcentaje.value = r.porcentaje; fr.elements.porcentaje.disabled = !r.activo;
  const a = await api('/ajustes/pagos');
  const f = $('#formPagos');
  for (const [k, v] of Object.entries(a.transferencia)) f.elements['t_' + k].value = v;
  f.elements.abitab.value = a.abitab_redpagos.texto;
  f.elements.prex.value = a.prex_midinero.texto;
}
$('#formPagos').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, t = k => f.elements['t_' + k].value;
  try {
    await api('/ajustes/pagos', { method: 'PUT', body: {
      transferencia: { banco: t('banco'), sucursal: t('sucursal'), tipoCuenta: t('tipoCuenta'), cuenta: t('cuenta'), cuentaOtrosBancos: t('cuentaOtrosBancos'), titular: t('titular'), documento: t('documento') },
      abitab_redpagos: { texto: f.elements.abitab.value }, prex_midinero: { texto: f.elements.prex.value },
    } });
    toast('Datos guardados ✓');
  } catch (err) { toast(err.message); }
});

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
  if (r.status === 401 && path !== '/login') { mostrar('login'); throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(data.detalles ? data.detalles.join(', ') : data.error || 'Error');
  return data;
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------- Login ----------

function mostrar(cual) {
  $('#login').hidden = cual !== 'login';
  $('#app').hidden = cual !== 'app';
  if (cual === 'login') $('#loginPass').focus();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    await api('/login', { method: 'POST', body: { password: $('#loginPass').value } });
    $('#loginPass').value = '';
    mostrar('app'); abrirTab(tabActual());
  } catch (err) { $('#loginError').textContent = err.message; }
});

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  mostrar('login');
});

// ---------- Pestañas ----------

const CARGAR = { resumen: cargarResumen, productos: cargarProductos, boxes: cargarBoxes, pedidos: cargarPedidos };
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

  $('#kpis').innerHTML = [
    ['Visitas', t.visita], ['Clicks a Instagram', t.instagram], ['Boxes vistas', t.box_ver],
    ['Armados enviados', t.arma_enviar], ['Pedidos', pedidos], ['Facturado', plata(facturado)],
  ].map(([k, v]) => `<div class="kpi"><small>${k}</small><b>${typeof v === 'string' ? v : (v || 0).toLocaleString('es-UY')}</b></div>`).join('');

  grafico(d.visitasPorDia);
  ranking('#topPaginas', d.paginas, r => (r.ref === '/' || r.ref === '/index.html' ? 'Inicio' : r.ref.replace(/^\//, '').replace('.html', '')));
  ranking('#topBoxes', d.boxesVistas, r => r.ref);
  ranking('#topProductos', d.productosAgregados, r => nombre[r.ref] || r.ref);

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

function ranking(sel, filas, etiqueta) {
  const max = Math.max(1, ...filas.map(f => f.n));
  $(sel).innerHTML = filas.length
    ? `<div class="rank">${filas.map(f => `<div class="rank-row"><span>${esc(etiqueta(f))}</span><b>${f.n}</b><div class="track"><div class="fill" style="width:${(f.n / max) * 100}%"></div></div></div>`).join('')}</div>`
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
        ${conStock ? `<td><input type="number" name="stock" min="0" placeholder="∞" value="${p.stock ?? ''}" aria-label="Stock de ${esc(p.nombre)}"></td>` : ''}
        <td><label class="switch"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> <span>${p.activo ? 'Sí' : 'No'}</span></label></td>
        <td><button class="btn sm" disabled>Guardar</button></td>
      </tr>`).join('')}</tbody>`;

  t.querySelectorAll('tbody tr').forEach(tr => {
    const btn = tr.querySelector('.btn');
    const campo = n => tr.querySelector(`[name=${n}]`);
    tr.addEventListener('input', () => { btn.disabled = false; });

    btn.addEventListener('click', async () => {
      const body = { precio: Number(campo('precio').value), activo: campo('activo').checked };
      if (conStock) body.stock = campo('stock').value === '' ? null : Number(campo('stock').value);
      try {
        const p = await api(`/${tipo}/${tr.dataset.id}`, { method: 'PATCH', body });
        btn.disabled = true;
        tr.classList.toggle('off', !p.activo);
        tr.querySelector('.switch span').textContent = p.activo ? 'Sí' : 'No';
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
const ENTREGA = { cadeteria: 'Cadetería', pickup: 'Pick-up Cordón', interior: 'Interior' };
$('#filtroEstado').addEventListener('change', () => cargarPedidos().catch(err => toast(err.message)));

async function cargarPedidos() {
  const estado = $('#filtroEstado').value;
  const pedidos = await api('/pedidos' + (estado ? '?estado=' + estado : ''));
  const fecha = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'short', timeStyle: 'short' });
  $('#listaPedidos').innerHTML = pedidos.length ? pedidos.map(p => `
    <article class="card pedido" data-id="${p.id}">
      <div>
        <h3>#${p.id} · ${esc(p.nombre)}</h3>
        <p class="meta">${fecha(p.creado)} · ${esc(p.telefono)} · ${esc(p.email)}</p>
        <p class="meta">${ENTREGA[p.entrega] || esc(p.entrega)}${p.direccion ? ' — ' + esc(p.direccion) : ''} · Pago: ${esc(p.pago)}</p>
      </div>
      <div>
        <p class="tot">${plata(p.total)}</p>
        <select class="estado" aria-label="Estado del pedido ${p.id}">${ESTADOS.map(e => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>
      </div>
      <ul>${p.items.map(l => `<li>${l.cantidad} × ${esc(l.nombre)}${l.color ? ` (${esc(l.color)})` : ''}${l.nombreBebe ? ` “${esc(l.nombreBebe)}”` : ''} — ${plata(l.total)}</li>`).join('')}</ul>
    </article>`).join('')
    : '<p class="empty card">No hay pedidos todavía. Van a aparecer acá cuando la web tenga checkout.</p>';

  document.querySelectorAll('.pedido select').forEach(sel => sel.addEventListener('change', async () => {
    try {
      await api(`/pedidos/${sel.closest('.pedido').dataset.id}`, { method: 'PATCH', body: { estado: sel.value } });
      toast(sel.value === 'enviado' ? 'Estado actualizado, se avisó al cliente ✓' : 'Estado actualizado ✓');
    } catch (err) { toast(err.message); }
  }));
}

// ---------- Inicio ----------

api('/yo').then(() => { mostrar('app'); abrirTab(tabActual()); }).catch(() => mostrar('login'));

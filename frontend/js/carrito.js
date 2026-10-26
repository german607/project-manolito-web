// Carrito compartido entre páginas: vive en localStorage y se muestra en un panel lateral (derecha).
// Los precios siempre los calcula el servidor (/api/carrito).
(function(){
  var KEY='manolito-carrito';
  // Las boxes guardadas antes de que se eligieran color y modelo de portachupete ya no se pueden comprar: se descartan solas
  function leer(){try{return (JSON.parse(localStorage.getItem(KEY))||[]).filter(function(it){return it.tipo!=='box'||(it.color&&it.modelo&&!/^N° /.test(it.babero||''));});}catch(e){return [];}}
  function guardar(items){
    try{localStorage.setItem(KEY,JSON.stringify(items));}catch(e){}
    contador(); window.dispatchEvent(new Event('carrito'));
  }
  function igual(a,b){return a.tipo===b.tipo&&a.id===b.id&&(a.color||'')===(b.color||'')&&(a.nombreBebe||'')===(b.nombreBebe||'')&&(a.modelo||'')===(b.modelo||'')&&(a.babero||'')===(b.babero||'')&&(a.estampado||'')===(b.estampado||'')&&(a.armado||'')===(b.armado||'');}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function plata(n){return '$'+Number(n||0).toLocaleString('es-UY');}

  function contador(){
    var n=leer().reduce(function(s,i){return s+i.cantidad;},0);
    document.querySelectorAll('.cart-count').forEach(function(el){el.textContent=n;el.hidden=!n;});
  }

  function cotizar(pago,cupon){
    return fetch('/api/carrito',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:leer(),pago:pago||'transferencia',cupon:cupon||undefined})})
      .then(function(r){if(!r.ok)throw new Error('No pudimos cargar los precios. Probá de nuevo en un rato.');return r.json();});
  }

  // Líneas del carrito; editable = con cantidades y "Quitar"
  function lineasHTML(items,c,editable){
    var armados=[]; items.forEach(function(it){if(it.armado&&armados.indexOf(it.armado)<0)armados.push(it.armado);});
    var porI={},avI={};
    c.lineas.forEach(function(l){porI[l.i]=l;});
    c.avisos.forEach(function(a){avI[a.i]=a;});
    return items.map(function(it,i){
      var l=porI[i], av=avI[i];
      var detalle=[it.armado?'Armado '+(armados.indexOf(it.armado)+1):'',it.color==='Estampada'&&it.estampado?'Estampada: '+it.estampado:it.color,it.nombreBebe?'“'+it.nombreBebe+'”':'',it.modelo&&window.modeloPublico?modeloPublico(it.modelo):it.modelo,it.babero?'Babero '+it.babero.toLowerCase():''].filter(Boolean).join(' · ');
      return '<article class="cart-line'+(av?' bad':'')+(editable?'':' ro')+'" data-i="'+i+'">'+
        (it.tipo==='producto'&&window.fotoModelo&&fotoModelo(it.modelo)?'<img src="'+esc(fotoModelo(it.modelo))+'" alt="">':l&&l.foto?'<img src="'+esc(l.foto)+'" alt="">':'<div class="cart-ph"></div>')+ // portachupete: la foto del modelo elegido
        '<div class="cart-info"><h4>'+esc(l?l.nombre:(av&&av.nombre)||'Producto no disponible')+'</h4>'+
          (detalle?'<p class="cart-meta">'+esc(detalle)+'</p>':'')+
          (av?'<p class="cart-error">'+esc(av.error)+'</p>':
           editable?'<div class="qty"><button type="button" data-d="-1" aria-label="Uno menos">−</button><span>'+it.cantidad+'</span><button type="button" data-d="1" aria-label="Uno más">+</button></div>':
           '<p class="cart-meta">Cantidad: '+it.cantidad+'</p>')+
        '</div>'+
        '<div class="cart-price">'+(l?'<b>'+plata(l.total)+'</b>':'')+(editable?'<button type="button" class="cart-remove">Quitar</button>':'')+'</div>'+
      '</article>';
    }).join('');
  }

  // ---------- Panel lateral ----------
  var panel, overlay, abierto=false, volverA=null;

  function crearPanel(){
    overlay=document.createElement('div'); overlay.className='drawer-overlay';
    panel=document.createElement('aside');
    panel.className='drawer'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','drawerTitle'); panel.setAttribute('aria-hidden','true');
    panel.innerHTML=
      '<header class="drawer-head"><h3 id="drawerTitle">Tu carrito</h3><button type="button" class="drawer-close" aria-label="Cerrar carrito">&times;</button></header>'+
      '<div class="drawer-body" id="drawerLines"></div>'+
      '<footer class="drawer-foot" id="drawerFoot">'+
        '<div class="cart-total"><span>Subtotal</span><b id="drawerSub">$0</b></div>'+
        '<p class="cart-error" id="drawerError"></p>'+
        '<a class="btn btn-green" id="drawerGo" href="checkout.html">Ir al checkout</a>'+
        '<p class="cart-note">El envío y el medio de pago se eligen en el checkout.</p>'+
      '</footer>';
    document.body.appendChild(overlay); document.body.appendChild(panel);

    overlay.addEventListener('click',cerrar);
    panel.querySelector('.drawer-close').addEventListener('click',cerrar);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&abierto)cerrar();});
    // En la página de checkout el botón solo cierra el panel
    panel.querySelector('#drawerGo').addEventListener('click',function(e){
      if(/checkout\.html$/.test(location.pathname)){e.preventDefault();cerrar();}
    });
    panel.querySelector('#drawerLines').addEventListener('click',function(e){
      var line=e.target.closest('.cart-line'), b=e.target.closest('button'); if(!line||!b) return;
      var items=leer(), i=+line.dataset.i;
      if(b.classList.contains('cart-remove')) items.splice(i,1);
      else if(b.dataset.d) items[i].cantidad=Math.max(1,Math.min(20,items[i].cantidad+(+b.dataset.d)));
      guardar(items);
    });
  }

  function pintarPanel(){
    var items=leer(), cuerpo=panel.querySelector('#drawerLines');
    panel.querySelector('#drawerFoot').hidden=!items.length;
    if(!items.length){
      cuerpo.innerHTML='<div class="drawer-empty"><p>Tu carrito está vacío.</p><a class="btn btn-outline btn-sm" href="index.html#boxes">Ver boxes</a><a class="btn btn-outline btn-sm" href="arma-tu-box.html">Armá tu box</a></div>';
      return;
    }
    cotizar().then(function(c){
      cuerpo.innerHTML=lineasHTML(items,c,true);
      panel.querySelector('#drawerSub').textContent=plata(c.subtotal);
      var malos=c.avisos.length;
      panel.querySelector('#drawerError').textContent=malos?'Quitá los productos marcados para continuar.':'';
      panel.querySelector('#drawerGo').classList.toggle('disabled',!!malos);
    }).catch(function(err){cuerpo.innerHTML='<p class="cart-error">'+esc(err.message)+'</p>';});
  }

  function abrir(){
    if(!panel) crearPanel();
    volverA=document.activeElement;
    pintarPanel();
    abierto=true;
    panel.setAttribute('aria-hidden','false');
    panel.classList.add('open'); overlay.classList.add('open');
    document.body.style.overflow='hidden';
    panel.querySelector('.drawer-close').focus();
  }
  function cerrar(){
    abierto=false;
    panel.setAttribute('aria-hidden','true');
    panel.classList.remove('open'); overlay.classList.remove('open');
    document.body.style.overflow='';
    if(volverA&&volverA.focus) volverA.focus();
  }

  window.addEventListener('carrito',function(){if(abierto)pintarPanel();});
  window.addEventListener('storage',function(e){if(e.key===KEY){contador();window.dispatchEvent(new Event('carrito'));}}); // otra pestaña

  // El ícono del header abre el panel (sin JS, el link lleva al checkout)
  document.querySelectorAll('.cart-link:not(.cuenta-link)').forEach(function(a){
    a.addEventListener('click',function(e){e.preventDefault();abrir();});
  });

  window.Carrito={
    items:leer,
    guardar:guardar,
    vaciar:function(){guardar([]);},
    cotizar:cotizar,
    lineasHTML:lineasHTML,
    abrir:abrir,
    // Popup que bloquea la compra: lista lo que falta completar
    aviso:function(faltan){
      if(!window.HTMLDialogElement){alert('Falta completar:\n- '+faltan.join('\n- '));return;} // navegadores viejos
      var d=document.getElementById('avisoFalta');
      if(!d){
        d=document.createElement('dialog'); d.id='avisoFalta'; d.className='aviso';
        d.innerHTML='<h3>Antes de agregarlo al carrito</h3><p>Falta completar:</p><ul></ul><button type="button" class="btn btn-green" style="width:100%">Entendido</button>';
        d.querySelector('button').addEventListener('click',function(){d.close();});
        d.addEventListener('click',function(e){if(e.target===d)d.close();});
        document.body.appendChild(d);
      }
      d.querySelector('ul').innerHTML=faltan.map(function(f){return '<li>'+esc(f)+'</li>';}).join('');
      d.showModal();
    },
    // item: {tipo:'producto'|'box', id, cantidad?, color?, nombreBebe?}. Abre el panel para mostrar lo agregado.
    agregar:function(item){
      var items=leer(), nuevo={tipo:item.tipo,id:item.id,cantidad:item.cantidad||1};
      if(item.color) nuevo.color=item.color;
      if(item.nombreBebe) nuevo.nombreBebe=item.nombreBebe;
      if(item.modelo) nuevo.modelo=item.modelo;
      if(item.babero) nuevo.babero=item.babero;
      if(item.estampado) nuevo.estampado=item.estampado;
      if(item.armado) nuevo.armado=item.armado; // productos de un mismo "Armá tu box"
      var ya=items.filter(function(x){return igual(x,nuevo);})[0];
      if(ya) ya.cantidad=Math.min(20,ya.cantidad+nuevo.cantidad); else items.push(nuevo);
      guardar(items);
    }
  };

  contador();
})();

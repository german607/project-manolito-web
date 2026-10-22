(function(){
  var root=document.getElementById('portaBuy'); if(!root) return;
  var N={Silicona:19,Madera:9}, BASE=790, INC=5, EXTRA=20;
  var mat='Silicona', lam=0;
  var tabs=root.querySelector('.pb-tabs'), grid=root.querySelector('.pb-grid'), nameI=root.querySelector('#pbName'),
      detI=root.querySelector('#pbDet'), priceE=root.querySelector('#pbPrice'), hintE=root.querySelector('#pbHint'),
      selE=root.querySelector('#pbSel'), add=root.querySelector('#pbAdd'), toastE=root.querySelector('#pbToast');
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
  function letras(s){return (s||'').replace(/\s+/g,'').length;}
  function precio(){var l=letras(nameI.value);return BASE+(l>INC?(l-INC)*EXTRA:0);}
  function toast(m){toastE.textContent=m;toastE.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){toastE.classList.remove('show');},4000);}
  // Foto grande al tocar un modelo (el modelo también queda elegido); se cierra con la cruz, Esc o tocando afuera
  var zoom;
  function ver(src,titulo){
    if(!window.HTMLDialogElement) return;
    if(!zoom){
      zoom=document.createElement('dialog'); zoom.className='pz';
      zoom.innerHTML='<button type="button" class="pz-x" aria-label="Cerrar">&times;</button><img alt=""><p></p>';
      zoom.querySelector('.pz-x').onclick=function(){zoom.close();};
      zoom.addEventListener('click',function(e){if(e.target===zoom)zoom.close();});
      document.body.appendChild(zoom);
    }
    zoom.querySelector('img').src=src; zoom.querySelector('img').alt='Portachupete '+titulo;
    zoom.querySelector('p').textContent='Elegiste: '+titulo;
    zoom.showModal();
  }
  function pintar(){
    tabs.innerHTML=''; grid.innerHTML='';
    Object.keys(N).forEach(function(m){
      var b=el('button','chip'+(m===mat?' sel':''),m+' ('+N[m]+' modelos)'); b.type='button';
      b.onclick=function(){mat=m;lam=0;pintar();}; tabs.appendChild(b);
    });
    for(var n=1;n<=N[mat];n++){(function(n){
      var f=el('button','pm-img'+(n===lam?' sel':'')); f.type='button'; f.setAttribute('aria-label','Elegir modelo '+n+' de '+mat);
      var im=document.createElement('img'); im.loading='lazy'; im.alt='Portachupete de '+mat.toLowerCase()+', modelo '+n;
      im.src='assets/img/portachupetes/modelos/'+mat.toLowerCase()+'-'+n+'.jpg'; f.appendChild(im);
      f.appendChild(el('span','pm-tag',(n===lam?'✓ ':'')+'N° '+n));
      f.onclick=function(){lam=n;pintar();ver(im.src,mat+' N° '+n);}; grid.appendChild(f);
    })(n);}
    selE.textContent=lam?'Elegiste: '+mat+' N° '+lam:'Todavía no elegiste modelo';
    selE.classList.toggle('ok',!!lam);
  }
  function upd(){
    var l=letras(nameI.value), p=precio();
    priceE.textContent='$'+p;
    hintE.textContent=!l?'Hasta '+INC+' letras incluidas · $'+EXTRA+' por letra extra':
      l+(l===1?' letra':' letras')+(l>INC?' · '+(l-INC)+' extra × $'+EXTRA:' · incluidas en el precio base');
  }
  nameI.addEventListener('input',upd);
  add.addEventListener('click',function(){
    var nombre=nameI.value.trim();
    var faltan=[];
    if(!lam) faltan.push('El modelo (tocá una foto para elegirlo)');
    if(!nombre) faltan.push('El nombre del bebé');
    if(faltan.length&&window.Carrito){Carrito.aviso(faltan);return;}
    if(faltan.length){toast('Falta: '+faltan.join(' y ').toLowerCase()+'.');return;}
    var modelo=mat+' N° '+lam+(detI.value.trim()?' — '+detI.value.trim():'');
    if(window.Carrito){
      Carrito.agregar({tipo:'producto',id:'porta',nombreBebe:nombre,modelo:modelo});
      Carrito.abrir(); if(window.track) track('carrito_agregar','porta');
    }else{toast('Listo: '+modelo+' · "'+nombre+'" · $'+precio()+' (en el sitio real se suma al carrito).');}
  });
  pintar(); upd();
  // Precio base desde el admin; si la API no responde queda el de arriba
  try{fetch('/api/productos').then(function(r){return r.ok?r.json():[];}).then(function(l){
    l.forEach(function(d){if(d.id==='porta'){BASE=d.precio;
      if(d.agotado||d.stock===0){add.disabled=true;add.textContent='Sin stock';}upd();}});
  }).catch(function(){});}catch(e){}
})();

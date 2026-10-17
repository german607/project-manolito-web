(function(){
  var $=function(id){return document.getElementById(id);};
  var volver=new URLSearchParams(location.search).get('volver');
  // Solo rutas del propio sitio: "/algo", nunca "//otro-sitio.com" ni "https://..." (evita usar el login para redirigir a una página falsa)
  if(volver&&!/^\/(?![\/\\])/.test(volver)) volver=null;
  var pideAdmin=volver&&/^\/admin/.test(volver);

  function destino(u){
    if(volver&&(!pideAdmin||u.rol==='admin')) return volver;
    return u.rol==='admin'?'admin/':'index.html';
  }

  function mostrarLogueado(u){
    $('cuentaForms').hidden=true; $('cuentaLogueado').hidden=false;
    $('cuentaNombre').textContent=u.nombre;
    $('cuentaEmail').textContent=u.email;
    $('irPanel').hidden=u.rol!=='admin';
    $('seguirComprando').hidden=u.rol==='admin';
  }

  // ---- Pestañas: Ingresar / Crear cuenta ----
  function tab(cual){
    document.querySelectorAll('.cuenta-tabs button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===cual);});
    $('formIngresar').hidden=cual!=='ingresar';
    $('formRegistro').hidden=cual!=='registro';
    var f=cual==='ingresar'?$('formIngresar'):$('formRegistro');
    f.querySelector('input').focus();
  }
  document.querySelectorAll('.cuenta-tabs button').forEach(function(b){b.addEventListener('click',function(){tab(b.dataset.tab);});});

  // ---- Envío de los formularios ----
  function enviar(form,url,cuerpo){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var err=form.querySelector('.cart-error'); err.textContent='';
      if(!form.reportValidity()) return;
      var btn=form.querySelector('button[type=submit]'), texto=btn.textContent; btn.disabled=true; btn.textContent='Un momento…';
      fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo(form))})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.detalles?d.detalles.map(function(x){return x.replace(/^[a-z]+: /,'');}).join(' · '):d.error);return d;});})
        .then(function(d){
          if(pideAdmin&&d.usuario.rol!=='admin'){mostrarLogueado(d.usuario);return;}
          location.href=destino(d.usuario);
        })
        .catch(function(e){err.textContent=e.message||'No pudimos conectarnos. Probá de nuevo.';})
        .then(function(){btn.disabled=false;btn.textContent=texto;});
    });
  }
  enviar($('formIngresar'),'/api/auth/login',function(f){return {email:f.email.value,password:f.password.value};});
  enviar($('formRegistro'),'/api/auth/registro',function(f){return {nombre:f.nombre.value,email:f.email.value,password:f.password.value};});

  $('salir').addEventListener('click',function(){
    fetch('/api/auth/logout',{method:'POST'}).catch(function(){}).then(function(){location.href='index.html';});
  });

  // ---- Al abrir: ¿ya hay sesión? ----
  if(pideAdmin){$('cuentaAviso').textContent='Ingresá con la cuenta de administrador para ver el panel.';$('cuentaAviso').hidden=false;}
  if(location.hash==='#registro') tab('registro');
  fetch('/api/auth/yo').then(function(r){return r.json();}).then(function(d){
    var u=d.usuario; if(!u) return;
    if(pideAdmin&&u.rol==='admin'){location.replace(volver);return;}
    if(!pideAdmin) mostrarLogueado(u);
  }).catch(function(){});
})();

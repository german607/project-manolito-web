(function(){
  var $=function(id){return document.getElementById(id);};
  function plata(n){return '$'+Number(n||0).toLocaleString('es-UY');}
  var form=$('checkout'), cot=null;

  function mostrar(cual){
    $('checkoutVacio').hidden=cual!=='vacio';
    $('checkoutLleno').hidden=cual!=='lleno';
    $('checkoutGracias').hidden=cual!=='gracias';
  }

  function pago(){var r=form.querySelector('input[name=pago]:checked');return r?r.value:'transferencia';}
  function entrega(){return form.querySelector('input[name=entrega]:checked').value;}

  // ---- Resumen del pedido (se edita desde el panel del carrito) ----
  function cotizar(){
    var items=Carrito.items();
    if(!items.length){mostrar('vacio');return;}
    mostrar('lleno');
    Carrito.cotizar(pago()).then(function(c){
      cot=c;
      $('resumenLineas').innerHTML=Carrito.lineasHTML(items,c,false);
      $('payMP').hidden=!c.mercadopago;
      if(!c.mercadopago&&pago()==='mercadopago'){form.querySelector('input[name=pago][value=transferencia]').checked=true;cotizar();return;}
      $('totSub').textContent=plata(c.subtotal);
      $('rowRecargo').hidden=!c.recargo; $('totRecargo').textContent=plata(c.recargo);
      $('totTotal').textContent=plata(c.total);
      $('cartError').textContent=c.avisos.length?'Hay productos con problemas: tocá "Editar" y quitalos.':'';
    }).catch(function(err){$('resumenLineas').innerHTML='<p class="cart-error">'+err.message+'</p>';});
  }
  window.addEventListener('carrito',cotizar);
  $('editarCarrito').addEventListener('click',function(){Carrito.abrir();});

  // ---- Formulario ----
  function actualizarDireccion(){
    var pick=entrega()==='pickup';
    $('dirWrap').hidden=pick; form.direccion.required=!pick;
  }
  form.addEventListener('change',function(e){
    if(e.target.name==='entrega') actualizarDireccion();
    if(e.target.name==='pago') cotizar();
  });
  actualizarDireccion();

  form.addEventListener('submit',function(e){
    e.preventDefault();
    $('cartError').textContent='';
    if(!form.reportValidity()) return;
    if(!cot||cot.avisos.length){$('cartError').textContent='Hay productos con problemas: tocá "Editar" y quitalos.';return;}
    var btn=$('confirmar'); btn.disabled=true; btn.textContent='Enviando…';
    var body={
      cliente:{nombre:form.nombre.value,telefono:form.telefono.value,email:form.email.value,direccion:entrega()==='pickup'?undefined:form.direccion.value},
      entrega:entrega(), pago:pago(), items:Carrito.items()
    };
    fetch('/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.detalles?d.detalles.join(' · '):d.error);return d;});})
      .then(function(d){
        window.removeEventListener('carrito',cotizar);
        Carrito.vaciar();
        if(d.pagoUrl){location.href=d.pagoUrl;return;}
        gracias(d.id,'¡Gracias! Recibimos tu pedido.','Total: '+plata(d.total)+'. Te mandamos el detalle a '+body.cliente.email+'.',d.instrucciones);
      })
      .catch(function(err){$('cartError').textContent=err.message||'No pudimos enviar el pedido. Probá de nuevo.';})
      .then(function(){btn.disabled=false;btn.textContent='Confirmar pedido';});
  });

  function gracias(id,titulo,texto,extra){
    window.removeEventListener('carrito',cotizar);
    mostrar('gracias');
    $('gTitulo').textContent=titulo;
    $('gNumero').textContent='Pedido #'+id;
    $('gTexto').textContent=texto;
    $('gExtra').textContent=extra||''; $('gExtra').hidden=!extra;
    window.scrollTo(0,0);
  }

  // ---- Vuelta desde Mercado Pago: checkout.html?pedido=ID&pago=ok|pendiente|error ----
  var q=new URLSearchParams(location.search);
  if(q.get('pedido')){
    var id=q.get('pedido'), st=q.get('pago');
    if(st==='ok') gracias(id,'¡Pago recibido!','Gracias por tu compra. Te mandamos el detalle por mail.');
    else if(st==='pendiente') gracias(id,'Tu pago está pendiente','Cuando Mercado Pago lo confirme te avisamos por mail.');
    else gracias(id,'El pago no se completó','Tu pedido quedó guardado. Escribinos por Instagram y lo coordinamos por otro medio.');
  } else cotizar();
})();

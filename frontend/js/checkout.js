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
  var contado=false;
  function cotizar(){
    var items=Carrito.items();
    if(!items.length){mostrar('vacio');return;}
    if(!contado){contado=true;track('checkout');} // embudo: llegó al checkout con algo en el carrito
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

  // Con sesión iniciada, el pedido queda en la cuenta y se completan nombre y email
  fetch('/api/auth/yo').then(function(r){return r.json();}).then(function(d){
    var u=d.usuario; if(!u) return;
    if(!form.nombre.value) form.nombre.value=u.nombre;
    if(!form.email.value) form.email.value=u.email;
  }).catch(function(){});

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
        gracias(d.id,'¡Gracias! Recibimos tu pedido.','Total: '+plata(d.total)+'. Te mandamos el detalle a '+body.cliente.email+'.',d.datos?'':d.instrucciones);
        if(d.token) pagoManual(d.id,d.token,{total:d.total,estado:'pendiente',comprobante:false,datos:d.datos,vence:new Date(Date.now()+2*3600e3)});
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

  // ---- Pago manual (transferencia, Abitab, Prex): datos para pagar y comprobante ----
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
  function hora(f){return new Date(f).toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit'});}
  function pagoManual(id,token,info){
    var box=$('gPago'); box.innerHTML=''; box.hidden=false;
    if(info.estado==='pagado'||info.estado==='enviado'||info.estado==='entregado'){box.appendChild(el('p','pm-ok','✓ El pago de este pedido ya está confirmado.'));return;}
    if(info.estado==='cancelado'){box.appendChild(el('p','pm-aviso','Este pedido venció sin pago. Si todavía lo querés, hacelo de nuevo o escribinos por Instagram.'));return;}
    if(info.datos){
      box.appendChild(el('h4',null,info.datos.titulo));
      if(info.datos.texto) box.appendChild(el('p','pm-texto',info.datos.texto));
      var lista=el('dl','pm-campos');
      info.datos.campos.forEach(function(c){
        var fila=el('div','pm-campo'); fila.appendChild(el('dt',null,c.etiqueta));
        var dd=el('dd'); dd.appendChild(el('span',null,c.valor));
        var b=el('button','pm-copiar','Copiar'); b.type='button';
        b.addEventListener('click',function(){
          var v=c.valor.replace(/^\$/,''); // el monto se copia sin el signo
          (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){b.textContent='¡Copiado!';setTimeout(function(){b.textContent='Copiar';},1500);},function(){b.textContent='Seleccionalo y copialo';});
        });
        dd.appendChild(b); fila.appendChild(dd); lista.appendChild(fila);
      });
      box.appendChild(lista);
    }
    var estado=el('p','pm-estado');
    if(info.comprobante) estado.textContent='✓ Recibimos tu comprobante. Lo revisamos y te avisamos por mail. Mientras tanto el pedido no vence.';
    else estado.textContent='Tenés hasta las '+hora(info.vence)+' para pagar. Cuando pagues, subí el comprobante: así el pedido no vence mientras lo revisamos.';
    box.appendChild(estado);
    var subir=el('label','btn btn-outline pm-subir',info.comprobante?'Reemplazar comprobante':'Subir comprobante (foto o PDF)');
    var input=el('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp,application/pdf'; input.hidden=true;
    subir.appendChild(input); box.appendChild(subir);
    var msj=el('p','cart-error'); box.appendChild(msj);
    input.addEventListener('change',function(){
      var f=input.files[0]; if(!f) return; msj.textContent='';
      if(f.size>5*1024*1024){msj.textContent='El archivo pesa más de 5 MB. Probá con una captura de pantalla.';return;}
      subir.firstChild.textContent='Subiendo…';
      fetch('/api/pedidos/'+id+'/comprobante?t='+token,{method:'PUT',headers:{'Content-Type':f.type||'application/octet-stream'},body:f})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error);});})
        .then(function(){info.comprobante=true;pagoManual(id,token,info);})
        .catch(function(e){subir.firstChild.textContent=info.comprobante?'Reemplazar comprobante':'Subir comprobante (foto o PDF)';msj.textContent=e.message||'No se pudo subir. Probá de nuevo.';});
      input.value='';
    });
  }

  // ---- Vuelta desde Mercado Pago: checkout.html?pedido=ID&payment_id=...&status=... ----
  // Lo que dice la URL no se cree: el servidor consulta el pago a Mercado Pago y devuelve el estado real
  var q=new URLSearchParams(location.search);
  function noSeCompleto(id){gracias(id,'El pago no se completó','Tu pedido quedó guardado: podés volver a intentarlo dentro de las 2 horas, o escribinos por Instagram y lo coordinamos por otro medio.');}
  // Link del mail de un pago manual: checkout.html?pedido=ID&t=TOKEN
  if(q.get('pedido')&&q.get('t')){
    var pidM=q.get('pedido'), tok=q.get('t');
    gracias(pidM,'Tu pedido','Cargando…');
    fetch('/api/pedidos/'+encodeURIComponent(pidM)+'/pago?t='+encodeURIComponent(tok)).then(function(r){if(!r.ok)throw new Error();return r.json();})
      .then(function(d){$('gTexto').textContent='Total: '+plata(d.total)+'.';pagoManual(d.id,tok,d);})
      .catch(function(){gracias(pidM,'No encontramos el pedido','Revisá el link del mail o escribinos por Instagram.');});
    return;
  }
  if(q.get('pedido')){
    var id=q.get('pedido'), pid=q.get('payment_id')||q.get('collection_id');
    if(!pid||pid==='null'){noSeCompleto(id);return;}
    gracias(id,'Confirmando tu pago…','Un momento, estamos verificando con Mercado Pago.');
    fetch('/api/mercadopago/confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentId:pid})})
      .then(function(r){if(!r.ok)throw new Error();return r.json();})
      .then(function(d){
        if(d.estado==='pagado'||d.estado==='enviado'||d.estado==='entregado') gracias(id,'¡Pago recibido!','Gracias por tu compra. Te mandamos el detalle por mail.');
        else if(d.pago==='pending'||d.pago==='in_process') gracias(id,'Tu pago está pendiente','Cuando Mercado Pago lo confirme te avisamos por mail.');
        else noSeCompleto(id);
      })
      .catch(function(){gracias(id,'No pudimos confirmar el pago todavía','Si Mercado Pago te lo cobró, en unos minutos te llega la confirmación por mail. Si no, escribinos por Instagram.');});
  } else cotizar();
})();

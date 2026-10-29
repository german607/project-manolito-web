(function(){
  var $=function(id){return document.getElementById(id);};
  function plata(n){return '$'+Number(n||0).toLocaleString('es-UY');}
  var form=$('checkout'), cot=null, cupon='';

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
    Carrito.cotizar(pago(),cupon).then(function(c){
      cot=c;
      // Código de descuento: aplicado, o el motivo por el que no sirve
      var msg=$('cuponMsg');
      if(c.cuponError){msg.textContent=c.cuponError;msg.className='cupon-msg mal';cupon='';}
      else if(c.cupon){msg.innerHTML='✓ Código <b></b> aplicado · <button type="button" class="cart-remove" id="cuponQuitar">Quitar</button>';msg.querySelector('b').textContent=c.cupon;msg.className='cupon-msg ok';
        $('cuponQuitar').onclick=function(){cupon='';$('cuponInput').value='';msg.textContent='';cotizar();};}
      $('rowDescuento').hidden=!c.descuento; $('lblDescuento').textContent='Descuento'+(c.cupon?' ('+c.cupon+')':''); $('totDescuento').textContent='-'+plata(c.descuento);
      $('resumenLineas').innerHTML=Carrito.lineasHTML(items,c,false);
      $('payMP').hidden=!c.mercadopago;
      $('mpRecargoTxt').textContent=c.recargoMp?'(+'+c.recargoMp+'%)':''; // se configura en admin → Ajustes
      if(!c.mercadopago&&pago()==='mercadopago'){form.querySelector('input[name=pago][value=transferencia]').checked=true;cotizar();return;}
      $('totSub').textContent=plata(c.subtotal);
      $('rowRecargo').hidden=!c.recargo; $('totRecargo').textContent=plata(c.recargo);
      $('totTotal').textContent=plata(c.total);
      $('cartError').textContent=c.avisos.length?'Hay productos con problemas: tocá "Editar" y quitalos.':'';
      marcarListo();
    }).catch(function(err){$('resumenLineas').innerHTML='<p class="cart-error">'+err.message+'</p>';});
  }
  window.addEventListener('carrito',cotizar);
  function aplicarCupon(){var v=$('cuponInput').value.trim(); if(!v) return; cupon=v; $('cuponMsg').textContent='Revisando…'; $('cuponMsg').className='cupon-msg'; cotizar();}
  $('cuponAplicar').addEventListener('click',aplicarCupon);
  $('cuponInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();aplicarCupon();}});
  $('editarCarrito').addEventListener('click',function(){Carrito.abrir();});

  // Con sesión iniciada, el pedido queda en la cuenta y se completan nombre y email
  fetch('/api/auth/yo').then(function(r){return r.json();}).then(function(d){
    var u=d.usuario; if(!u) return;
    if(!form.nombre.value) form.nombre.value=u.nombre;
    if(!form.email.value){form.email.value=u.email;guardarAbandono();}
    marcarListo();
  }).catch(function(){});

  // Carrito abandonado: con el email escrito se guarda el carrito; si en 1 h no hace el pedido, le llega un mail para retomarlo
  function guardarAbandono(){
    var email=form.email.value.trim(), items=Carrito.items();
    if(!email||!form.email.checkValidity()||!items.length) return;
    fetch('/api/carritos-abandonados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,items:items}),keepalive:true}).catch(function(){});
  }
  form.email.addEventListener('change',guardarAbandono);
  window.addEventListener('carrito',guardarAbandono);
  // Embudo: empezó a llenar sus datos (una vez por visita)
  form.addEventListener('input',function llenando(){track('checkout_datos');form.removeEventListener('input',llenando);});

  // ---- Formulario ----
  // Interior: primero elige agencia o domicilio, después escribe cuál
  function actualizarDireccion(){
    var pick=entrega()==='pickup', interior=entrega()==='interior', envio=form.querySelector('input[name=envio]:checked');
    $('envioWrap').hidden=!interior; form.envio[0].required=interior;
    $('dirWrap').hidden=pick; form.direccion.required=!pick;
    $('dirLabel').textContent=interior&&envio&&envio.value==='agencia'?'Sucursal de DAC':'Dirección';
    form.direccion.placeholder=!interior?'':envio&&envio.value==='agencia'?'Departamento, Localidad':'Dirección';
  }
  // "Confirmar pedido" en rosa oscuro cuando los datos están completos y el carrito no tiene problemas
  function marcarListo(){$('confirmar').classList.toggle('listo',!!cot&&!cot.avisos.length&&form.checkValidity());}
  form.addEventListener('input',marcarListo);
  form.addEventListener('change',function(e){
    if(e.target.name==='entrega'||e.target.name==='envio') actualizarDireccion();
    marcarListo();
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
      entrega:entrega(), envio:entrega()==='interior'?form.envio.value:undefined, pago:pago(), items:Carrito.items(), cupon:cupon||undefined,
      origen:window.origenVisita?origenVisita():undefined
    };
    fetch('/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.detalles?d.detalles.join(' · '):d.error);return d;});})
      .then(function(d){
        window.removeEventListener('carrito',cotizar);
        Carrito.vaciar();
        // Mercado Pago: tarjeta en nuestra web (Card Payment Brick). Sin clave pública configurada, se va a la página de Mercado Pago
        if(body.pago==='mercadopago'){
          if(!cot||!cot.mpPublicKey){if(d.pagoUrl){location.href=d.pagoUrl;return;}}
          else{gracias(d.id,'Último paso: el pago','Total: '+plata(d.total)+'.');pagoTarjeta(d.id,d.token,d.total,cot.mpPublicKey,d.pagoUrl);return;}
        }
        gracias(d.id,'¡Gracias! Recibimos tu pedido.','Total: '+plata(d.total)+'. Te mandamos el detalle a '+body.cliente.email+'.',d.datos?'':d.instrucciones);
        if(d.token) pagoManual(d.id,d.token,{total:d.total,estado:'pendiente',comprobante:false,datos:d.datos,vence:d.vence?new Date(d.vence):new Date(Date.now()+2*3600e3)});
      })
      .catch(function(err){$('cartError').textContent=err.message||'No pudimos enviar el pedido. Probá de nuevo.';})
      .then(function(){btn.disabled=false;btn.textContent='Confirmar pedido';});
  });

  function gracias(id,titulo,texto,extra){
    window.removeEventListener('carrito',cotizar);
    $('gInicio').hidden=false;
    mostrar('gracias');
    $('gTitulo').textContent=titulo;
    $('gNumero').textContent='Pedido #'+id;
    $('gTexto').textContent=texto;
    $('gExtra').textContent=extra||''; $('gExtra').hidden=!extra;
    window.scrollTo(0,0);
  }

  // ---- Pago manual (transferencia, Abitab, Prex): datos para pagar y comprobante ----
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
  function hora(f){return new Date(f).toLocaleTimeString('es-UY',{timeZone:'America/Montevideo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});} // hora de Uruguay, ej. 19:07
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
    else estado.textContent='Tenés hasta las '+hora(info.vence)+' para pagar. Cuando transfieras, tocá "Confirmar pago" y subí el comprobante (foto o PDF): así el pedido no vence mientras lo revisamos.';
    box.appendChild(estado);
    // Sin comprobante, el botón principal es "Confirmar pago" (sube el comprobante); "Volver al inicio" aparece después
    var textoBoton=info.comprobante?'Reemplazar comprobante':'Confirmar pago';
    $('gInicio').hidden=!info.comprobante;
    var subir=el('label',(info.comprobante?'btn btn-outline':'btn btn-green')+' pm-subir',textoBoton);
    var input=el('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp,application/pdf'; input.hidden=true;
    subir.appendChild(input); box.appendChild(subir);
    var msj=el('p','cart-error'); box.appendChild(msj);
    if(!info.comprobante){var luego=el('a','pt-alt','Pago más tarde (te mandamos el link por mail)');luego.href='index.html';box.appendChild(luego);}
    input.addEventListener('change',function(){
      var f=input.files[0]; if(!f) return; msj.textContent='';
      if(f.size>5*1024*1024){msj.textContent='El archivo pesa más de 5 MB. Probá con una captura de pantalla.';return;}
      subir.firstChild.textContent='Subiendo…';
      fetch('/api/pedidos/'+id+'/comprobante?t='+token,{method:'PUT',headers:{'Content-Type':f.type||'application/octet-stream'},body:f})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error);});})
        .then(function(){info.comprobante=true;pagoManual(id,token,info);})
        .catch(function(e){subir.firstChild.textContent=textoBoton;msj.textContent=e.message||'No se pudo subir. Probá de nuevo.';});
      input.value='';
    });
  }

  // ---- Tarjeta dentro de la web: Card Payment Brick de Mercado Pago ----
  // Los campos de la tarjeta son de Mercado Pago (iframes): acá solo llega un token. El monto lo pone el servidor.
  function cargarSDK(){
    return window.MercadoPago?Promise.resolve():new Promise(function(ok,mal){
      var s=document.createElement('script'); s.src='https://sdk.mercadopago.com/js/v2'; s.onload=ok; s.onerror=mal; document.head.appendChild(s);
    });
  }
  function pagoTarjeta(id,token,total,publicKey,pagoUrl){
    var box=$('gTarjeta'), err=$('mpError'); box.hidden=false; $('gPago').hidden=true;
    if(pagoUrl){$('mpCuenta').href=pagoUrl;$('mpCuenta').hidden=false;}
    cargarSDK().then(function(){
      var mp=new MercadoPago(publicKey,{locale:'es-UY'});
      return mp.bricks().create('cardPayment','mpBrick',{
        initialization:{amount:total},
        customization:{
          paymentMethods:{maxInstallments:12},
          visual:{style:{theme:'default',customVariables:{ // colores de Manolito
            baseColor:'#C97D8D',baseColorFirstVariant:'#B0606F',baseColorSecondVariant:'#EAB3BE',
            borderRadiusSmall:'8px',borderRadiusMedium:'12px',borderRadiusLarge:'16px',borderRadiusFull:'999px'}}}
        },
        callbacks:{
          onReady:function(){},
          onError:function(e){console.error(e);},
          onSubmit:function(formData){
            err.textContent='';
            return fetch('/api/mercadopago/pagar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pedido:id,t:token,formData:formData})})
              .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error);return d;});})
              .then(function(d){
                if(d.estado==='pagado'){box.hidden=true;gracias(id,'¡Pago recibido!','Gracias por tu compra. Te mandamos el detalle por mail.');}
                else if(d.pago==='in_process'||d.pago==='pending'){box.hidden=true;gracias(id,'Tu pago está en revisión','Mercado Pago lo está revisando. Te avisamos por mail cuando se confirme.');}
                else err.textContent=d.mensaje||'El pago fue rechazado. Probá con otra tarjeta.';
              })
              .catch(function(e){err.textContent=e.message||'No pudimos procesar el pago. Probá de nuevo.';});
          }
        }
      });
    }).catch(function(){
      err.textContent='No se pudo cargar el formulario de pago.'+(pagoUrl?' Podés pagar desde la página de Mercado Pago:':' Recargá la página o escribinos por Instagram.');
    });
  }

  // ---- Vuelta desde Mercado Pago: checkout.html?pedido=ID&payment_id=...&status=... ----
  // Lo que dice la URL no se cree: el servidor consulta el pago a Mercado Pago y devuelve el estado real
  var q=new URLSearchParams(location.search);
  // Link del mail de carrito abandonado: checkout.html?carrito=TOKEN → vuelve a cargar el carrito
  if(q.get('carrito')){
    var tc=q.get('carrito'); q.delete('carrito');
    history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:''));
    fetch('/api/carritos-abandonados/'+encodeURIComponent(tc)).then(function(r){if(!r.ok)throw new Error();return r.json();})
      .then(function(d){Carrito.guardar(d.items);}) // dispara 'carrito' → cotizar
      .catch(function(){cotizar();});
    return;
  }
  function noSeCompleto(id){gracias(id,'El pago no se completó','Tu pedido quedó guardado: podés volver a intentarlo dentro de las 2 horas, o escribinos por Instagram y lo coordinamos por otro medio.');}
  // Link del mail de un pago manual: checkout.html?pedido=ID&t=TOKEN
  if(q.get('pedido')&&q.get('t')){
    var pidM=q.get('pedido'), tok=q.get('t');
    gracias(pidM,'Tu pedido','Cargando…');
    fetch('/api/pedidos/'+encodeURIComponent(pidM)+'/pago?t='+encodeURIComponent(tok)).then(function(r){if(!r.ok)throw new Error();return r.json();})
      .then(function(d){
        $('gTexto').textContent='Total: '+plata(d.total)+'.';
        if(d.pago==='mercadopago'&&d.estado==='pendiente'&&d.mpPublicKey){$('gTitulo').textContent='Último paso: el pago';pagoTarjeta(d.id,tok,d.total,d.mpPublicKey,null);}
        else pagoManual(d.id,tok,d);
      })
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

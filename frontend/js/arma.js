(function(){
  var S='fill="none" stroke="#C97D8D" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  function ico(p){return '<svg width="22" height="22" viewBox="0 0 24 24" '+S+'>'+p+'</svg>';}
  var COL=['Rosa','Celeste','Beige'], COL4=['Rosa','Celeste','Beige','Estampada'], IM=window.MIMG||{};
  var P=[
    {id:'trapito',n:'Trapito de apego',p:890,c:COL,img:IM.trapito,i:'<path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 5 23.5 8.5 21.5 12.5 19 16.65 12 21 12 21z"/>'},
    {id:'zapatitos',n:'Zapatitos tejidos',p:490,c:COL,img:IM.zapatitos,i:'<path d="M4 6h7v6l7 2a2 2 0 0 1 2 2v2H4z"/><path d="M4 12h7"/>'},
    {id:'babero',n:'Babero de algodón',p:190,img:IM.babero,i:'<path d="M5 4c1 4 3 6 7 6s6-2 7-6"/><path d="M5 4l-1 9a8 8 0 0 0 16 0l-1-9"/>'},
    {id:'manta',n:'Manta de muselina',p:890,c:COL4,img:IM.manta,i:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14h16"/>'},
    {id:'peine',n:'Set de peine bamboo',p:690,img:IM.peine,i:'<rect x="6" y="3" width="6" height="12" rx="3"/><path d="M9 15v6"/><path d="M16 4v17M14 5h4M14 9h4M14 13h4"/>'},
    {id:'sonajero',n:'Sonajero de tela',p:690,img:IM.sonajero,i:'<circle cx="12" cy="7" r="4"/><path d="M12 11v4"/><rect x="9" y="15" width="6" height="6" rx="3"/>'},
    {id:'guarda',n:'Guardachupete de silicona',p:390,c:COL,img:IM.guarda,i:'<circle cx="12" cy="13" r="7"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/>'},
    {id:'mordillo',n:'Mordillo de silicona',p:490,c:COL,img:IM.mordillo,i:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>'},
    {id:'porta',n:'Portachupete personalizado',p:790,name:1,modelo:1,img:IM.porta,i:'<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V10"/><circle cx="7" cy="14" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="17" cy="14" r="2"/>'}
  ];
  var st={}; // id -> {color,name}
  var grid=document.getElementById('armaGrid');

  function letters(s){return (s||'').replace(/\s+/g,'').length;}
  function price(p){
    if(p.name){var l=letters(st[p.id]&&st[p.id].name);return p.p+(l>5?(l-5)*20:0);}
    return p.p;
  }
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}

  P.forEach(function(p){
    var card=el('div','ap'); card.id='ap-'+p.id;
    var top=el('div','ap-top');
    if(p.img){var im=document.createElement('img');im.className='ap-img';im.alt=p.n;im.src=p.img;card.appendChild(im);}
    var ic=el('div','ap-ico'); ic.innerHTML=ico(p.i);
    var tx=el('div'); tx.appendChild(el('h4',null,p.n)); var pr=el('div','ap-price','$'+p.p); pr.id='apr-'+p.id; tx.appendChild(pr);
    if(!p.img) top.appendChild(ic); top.appendChild(tx); card.appendChild(top);
    if(p.c){
      var o=el('div','ap-opt'); o.appendChild(el('small',null,'Color'));
      var ch=el('div','ap-chips');
      p.c.forEach(function(cn){
        var b=el('button','chip',cn); b.type='button';
        b.addEventListener('click',function(){
          st[p.id]=st[p.id]||{}; st[p.id].color=(st[p.id].color===cn)?null:cn;
          if(!st[p.id].on){st[p.id].on=true;}
          render();
        });
        ch.appendChild(b);
      });
      o.appendChild(ch); card.appendChild(o);
    }
    if(p.modelo){
      var o3=el('div','ap-opt'); o3.appendChild(el('small',null,'Modelo'));
      var mb=el('button','btn btn-outline btn-sm ap-model','Ver y elegir modelo'); mb.type='button'; mb.id='apm-'+p.id;
      mb.addEventListener('click',function(){abrirModelos(p);});
      o3.appendChild(mb); card.appendChild(o3);
      var im0=card.querySelector('.ap-img'); if(im0){im0.style.cursor='pointer';im0.addEventListener('click',function(){abrirModelos(p);});}
    }
    if(p.name){
      var o2=el('div','ap-opt'); o2.appendChild(el('small',null,'Nombre del bebé (hasta 5 letras, $20 por letra extra)'));
      var inp=document.createElement('input'); inp.type='text'; inp.maxLength=20; inp.placeholder='Ej: Lucas';
      inp.addEventListener('input',function(){
        st[p.id]=st[p.id]||{}; st[p.id].name=inp.value.trim();
        if(inp.value.trim()&&!st[p.id].on){st[p.id].on=true;}
        render();
      });
      o2.appendChild(inp); card.appendChild(o2);
    }
    var btn=el('button','ap-btn','Agregar'); btn.type='button';
    btn.addEventListener('click',function(){
      st[p.id]=st[p.id]||{}; st[p.id].on=!st[p.id].on; if(st[p.id].on)track('arma_agregar',p.id); render();
    });
    card.appendChild(btn);
    grid.appendChild(card);
  });

  // Selector de modelos de portachupete: lista todas las láminas de fotos y se elige material + lámina + detalle
  var LAM={Silicona:20,Madera:9}, mod=null;
  function abrirModelos(p){
    var s=st[p.id]=st[p.id]||{};
    if(!mod){
      mod=el('div','pm'); mod.setAttribute('role','dialog'); mod.setAttribute('aria-modal','true');
      mod.innerHTML='<div class="pm-box"><button type="button" class="pm-x" aria-label="Cerrar">&times;</button>'+
        '<h3>Elegí el modelo de tu portachupete</h3><p class="pm-sub">Tocá el que más te guste. Podés contarnos qué cambiarías (colores, figura) abajo.</p>'+
        '<div class="pm-tabs"></div><div class="pm-grid"></div>'+
        '<label class="pm-l">Colores o detalles (opcional)<input type="text" maxlength="60" placeholder="Ej: arcoíris pastel, clip de madera"></label>'+
        '<button type="button" class="btn btn-green pm-ok" style="width:100%">Listo</button></div>';
      document.body.appendChild(mod);
      mod.addEventListener('click',function(e){if(e.target===mod||e.target.className==='pm-x')cerrar();});
      document.addEventListener('keydown',function(e){if(e.key==='Escape'&&mod.classList.contains('show'))cerrar();});
    }
    var mat=s.mat||'Silicona', lam=s.lam||0, tabs=mod.querySelector('.pm-tabs'), g=mod.querySelector('.pm-grid'), inp=mod.querySelector('input');
    inp.value=s.det||'';
    function pintar(){
      tabs.innerHTML=''; g.innerHTML='';
      Object.keys(LAM).forEach(function(m){
        var b=el('button','chip'+(m===mat?' sel':''),m); b.type='button';
        b.onclick=function(){mat=m;lam=0;pintar();}; tabs.appendChild(b);
      });
      for(var n=1;n<=LAM[mat];n++){(function(n){
        var f=el('button','pm-img'+(n===lam?' sel':'')); f.type='button'; f.setAttribute('aria-label','Elegir modelo '+n+' de '+mat);
        var im=document.createElement('img'); im.alt='Portachupete de '+mat.toLowerCase()+', modelo '+n; im.loading='lazy'; im.src='assets/img/portachupetes/modelos/'+mat.toLowerCase()+'-'+n+'.jpg'; f.appendChild(im);
        f.appendChild(el('span','pm-tag',n===lam?'✓ N° '+n:'N° '+n));
        f.onclick=function(){lam=n;pintar();}; g.appendChild(f);
      })(n);}
    }
    function cerrar(){mod.classList.remove('show');document.body.style.overflow='';}
    mod.querySelector('.pm-ok').onclick=function(){
      if(!lam){toast('Tocá un modelo para elegirlo.');return;}
      s.mat=mat; s.lam=lam; s.det=inp.value.trim();
      s.modelo=mat+' N° '+lam+(s.det?' — '+s.det:''); s.on=true;
      cerrar(); track('arma_modelo',p.id); render();
    };
    mod._cerrar=cerrar; pintar(); mod.classList.add('show'); document.body.style.overflow='hidden';
  }

  function lineText(p){
    var s=st[p.id]||{}, t=p.n;
    if(p.c) t+=' ('+(s.color?s.color.toLowerCase():'color a elegir')+')';
    if(p.name) t+=' '+(s.name?'"'+s.name+'"':'(nombre a definir)');
    if(p.modelo) t+=' — modelo: '+(s.modelo||'a definir');
    return t;
  }

  function render(){
    var total=0,count=0,list=document.getElementById('armaList'); list.innerHTML='';
    P.forEach(function(p){
      var s=st[p.id]||{}, card=document.getElementById('ap-'+p.id);
      card.classList.toggle('on',!!s.on);
      if(p.agotado) s.on=false;
      var bt=card.querySelector('.ap-btn'); bt.disabled=!!p.agotado; bt.textContent=p.agotado?'Sin stock':(s.on?'Quitar':'Agregar');
      card.querySelectorAll('.chip').forEach(function(b){b.classList.toggle('sel',!!(s.color&&b.textContent===s.color));});
      if(p.modelo){var mbb=document.getElementById('apm-'+p.id); if(mbb) mbb.textContent=s.modelo?'Modelo: '+s.modelo+' (cambiar)':'Ver y elegir modelo';}
      document.getElementById('apr-'+p.id).textContent='$'+price(p);
      if(s.on){
        count++; total+=price(p);
        var row=el('div','arma-line'); row.appendChild(el('span',null,lineText(p)));
        row.appendChild(el('b',null,'$'+price(p)));
        var x=el('button','arma-x','×'); x.type='button'; x.setAttribute('aria-label','Quitar '+p.n);
        x.addEventListener('click',function(){st[p.id].on=false;render();});
        row.appendChild(x); list.appendChild(row);
      }
    });
    document.getElementById('armaTotal').textContent='$'+total;
    document.getElementById('armaTotalRow').style.display=count?'flex':'none';
    document.getElementById('armaSend').style.display=count?'block':'none';
    document.getElementById('armaCart').style.display=count?'block':'none';
    document.getElementById('armaNote').textContent=count?'Agregalo al carrito para pedirlo online, o mandanos tu armado por Instagram.':'Todavía no agregaste nada. ¡Empezá tocando "Agregar"!';
    document.getElementById('armaBarN').textContent=count;
    document.getElementById('armaBarT').textContent='$'+total;
    bar.dataset.count=count; updBar();
  }

  var bar=document.getElementById('armaBar'), sec=document.getElementById('arma'), visible=false;
  function updBar(){bar.classList.toggle('show',+bar.dataset.count>0 && !visible);}
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){visible=en[0].isIntersecting;updBar();},{threshold:0.05}).observe(sec);
  }

  function toast(m){var t=document.getElementById('armaToast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},4500);}

  document.getElementById('armaCart').addEventListener('click',function(){
    var elegidos=P.filter(function(p){return st[p.id]&&st[p.id].on;});
    for(var k=0;k<elegidos.length;k++){
      var p=elegidos[k], s=st[p.id];
      if(p.c&&!s.color){toast('Elegí el color de '+p.n+'.');return;}
      if(p.name&&!s.name){toast('Escribí el nombre del bebé para el portachupete.');return;}
      if(p.modelo&&!s.modelo){toast('Elegí el modelo del portachupete.');abrirModelos(p);return;}
    }
    elegidos.forEach(function(p){
      var s=st[p.id];
      Carrito.agregar({tipo:'producto',id:p.id,color:s.color||undefined,nombreBebe:p.name?s.name:undefined,modelo:p.modelo?s.modelo:undefined});
      s.on=false;
    });
    render();
    Carrito.abrir();
  });

  document.getElementById('armaSend').addEventListener('click',function(){
    var lines=['¡Hola Manolito! Quiero armar mi box:'],total=0;
    P.forEach(function(p){var s=st[p.id]; if(s&&s.on){lines.push('- '+lineText(p)+' — $'+price(p)); total+=price(p);}});
    lines.push('Total: $'+total);
    var msg=lines.join('\n'), ok=false;
    track('arma_enviar');
    try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(msg);ok=true;} }catch(e){}
    if(!ok){
      try{var ta=document.createElement('textarea');ta.value=msg;document.body.appendChild(ta);ta.select();ok=document.execCommand('copy');document.body.removeChild(ta);}catch(e){}
    }
    toast(ok?'¡Pedido copiado! Pegalo en el chat de Instagram.':'Abrimos Instagram. Contanos qué productos elegiste.');
    window.open('https://instagram.com/manolito_uy','_blank','noopener');
  });
  render();

  // Precio, stock y productos activos desde el admin; si la API no responde quedan los de arriba
  fetch('/api/productos').then(function(r){return r.ok?r.json():[];}).then(function(list){
    if(!list.length) return;
    var m={}; list.forEach(function(d){m[d.id]=d;});
    P.forEach(function(p){
      var d=m[p.id], card=document.getElementById('ap-'+p.id);
      if(!d){card.style.display='none';if(st[p.id])st[p.id].on=false;return;}
      p.p=d.precio; p.agotado=d.stock===0;
      var im=card.querySelector('.ap-img'); if(im&&d.foto) im.src=d.foto;
    });
    render();
  }).catch(function(){});
})();

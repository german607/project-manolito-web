window.MIMG={"trapito": "assets/img/arma-tu-box/producto-trapito.jpg", "zapatitos": "assets/img/arma-tu-box/producto-zapatitos.jpg", "peine": "assets/img/arma-tu-box/producto-peine.jpg", "babero": "assets/img/arma-tu-box/producto-babero.jpg", "manta": "assets/img/arma-tu-box/producto-manta.jpg", "guarda": "assets/img/arma-tu-box/producto-guarda.jpg", "sonajero": "assets/img/arma-tu-box/producto-sonajero.jpg", "mordillo": "assets/img/arma-tu-box/producto-mordillo.jpg", "porta": "assets/img/arma-tu-box/producto-porta.jpg"};

// Galerías: genera las imágenes numeradas a partir de data-img="ruta-{n}.jpg" y data-count
document.querySelectorAll('[data-img]').forEach(function(g){
  for(var n=1;n<=+g.dataset.count;n++){
    var d=document.createElement('div'), im=document.createElement('img');
    d.className=g.dataset.item; im.loading='lazy';
    im.src=g.dataset.img.replace('{n}',n); im.alt=g.dataset.alt.replace('{n}',n);
    d.appendChild(im); g.appendChild(d);
  }
});


(function(){
  var S='fill="none" stroke="#C97D8D" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  function ico(p){return '<svg width="22" height="22" viewBox="0 0 24 24" '+S+'>'+p+'</svg>';}
  var P={
    babero:{i:ico('<path d="M5 4c1 4 3 6 7 6s6-2 7-6"/><path d="M5 4l-1 9a8 8 0 0 0 16 0l-1-9"/>'),d:'Babero de muselina de algodón, suave e hipoalergénico, con broche ajustable.'},
    porta:{i:ico('<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V10"/><circle cx="7" cy="14" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="17" cy="14" r="2"/>'),d:'Con el nombre de tu bebé (hasta 5 letras), en silicona libre de BPA o madera natural.',n:'<a class="bm-link" href="#portachupetes">Ver modelos en la sección Portachupetes</a>'},
    zapatitos:{i:ico('<path d="M4 6h7v6l7 2a2 2 0 0 1 2 2v2H4z"/><path d="M4 12h7"/>'),d:'Zapatitos tejidos con carita, suaves y abrigados para los primeros días.',n:'<span class="bm-note">Colores disponibles: rosa, celeste y beige.</span>'},
    sonajero:{i:ico('<circle cx="12" cy="8" r="4.5"/><path d="M12 12.5V16"/><circle cx="12" cy="19" r="2.5"/>'),d:'Sonajero de tela suave y seguro, ideal para estimular y calmar al bebé.'},
    trapito:{i:ico('<path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 5 23.5 8.5 21.5 12.5 19 16.65 12 21 12 21z"/>'),d:'Trapito de apego de muselina, suave y abrazable, su compañero para dormir.',n:'<span class="bm-note">Colores disponibles: rosa, celeste y beige.</span>'},
    estuche:{i:ico('<circle cx="12" cy="13" r="7"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/>'),d:'Estuche de silicona suave para guardar y llevar el chupete siempre limpio.',n:'<span class="bm-note">Colores disponibles: rosa, celeste y beige.</span>'},
    mordillo:{i:ico('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>'),d:'Mordillo de silicona y madera natural, seguro y libre de BPA para aliviar las encías.',n:'<span class="bm-note">Colores disponibles: rosa, celeste y beige.</span>'},
    manta:{i:ico('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14h16"/>'),d:'Manta de muselina, liviana y suave, ideal para abrigar al bebé.',n:'<span class="bm-note">Colores disponibles: rosa, celeste, beige y estampada.</span>'},
    cepillo:{i:ico('<rect x="6" y="3" width="6" height="12" rx="3"/><path d="M9 15v6"/><path d="M16 4v17M14 5h4M14 9h4M14 13h4"/>'),d:'Set de cepillo de cerdas suaves y peine de madera natural para cuidar el pelito del bebé.'},
    sonPel:{i:ico('<circle cx="12" cy="7" r="4"/><path d="M12 11v4"/><rect x="9" y="15" width="6" height="6" rx="3"/>'),d:'Sonajero de peluche suave, con sonido delicado para estimular al bebé.'},
    peluche:{i:ico('<path d="M8 9c-1-4 0-6 2-6s2 3 1 6"/><path d="M13 9c-1-3 0-6 2-6s2 3 1 6"/><circle cx="12" cy="13" r="4"/><path d="M8 21l1-4h6l1 4"/>'),d:'Conejo de peluche suave y seguro, el compañero ideal para abrazar.'},
    muneco:{i:ico('<path d="M8 9c-1-4 0-6 2-6s2 3 1 6"/><path d="M13 9c-1-3 0-6 2-6s2 3 1 6"/><circle cx="12" cy="13" r="4"/><path d="M8 21l1-4h6l1 4"/>'),d:'Muñeco o trapito de apego, tu elección. Suave y seguro para abrazar.'}
  };
  var IM=window.MIMG||{};
  P.trapito.img=IM.trapito; P.zapatitos.img=IM.zapatitos; P.cepillo.img=IM.peine; P.babero.img=IM.babero; P.manta.img=IM.manta; P.estuche.img=IM.guarda; P.sonajero.img=IM.sonajero; P.mordillo.img=IM.mordillo; P.porta.img=IM.porta;
  function pick(t){
    t=t.toLowerCase();
    if(t.indexOf('manta')>-1)return P.manta;
    if(t.indexOf('cepillo')>-1||t.indexOf('peine')>-1)return P.cepillo;
    if(t.indexOf('sonajero de peluche')>-1)return P.sonPel;
    if(t.indexOf('peluche')>-1)return P.peluche;
    if(t.indexOf('estuche')>-1)return P.estuche;
    if(t.indexOf('mordillo')>-1)return P.mordillo;
    if(t.indexOf('babero')>-1)return P.babero;
    if(t.indexOf('portachupete')>-1)return P.porta;
    if(t.indexOf('zapatito')>-1)return P.zapatitos;
    if(t.indexOf('sonajero')>-1)return P.sonajero;
    if(t.indexOf('mu\u00f1eco')>-1)return P.muneco;
    return P.trapito;
  }
  var ov=document.getElementById('boxModal');
  function open(card){
    var img=card.querySelector('.box-photo img');
    document.getElementById('bmImg').src=img?img.src:'';
    var t=card.querySelector('h3').textContent;
    document.getElementById('bmImg').alt=t;
    document.getElementById('bmTitle').textContent=t;
    document.getElementById('bmPrice').textContent=card.querySelector('.box-price').textContent;
    var box=document.getElementById('bmItems'); box.innerHTML='';
    card.querySelectorAll('.box-items li').forEach(function(li){
      var n=li.textContent, p=pick(n), d=document.createElement('div');
      d.className='bm-item';
      d.innerHTML=(p.img?'<div class="bm-ico ph"><img alt="" src="'+p.img+'"></div>':'<div class="bm-ico">'+p.i+'</div>')+'<div><h4></h4><p>'+p.d+'</p>'+(p.n||'')+'</div>';
      d.querySelector('h4').textContent=n;
      var lk=d.querySelector('.bm-link'); if(lk) lk.addEventListener('click',close);
      box.appendChild(d);
    });
    ov.classList.add('open'); ov.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  }
  function close(){ov.classList.remove('open');ov.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  document.querySelectorAll('.box-card').forEach(function(card){
    var hint=document.createElement('div'); hint.className='box-hint'; hint.textContent='Ver qué trae';
    var cta=card.querySelector('.box-cta'); if(cta) cta.parentNode.insertBefore(hint,cta);
    card.addEventListener('click',function(e){ if(e.target.closest('.box-cta'))return; open(card); });
  });
  document.getElementById('bmClose').addEventListener('click',close);
  ov.addEventListener('click',function(e){if(e.target===ov)close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();

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
    {id:'porta',n:'Portachupete personalizado',p:790,name:1,img:IM.porta,i:'<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V10"/><circle cx="7" cy="14" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="17" cy="14" r="2"/>'}
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
      st[p.id]=st[p.id]||{}; st[p.id].on=!st[p.id].on; render();
    });
    card.appendChild(btn);
    grid.appendChild(card);
  });

  function lineText(p){
    var s=st[p.id]||{}, t=p.n;
    if(p.c) t+=' ('+(s.color?s.color.toLowerCase():'color a elegir')+')';
    if(p.name) t+=' '+(s.name?'"'+s.name+'"':'(nombre a definir)');
    return t;
  }

  function render(){
    var total=0,count=0,list=document.getElementById('armaList'); list.innerHTML='';
    P.forEach(function(p){
      var s=st[p.id]||{}, card=document.getElementById('ap-'+p.id);
      card.classList.toggle('on',!!s.on);
      card.querySelector('.ap-btn').textContent=s.on?'Quitar':'Agregar';
      card.querySelectorAll('.chip').forEach(function(b){b.classList.toggle('sel',!!(s.color&&b.textContent===s.color));});
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
    document.getElementById('armaNote').textContent=count?'Se copia tu pedido y se abre nuestro Instagram: solo tenés que pegarlo en el chat. El precio final lo confirmamos por ahí.':'Todavía no agregaste nada. ¡Empezá tocando "Agregar"!';
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

  document.getElementById('armaSend').addEventListener('click',function(){
    var lines=['¡Hola Manolito! Quiero armar mi box:'],total=0;
    P.forEach(function(p){var s=st[p.id]; if(s&&s.on){lines.push('- '+lineText(p)+' — $'+price(p)); total+=price(p);}});
    lines.push('Total: $'+total);
    var msg=lines.join('\n'), ok=false;
    try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(msg);ok=true;} }catch(e){}
    if(!ok){
      try{var ta=document.createElement('textarea');ta.value=msg;document.body.appendChild(ta);ta.select();ok=document.execCommand('copy');document.body.removeChild(ta);}catch(e){}
    }
    toast(ok?'¡Pedido copiado! Pegalo en el chat de Instagram.':'Abrimos Instagram. Contanos qué productos elegiste.');
    window.open('https://instagram.com/manolito_uy','_blank','noopener');
  });
  render();
})();

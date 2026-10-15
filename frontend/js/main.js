window.MIMG={"trapito": "assets/img/arma-tu-box/producto-trapito.jpg", "zapatitos": "assets/img/arma-tu-box/producto-zapatitos.jpg", "peine": "assets/img/arma-tu-box/producto-peine.jpg", "babero": "assets/img/arma-tu-box/producto-babero.jpg", "manta": "assets/img/arma-tu-box/producto-manta.jpg", "guarda": "assets/img/arma-tu-box/producto-guarda.jpg", "sonajero": "assets/img/arma-tu-box/producto-sonajero.jpg", "mordillo": "assets/img/arma-tu-box/producto-mordillo.jpg", "porta": "assets/img/arma-tu-box/producto-porta.jpg"};

// Métricas de uso anónimas (sin cookies): ver /admin
window.track=function(tipo,ref){
  try{fetch('/api/eventos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:tipo,ref:ref||''}),keepalive:true}).catch(function(){});}catch(e){}
};
track('visita',location.pathname);
document.addEventListener('click',function(e){if(e.target.closest('a[href*="instagram.com"]'))track('instagram',location.pathname);});

// Galerías: genera las imágenes numeradas a partir de data-img="ruta-{n}.jpg" y data-count
document.querySelectorAll('[data-img]').forEach(function(g){
  for(var n=1;n<=+g.dataset.count;n++){
    var d=document.createElement('div'), im=document.createElement('img');
    d.className=g.dataset.item; im.loading='lazy';
    im.src=g.dataset.img.replace('{n}',n); im.alt=g.dataset.alt.replace('{n}',n);
    d.appendChild(im); g.appendChild(d);
  }
});

// Sliders de a una foto (portachupetes): flechas, puntitos y vuelta al inicio al llegar al final
document.querySelectorAll('.porta-slider').forEach(function(s){
  var track=s.querySelector('.porta-track'), n=track.children.length, dots=s.querySelector('.porta-dots');
  if(n<2){s.classList.add('single');return;}
  function cur(){return Math.round(track.scrollLeft/track.clientWidth);}
  function go(i){track.scrollTo({left:((i+n)%n)*track.clientWidth,behavior:'smooth'});}
  for(var i=0;i<n;i++){
    var b=document.createElement('button'); b.type='button'; b.setAttribute('aria-label','Ver foto '+(i+1));
    b.addEventListener('click',go.bind(null,i)); dots.appendChild(b);
  }
  function upd(){var c=cur();[].forEach.call(dots.children,function(b,j){b.classList.toggle('on',j===c);});}
  track.addEventListener('scroll',upd); upd();
  s.querySelector('.arrow-left').addEventListener('click',function(){go(cur()-1);});
  s.querySelector('.arrow-right').addEventListener('click',function(){go(cur()+1);});
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
  if(!ov) return; // solo en la página de inicio

  // Precios y boxes activas desde el admin; si la API no responde quedan los del HTML
  fetch('/api/boxes').then(function(r){return r.ok?r.json():[];}).then(function(list){
    if(!list.length) return;
    var m={}; list.forEach(function(b){m[b.nombre]=b;});
    document.querySelectorAll('.box-card').forEach(function(card){
      var b=m[card.querySelector('h3').textContent.trim()];
      if(!b){card.style.display='none';return;}
      card.querySelector('.box-price').textContent='$'+b.precio;
      card.dataset.boxId=b.id;
    });
  }).catch(function(){});
  var actual=null;
  function open(card){
    actual=card;
    var img=card.querySelector('.box-photo img.cur')||card.querySelector('.box-photo img');
    document.getElementById('bmImg').src=img?img.src:'';
    var t=card.querySelector('h3').textContent;
    document.getElementById('bmImg').alt=t;
    document.getElementById('bmTitle').textContent=t;
    track('box_ver',t);
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
    // Sin id no hay backend: solo queda consultar por Instagram
    document.getElementById('bmBuy').hidden=!card.dataset.boxId;
    document.getElementById('bmNameWrap').hidden=!/portachupete/i.test(card.querySelector('.box-items').textContent);
    document.getElementById('bmName').value=''; document.getElementById('bmError').textContent='';
    ov.classList.add('open'); ov.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  }
  function close(){ov.classList.remove('open');ov.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  document.querySelectorAll('.box-card').forEach(function(card){
    var hint=document.createElement('div'); hint.className='box-hint'; hint.textContent='Ver qué trae';
    var cta=card.querySelector('.box-cta'); if(cta) cta.parentNode.insertBefore(hint,cta);
    card.addEventListener('click',function(e){ if(e.target.closest('.box-cta'))return; open(card); });
  });
  document.getElementById('bmClose').addEventListener('click',close);
  document.getElementById('bmAdd').addEventListener('click',function(){
    var nombre=document.getElementById('bmName').value.trim();
    if(!document.getElementById('bmNameWrap').hidden&&!nombre){
      document.getElementById('bmError').textContent='Escribí el nombre del bebé para el portachupete.';
      document.getElementById('bmName').focus(); return;
    }
    Carrito.agregar({tipo:'box',id:actual.dataset.boxId,nombreBebe:nombre||undefined});
    close(); Carrito.abrir();
  });
  ov.addEventListener('click',function(e){if(e.target===ov)close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();

// Mini box: carrete de fotos; al tocar un color se muestra la foto de ese color
(function(){
  document.querySelectorAll('.box-photo.bs').forEach(function(ph){
    var card=ph.closest('.box-card'), track=ph.querySelector('.bs-track'), imgs=[].slice.call(track.children);
    var sw=[].slice.call(card.querySelectorAll('button.bc')), dots=ph.querySelector('.bs-dots'), cur=-1;
    imgs.forEach(function(){dots.appendChild(document.createElement('i'));});
    function go(i){ i=Math.max(0,Math.min(imgs.length-1,i)); track.scrollTo({left:i*track.clientWidth,behavior:'smooth'}); }
    function mark(i){
      if(i===cur) return; cur=i;
      [].forEach.call(dots.children,function(d,k){d.classList.toggle('on',k===i);});
      sw.forEach(function(b,k){b.classList.toggle('on',(b.dataset.slide!==undefined?+b.dataset.slide:k)===i);});
      imgs.forEach(function(im,k){im.classList.toggle('cur',k===i);});
    }
    track.addEventListener('scroll',function(){ mark(Math.round(track.scrollLeft/(track.clientWidth||1))); },{passive:true});
    sw.forEach(function(b,k){ b.addEventListener('click',function(e){e.stopPropagation();go(b.dataset.slide!==undefined?+b.dataset.slide:k);}); });
    ph.querySelector('.bs-prev').addEventListener('click',function(e){e.stopPropagation();go(cur-1);});
    ph.querySelector('.bs-next').addEventListener('click',function(e){e.stopPropagation();go(cur+1);});
    mark(0);
  });
})();

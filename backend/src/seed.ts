// Catálogo inicial: lo que hoy muestra el sitio. Se carga solo si la base está vacía.
// `productos` de cada box = de qué productos descuenta stock. El conejo de peluche es un producto solo para llevar su stock
// (activo: false, no se vende suelto).
const COL = ['Rosa', 'Celeste', 'Beige'];
const foto = (id: string) => `assets/img/arma-tu-box/producto-${id}.jpg`;

export const PRODUCTOS = [
  { id: 'trapito', nombre: 'Trapito de apego', precio: 890, colores: COL, descripcion: 'Trapito de apego de muselina, suave y abrazable, su compañero para dormir.' },
  { id: 'zapatitos', nombre: 'Zapatitos tejidos', precio: 490, colores: COL, descripcion: 'Zapatitos tejidos, suaves y abrigados para los primeros días.' },
  { id: 'babero', nombre: 'Babero de algodón', precio: 190, colores: ['Rosa', 'Celeste', 'Verde'], descripcion: 'Babero de muselina de algodón, suave e hipoalergénico, con broche ajustable.' },
  { id: 'manta', nombre: 'Manta de muselina', precio: 890, colores: [...COL, 'Estampada'], descripcion: 'Manta de muselina de algodón, liviana y suave. Para múltiples usos.' },
  { id: 'peine', nombre: 'Set de peine bamboo', precio: 690, colores: null, descripcion: 'Set de cepillo de cerdas suaves y peine de bamboo para cuidar el pelito del bebé.' },
  { id: 'sonajero', nombre: 'Sonajero de tela', precio: 690, colores: ['Conejito aro', 'Conejito bastón'], descripcion: 'Sonajero de tela suave y seguro, ideal para estimular y calmar al bebé.' },
  { id: 'guarda', nombre: 'Guardachupete de silicona', precio: 390, colores: COL, descripcion: 'Estuche de silicona libre de BPA, suave para guardar y llevar el chupete siempre limpio.' },
  { id: 'mordillo', nombre: 'Mordillo de silicona', precio: 490, colores: COL, descripcion: 'Mordillo de silicona y madera natural, seguro y libre de BPA para aliviar las encías.' },
  { id: 'porta', nombre: 'Portachupete personalizado', precio: 790, colores: null, personalizable: true, descripcion: 'Con el nombre de tu bebé (hasta 5 letras), en silicona libre de BPA o madera natural.' },
  { id: 'conejo', nombre: 'Conejo de peluche', precio: 0, colores: null, activo: false, descripcion: 'Conejo de peluche suave y seguro, el compañero ideal para abrazar.' },
].map(p => ({ personalizable: false, activo: true, ...p, foto: p.id === 'conejo' ? null : foto(p.id) }));

export const BOXES = [
  { id: 'mini-box', colores: ['Rosa', 'Celeste', 'Verde', 'Beige'], nombre: 'Mini box', precio: 990, foto: 'mini-box.jpg', productos: ['babero', 'porta'], items: ['Babero de algodón', 'Portachupete personalizado'] },
  { id: 'dulce-llegada', colores: ['Rosa', 'Celeste', 'Verde', 'Beige'], nombre: 'Box detalles especiales', precio: 1390, foto: 'box-dulce-llegada.jpg', productos: ['zapatitos', 'babero', 'porta'], items: ['Zapatitos tejidos', 'Babero de algodón', 'Portachupete personalizado'] },
  { id: 'esencial', colores: ['Rosa', 'Celeste', 'Beige'], nombre: 'Box Esencial', precio: 1590, foto: 'box-esencial-rosa.jpg', productos: ['guarda', 'mordillo', 'porta'], items: ['Estuche de silicona para chupete', 'Mordillo de silicona y madera', 'Portachupete personalizado'] },
  { id: 'dulce-suenos', colores: ['Rosa', 'Celeste', 'Beige'], nombre: 'Box Dulce sueños', precio: 1690, foto: 'box-dulce-suenos.jpg', productos: ['trapito', 'porta'], items: ['Trapito de apego', 'Portachupete personalizado'] },
  { id: 'primeros-mimos', colores: ['Rosa', 'Celeste', 'Beige'], nombre: 'Box Primeros mimos', precio: 1790, foto: 'box-primeros-mimos.jpg', productos: ['zapatitos', 'babero', 'sonajero', 'porta'], items: ['Zapatitos tejidos', 'Babero de algodón', 'Sonajero de tela suave y seguro', 'Portachupete personalizado'] },
  { id: 'pequeno-tesoro', colores: ['Rosa', 'Celeste', 'Beige'], nombre: 'Box Pequeño tesoro', precio: 2090, foto: 'box-pequeno-tesoro.jpg', productos: ['trapito', 'zapatitos', 'porta'], items: ['Trapito de apego', 'Zapatitos tejidos', 'Portachupete personalizado'] },
  { id: 'bienvenida', colores: ['Rosa', 'Celeste', 'Beige'], nombre: 'Box Bienvenida', precio: 2790, foto: 'box-bienvenida-zapatitos.jpg', productos: ['manta', 'zapatitos', 'trapito', 'porta'], items: ['Manta de muselina', 'Zapatitos tejidos', 'Trapito de apego', 'Portachupete personalizado'] },
  { id: 'especial-manolito', colores: ['Rosa', 'Celeste', 'Beige'], nombre: 'Box especial Manolito', precio: 3290, foto: 'box-especial-manolito-sonajero.jpg', etiqueta: 'PREMIUM', productos: ['manta', 'babero', 'zapatitos', 'sonajero', 'conejo', 'porta'], items: ['Manta de muselina', 'Babero de algodón', 'Zapatitos tejidos', 'Sonajero de tela', 'Conejo de peluche', 'Portachupete personalizado'] },
].map(b => ({ etiqueta: null as string | null, ...b, foto: `assets/img/boxes/${b.foto}` }));

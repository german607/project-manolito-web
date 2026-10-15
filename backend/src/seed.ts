// Catálogo inicial: lo que hoy muestra el sitio. Se carga solo si la base está vacía.
const COL = ['Rosa', 'Celeste', 'Beige'];
const foto = (id: string) => `assets/img/arma-tu-box/producto-${id}.jpg`;

export const PRODUCTOS = [
  { id: 'trapito', nombre: 'Trapito de apego', precio: 890, colores: COL, descripcion: 'Trapito de apego de muselina, suave y abrazable, su compañero para dormir.' },
  { id: 'zapatitos', nombre: 'Zapatitos tejidos', precio: 490, colores: COL, descripcion: 'Zapatitos tejidos con carita, suaves y abrigados para los primeros días.' },
  { id: 'babero', nombre: 'Babero de algodón', precio: 190, colores: null, descripcion: 'Babero de muselina de algodón, suave e hipoalergénico, con broche ajustable.' },
  { id: 'manta', nombre: 'Manta de muselina', precio: 890, colores: [...COL, 'Estampada'], descripcion: 'Manta de muselina, liviana y suave, ideal para abrigar al bebé.' },
  { id: 'peine', nombre: 'Set de peine bamboo', precio: 690, colores: null, descripcion: 'Set de cepillo de cerdas suaves y peine de madera natural para cuidar el pelito del bebé.' },
  { id: 'sonajero', nombre: 'Sonajero de tela', precio: 690, colores: null, descripcion: 'Sonajero de tela suave y seguro, ideal para estimular y calmar al bebé.' },
  { id: 'guarda', nombre: 'Guardachupete de silicona', precio: 390, colores: COL, descripcion: 'Estuche de silicona suave para guardar y llevar el chupete siempre limpio.' },
  { id: 'mordillo', nombre: 'Mordillo de silicona', precio: 490, colores: COL, descripcion: 'Mordillo de silicona y madera natural, seguro y libre de BPA para aliviar las encías.' },
  { id: 'porta', nombre: 'Portachupete personalizado', precio: 790, colores: null, personalizable: true, descripcion: 'Con el nombre de tu bebé (hasta 5 letras), en silicona libre de BPA o madera natural.' },
].map(p => ({ personalizable: false, ...p, foto: foto(p.id) }));

export const BOXES = [
  { id: 'mini-box', nombre: 'Mini box', precio: 890, foto: 'mini-box.jpg', items: ['Babero de algodón', 'Portachupete personalizado'] },
  { id: 'dulce-llegada', nombre: 'Box detalles especiales', precio: 1490, foto: 'box-dulce-llegada.jpg', items: ['Zapatitos tejidos', 'Babero de algodón', 'Portachupete personalizado'] },
  { id: 'esencial', nombre: 'Box Esencial', precio: 1490, foto: 'box-esencial-rosa.jpg', items: ['Estuche de silicona para chupete', 'Mordillo de silicona y madera', 'Portachupete personalizado'] },
  { id: 'dulce-suenos', nombre: 'Box Dulce sueños', precio: 1590, foto: 'box-dulce-suenos.jpg', items: ['Trapito de apego', 'Portachupete personalizado'] },
  { id: 'primeros-mimos', nombre: 'Box Primeros mimos', precio: 1990, foto: 'box-primeros-mimos.jpg', items: ['Zapatitos tejidos', 'Babero de algodón', 'Sonajero de tela suave y seguro', 'Portachupete personalizado'] },
  { id: 'pequeno-tesoro', nombre: 'Box Pequeño tesoro', precio: 2190, foto: 'box-pequeno-tesoro.jpg', items: ['Trapito de apego', 'Zapatitos tejidos', 'Portachupete personalizado'] },
  { id: 'bienvenida', nombre: 'Box Bienvenida', precio: 2790, foto: 'box-bienvenida.jpg', items: ['Manta de muselina', 'Set de peine', 'Trapito de apego', 'Portachupete personalizado'] },
  { id: 'especial-manolito', nombre: 'Box especial Manolito', precio: 3190, foto: 'box-especial-manolito.jpg', etiqueta: 'COMPLETA', items: ['Manta de muselina', 'Babero de algodón', 'Zapatitos tejidos', 'Cepillo y peine de madera', 'Conejo de peluche', 'Portachupete personalizado'] },
].map(b => ({ etiqueta: null as string | null, ...b, foto: `assets/img/boxes/${b.foto}` }));

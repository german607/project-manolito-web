import express, { Router } from 'express';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';

// Imágenes del sitio (/assets/img/...).
// Con bucket (producción, Railway): se leen y se guardan en el bucket, bajo S3_PREFIJO.
// Sin bucket (desarrollo): se sirven del disco; las que se suben desde el admin van a backend/data/img
// para no pisar las del repo (que usa la vista de diseño).

// Acepta los nombres propios (S3_*) o los del preset "AWS SDK" de Railway (AWS_*)
const env = process.env;
const BUCKET = env.S3_BUCKET ?? env.AWS_S3_BUCKET_NAME;
const PREFIJO = process.env.S3_PREFIJO ?? 'assets/img/'; // carpeta del bucket donde están boxes/, marca/, etc.
const LOCAL = fileURLToPath(new URL('../data/img', import.meta.url));

const s3 = BUCKET ? new S3Client({
  endpoint: env.S3_ENDPOINT ?? env.AWS_ENDPOINT_URL,
  region: env.S3_REGION ?? env.AWS_DEFAULT_REGION ?? 'auto',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '',
  },
  forcePathStyle: process.env.S3_PATH_STYLE === 'true', // buckets viejos de Railway (lo indica la pestaña Credentials)
}) : null;

const UN_DIA = 86_400;

// ruta = relativa a /assets/img, ej. "boxes/mini-box.jpg"
export async function guardarImagen(ruta: string, datos: Buffer, tipo: string) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: PREFIJO + ruta, Body: datos, ContentType: tipo }));
  } else {
    mkdirSync(dirname(`${LOCAL}/${ruta}`), { recursive: true });
    writeFileSync(`${LOCAL}/${ruta}`, datos);
  }
}

export const imagenesRouter = Router();

if (s3) {
  // ponytail: cada imagen se pide al bucket; el navegador la guarda 1 día. Si hace falta más velocidad, Cloudflare delante
  imagenesRouter.get('/*ruta', async (req, res) => {
    const ruta = (req.params as { ruta: string[] }).ruta.join('/');
    if (ruta.split('/').some(p => !p || p === '..')) { res.sendStatus(404); return; }
    try {
      const o = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: PREFIJO + ruta, IfNoneMatch: req.headers['if-none-match'] }));
      res.set({ 'Content-Type': o.ContentType ?? 'application/octet-stream', 'Cache-Control': `public, max-age=${UN_DIA}` });
      if (o.ETag) res.set('ETag', o.ETag);
      if (o.ContentLength) res.set('Content-Length', String(o.ContentLength));
      (o.Body as Readable).pipe(res);
    } catch (e: any) {
      const status = e?.$metadata?.httpStatusCode;
      if (status === 304) { res.sendStatus(304); return; }        // el navegador ya la tiene
      if (status === 404 || e?.name === 'NoSuchKey') { res.sendStatus(404); return; }
      console.error('Bucket:', e?.name, e?.message);
      res.sendStatus(502);
    }
  });
} else {
  imagenesRouter.use(express.static(LOCAL, { maxAge: '1d' })); // subidas en desarrollo; si no está, sigue al disco del repo
}

// Al arrancar: avisa en el log si el bucket no responde o si las imágenes no están en S3_PREFIJO
export async function revisarBucket() {
  if (!s3) return console.log('Imágenes: desde el disco (sin S3_BUCKET ni AWS_S3_BUCKET_NAME).');
  const clave = `${PREFIJO}marca/manolito.png`;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: clave }));
    console.log(`Imágenes: desde el bucket ${BUCKET} (${PREFIJO}).`);
  } catch (e: any) {
    console.error(`⚠ Imágenes: no encuentro "${clave}" en el bucket ${BUCKET} (${e?.name}). Revisá S3_PREFIJO y las credenciales.`);
  }
}

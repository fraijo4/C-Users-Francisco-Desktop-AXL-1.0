/* Arma una versión de un solo archivo (dist/axl.html) juntando el HTML,
   el CSS y los dos archivos de JavaScript. Se usa para publicarla en línea.
   Uso:  node build.mjs                                                   */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const leer = f => fs.readFileSync(path.join(dir, f), 'utf8');

let html = leer('index.html');
const css = leer('styles.css');
const js = leer('datos-axl.js') + '\n' + leer('app.js');

/* Ojo: se usan funciones de reemplazo porque el código contiene $' y $&,
   que String.replace interpretaría como patrones y borraría parte del texto. */
html = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace(/<script src="datos-axl\.js"><\/script>\s*/, '')
  .replace('<script src="app.js"></script>', () => `<script>\n${js}\n</script>`);

/* La página publicada se inserta dentro de un <body> existente:
   se quitan las etiquetas del documento para no anidarlas. */
const cuerpo = html
  .replace(/^[\s\S]*?<body>/i, '')
  .replace(/<\/body>[\s\S]*$/i, '');
const cabeza = html.match(/<head>([\s\S]*?)<\/head>/i)[1];

fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'axl.html'), `<!DOCTYPE html>
<html lang="es">
<head>${cabeza}</head>
<body>${cuerpo}</body>
</html>
`);
fs.writeFileSync(path.join(dir, 'dist', 'axl-publicar.html'), cabeza.replace(/<meta[^>]*>\s*/g, '') + cuerpo);

console.log('dist/axl.html y dist/axl-publicar.html generados');

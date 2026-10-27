# Código Morse Completo

Aplicación web gratuita, sin anuncios y que funciona sin conexión para aprender
código Morse paso a paso, inspirada en el curso de la app «Morse Code Complete».
Se puede instalar en el móvil como si fuera una app (PWA).

## Qué incluye

**Curso guiado (73 lecciones en 6 secciones)**

| Sección | Contenido |
|---|---|
| 🔤 Letras | Todo el alfabeto (incluida la Ñ), de dos en dos |
| 🔢 Números | Del 0 al 9 |
| ❓ Puntuación | `. , ? / = - ' ( ) @ :` |
| 💬 Palabras y abreviaturas | Palabras cortas y comunes, jerga CW (CQ, 73, TNX, RST, OM, FB…) |
| 📡 Prosignos | AR, SK, BT, KN, AS, SOS, HH, KA |
| 📻 Códigos Q y QSO | QTH, QRZ, QSL, QRM, QRS… y un contacto (QSO) completo |

Cada subsección tiene lecciones para aprender elementos nuevos y un **repaso**;
cada sección termina con un **desafío** con 3 vidas. Las lecciones combinan:

- Presentación del elemento (sonido + patrón visual + significado)
- Escuchar y elegir la respuesta
- Leer el patrón y elegir
- Escuchar y escribir
- Transmitir con el manipulador en pantalla (o la barra espaciadora)

Se necesita un 80 % de aciertos para superar una lección (★ 80 %, ★★ 90 %, ★★★ 100 %),
y así se desbloquea la siguiente. El progreso se guarda en el dispositivo.

**Salidas** (se activan y desactivan en cualquier momento, también durante una lección):
🔊 sonido · 📳 vibración · ⚡ destello de pantalla · 🔦 linterna del móvil.
La vibración y la linterna funcionan en Chrome para Android (la linterna pide permiso
de cámara y necesita HTTPS); Safari en iPhone no permite ninguna de las dos.

**Además**

- **Práctica**: recepción de elementos al azar, copia de grupos de 5 caracteres
  (estilo método Koch) y envío libre con decodificación en tiempo real.
- **Traductor** texto ↔ Morse, con reproducción por sonido, luz (pantalla) o vibración.
- **Tabla** de referencia con todos los caracteres, prosignos, códigos Q y abreviaturas.
- **Ajustes**: temas Medianoche, Pizarra y Claro; timbre nítido o suave, velocidad de
  caracteres y velocidad efectiva (espaciado Farnsworth), tono, volumen, velocidad de envío
  y opción de desbloquear todo.

## Usarla

No necesita compilación ni dependencias. Basta con servir la carpeta:

```bash
npm start          # o: python3 -m http.server 8080
```

y abrir <http://localhost:8080>.

### Instalarla en el móvil

1. Publica el repositorio con **GitHub Pages**: *Settings → Pages → Build and deployment →
   Deploy from a branch*, elige la rama y la carpeta `/ (root)`.
2. Abre la URL que te da GitHub (`https://<usuario>.github.io/morse/`) en Chrome del móvil.
3. Menú ⋮ → **Añadir a pantalla de inicio / Instalar aplicación**.

Después funciona sin conexión.

## Desarrollo

```
index.html            Estructura y navegación
css/styles.css        Estilos (modo claro y oscuro)
js/morse.js           Tabla Morse, codificación, temporización, audio y manipulador
js/course.js          Estructura del curso y generador de ejercicios
js/app.js             Interfaz
sw.js                 Caché para uso sin conexión
test/                 Pruebas (node --test)
```

```bash
npm test
```

Para añadir contenido al curso, edita la constante `DEF` (y `MEANINGS`) en `js/course.js`.
Al publicar cambios, sube `VERSION` en `sw.js` para que los móviles descarguen la versión nueva.

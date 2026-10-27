# Código Morse Completo

Aplicación web gratuita, sin anuncios y que funciona sin conexión para aprender
código Morse paso a paso, inspirada en el curso de la app «Morse Code Complete».
Se puede instalar en el móvil como si fuera una app (PWA).

## Qué incluye

**Curso guiado en 6 secciones** (Alfabeto, Números, Puntuación, Palabras y abreviaturas,
Prosignos, Códigos Q y QSO). Cada subsección tiene lecciones de dos en dos caracteres,
un **repaso** y un **desafío con 3 vidas**, y todas se pueden hacer en dos modos:

- **Recepción**: suena el código y eliges el carácter entre botones grandes. El ojo
  muestra el patrón (una vez) y el botón ▶ lo repite.
- **Envío**: aparece el carácter y lo transmites manteniendo pulsada la zona inferior
  (o la barra espaciadora). La app aprende tu velocidad mientras manipulas y comprueba
  cada punto y raya al momento, sin esperar pausas entre letras.

Arriba se ven los aciertos/respuestas, la barra de progreso hasta el objetivo de la
sesión y la racha 🔥. Las estrellas dependen de la precisión, y superar una lección en
cualquiera de los dos modos desbloquea la siguiente.

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

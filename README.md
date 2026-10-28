# Código Morse Completo

Aplicación web gratuita, sin anuncios y que funciona sin conexión para aprender
código Morse paso a paso, inspirada en el curso de la app «Morse Code Complete».
Se puede instalar en el móvil como si fuera una app (PWA).

## Qué incluye

**Curso guiado en 6 secciones**: Caracteres (Alfabeto, Números y Puntuación), Palabras,
frases y oraciones, Prosignos, Códigos Q, Abreviaturas y Conceptos básicos del QSO en CW.
Cada subsección alterna lecciones (caracteres nuevos de dos en dos), repasos de todo lo
aprendido y desafíos con 3 vidas: tras la lección 3 y luego cada dos lecciones.

Todas las sesiones se hacen en dos modos que avanzan por separado:

- **Recepción**: suena el código y eliges la respuesta. En las lecciones hay dos botones;
  en repasos y desafíos, un teclado completo con solo lo aprendido activo. Se muestra la
  solución durante 1,5 segundos y se pasa a la siguiente.
- **Envío**: transmites el carácter manteniendo pulsada la zona inferior (o la barra
  espaciadora). Cada pulso se dibuja mientras lo mantienes (crece y pasa a raya al
  superar el umbral); la app aprende tu velocidad y comprueba cada punto y raya al momento.

Una sesión se supera con un 80 % de aciertos (sesiones de 20, 25 y 15 preguntas). La
pantalla de Lecciones muestra el progreso de recepción, desafíos y envío y la racha de días.

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

## Recordatorio diario (notificaciones)

Cada día a las 8:15 (hora de España) una tarea de GitHub Actions
(`.github/workflows/recordatorio.yml`) envía una notificación push al móvil.
Hay que configurarlo una sola vez:

1. **Clave privada.** En GitHub: *Settings → Secrets and variables → Actions →
   New repository secret*. Nombre `VAPID_PRIVATE_KEY`, valor: la clave privada que
   corresponde a `VAPID_PUBLIC_KEY` de `js/app.js`. No la subas nunca al repositorio.
2. **Activar en el móvil.** Abre la app instalada → *Ajustes → Recordatorio diario →
   Activar recordatorio*, acepta el permiso y pulsa *Copiar código*.
3. **Suscripción.** Crea otro secreto llamado `PUSH_SUBSCRIPTION` y pega el código.
   Para varios dispositivos, pon los códigos en una lista: `[{…}, {…}]`.
4. **Probar.** En la pestaña *Actions → Recordatorio diario → Run workflow* se envía
   un aviso al momento.

Notas:
- GitHub solo trabaja en UTC; hay dos ejecuciones (horario de verano e invierno) y el
  script solo envía en la que cae a las 8:15 en `Europe/Madrid`. Para cambiar la hora,
  edita los `cron` y `REMINDER_HOUR` del workflow.
- GitHub puede retrasar unos minutos las tareas programadas y las desactiva si el
  repositorio pasa 60 días sin actividad; se reactivan desde la pestaña *Actions*.
- Si desinstalas la app o borras sus datos, la suscripción caduca: actívala de nuevo y
  actualiza `PUSH_SUBSCRIPTION`. En iPhone hace falta iOS 16.4+ y la app instalada.

## Desarrollo

```
index.html            Estructura y navegación
css/styles.css        Estilos (modo claro y oscuro)
js/morse.js           Tabla Morse, codificación, temporización, audio y manipulador
js/course.js          Estructura del curso y generador de ejercicios
js/app.js             Interfaz
sw.js                 Caché sin conexión y notificaciones
scripts/              Envío del recordatorio diario
test/                 Pruebas (node --test)
```

```bash
npm test
```

Para añadir contenido al curso, edita la constante `DEF` (y `MEANINGS`) en `js/course.js`.
Al publicar cambios, sube `VERSION` en `sw.js` para que los móviles descarguen la versión nueva.

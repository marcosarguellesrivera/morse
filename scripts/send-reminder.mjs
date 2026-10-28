// Envía el recordatorio diario a las suscripciones guardadas en el secreto
// PUSH_SUBSCRIPTION. Lo ejecuta la tarea programada de GitHub Actions.
import webpush from 'web-push';

const {
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION,
  SCHEDULE, REMINDER_HOUR = '8', REMINDER_TZ = 'Europe/Madrid',
  VAPID_SUBJECT = 'https://marcosarguellesrivera.github.io/morse/'
} = process.env;

// Diferencia en horas entre la hora local de `tz` y UTC en este momento.
function utcOffset(tz, date = new Date()) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName').value; // p. ej. «GMT+1»
  const m = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) + Math.sign(Number(m[1])) * Number(m[2] || 0) / 60 : 0;
}

// GitHub programa en UTC y no conoce el cambio de hora, así que hay una
// ejecución para el horario de verano y otra para el de invierno. Cada una
// solo envía si es la que cae a REMINDER_HOUR en la zona horaria indicada,
// aunque GitHub la lance con retraso.
if (SCHEDULE) {
  const cronHour = Number(SCHEDULE.trim().split(/\s+/)[1]);
  const wanted = Number(REMINDER_HOUR) - cronHour;
  const now = utcOffset(REMINDER_TZ);
  if (now !== wanted) {
    console.log(`Esta ejecución es para UTC${wanted >= 0 ? '+' : ''}${wanted}; ahora ${REMINDER_TZ} está en UTC${now >= 0 ? '+' : ''}${now}. No toca enviar.`);
    process.exit(0);
  }
}

if (!VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
  console.error('Faltan los secretos VAPID_PRIVATE_KEY o PUSH_SUBSCRIPTION en el repositorio.');
  process.exit(1);
}

let subs;
try {
  subs = JSON.parse(PUSH_SUBSCRIPTION);
} catch (e) {
  console.error('El secreto PUSH_SUBSCRIPTION no es un JSON válido. Cópialo de nuevo desde Ajustes → Recordatorio diario.');
  process.exit(1);
}
if (!Array.isArray(subs)) subs = [subs];

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.trim());
const payload = JSON.stringify({ title: 'Código Morse', body: '¿Hacemos la lección de hoy? 📡' });

let sent = 0;
for (const [i, sub] of subs.entries()) {
  try {
    // Si el móvil está apagado, el aviso espera hasta 6 horas.
    await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' });
    sent++;
    console.log(`Dispositivo ${i + 1}: enviado.`);
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.error(`Dispositivo ${i + 1}: la suscripción ha caducado. Vuelve a activar el recordatorio en la app y actualiza el secreto PUSH_SUBSCRIPTION.`);
    } else {
      console.error(`Dispositivo ${i + 1}: error ${err.statusCode || ''} ${err.body || err.message}`);
    }
  }
}
if (!sent) process.exit(1);

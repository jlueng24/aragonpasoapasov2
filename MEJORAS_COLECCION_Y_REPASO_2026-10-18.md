# Mejoras de colección y repaso · 18/10/2026

Implementadas sobre la versión de 53 municipios completos.

## Cambios
- Progreso visible por comarca: Bajo Aragón, Matarraña / Matarranya y Maestrazgo.
- Barra de progreso y contador `descubiertos/total`; al 100 % se identifica como comarca completada.
- Celebración de comarca completada reforzada con confeti, insignia y mensaje 100 %.
- Favoritos persistentes en la colección mediante estrella.
- Filtro para ver todas las cartas o solo las favoritas.
- Reto de repaso de hasta 5 preguntas usando únicamente municipios ya descubiertos. No consume descubrimientos ni altera la ruta.
- Migración del guardado a versión 3, conservando cartas y expedición existente; añade favoritos sin perder progreso.

## Verificación
- 29/29 pruebas automáticas superadas.
- Se mantienen las reglas: máximo 4 respuestas en los retos de descubrimiento, datos reales, símbolos no inventados y nueva expedición sin borrar la colección.

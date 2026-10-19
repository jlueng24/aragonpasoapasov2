# Nueva expedición sin perder progreso

## Cambio principal
Se añade un botón visible **↻ Nueva expedición** en la cabecera cuando hay una expedición activa.

Al usarlo:
- se cierra únicamente la ruta actual del mapa;
- se vuelve al buscador de municipio de origen;
- se conservan todas las cartas obtenidas;
- se conservan las comarcas completadas y sus acabados visuales;
- se conserva el progreso anterior en el mismo `localStorage` (`aragon-explora-v1`).

## Compatibilidad
El formato de guardado interno pasa a versión 2, pero las partidas de versión 1 se migran automáticamente al abrir el juego. No es necesario borrar datos del navegador.

## Borrado total
La opción de ajustes mantiene un borrado completo independiente, claramente identificado y con confirmación. Es la única acción que elimina colección y logros.

## Pruebas
26/26 pruebas automáticas superadas, incluidas:
- migración desde partidas antiguas;
- conservación de colección al iniciar una nueva expedición;
- reinicio de la ruta actual;
- 53 municipios alcanzables;
- preguntas con máximo 4 opciones;
- ocultación de destinos no descubiertos;
- símbolos y datos culturales.

# Sistema de ediciones de cartas · 19/10/2026

## Decisión de diseño

- Todos los municipios comienzan siempre con una **carta genérica**.
- Una carta especial es una **edición adicional** del mismo municipio: nunca sustituye ni borra la genérica.
- Cada edición tiene su propio estado de favorito.
- Las ediciones especiales solo podrán aparecer cuando su evento esté activo y la edición haya sido desbloqueada.
- En esta versión los eventos especiales están preparados pero **inactivos**.

## Eventos preparados

### Huellas del Temple
- Estado: inactivo.
- Edición: `templar`.
- Municipio verificado dentro del ámbito actual: Castellote (44071).
- Fuente de verificación: Ayuntamiento de Castellote, documentación turística que indica el dominio templario durante el siglo XIII y el centro de interpretación de la Orden del Temple.
- https://www.castellote.es/wp-content/uploads/sites/37/2019/10/FOLLETO-CASTELLOTE-2019.pdf

Monzón queda fuera del catálogo actual y no se incorpora hasta ampliar el territorio y verificar su ficha antes de activar el evento.

### Ruta del Tambor y del Bombo
- Estado: inactivo.
- Edición: `tambor`.
- La Ruta oficial reúne nueve municipios: Albalate del Arzobispo, Alcañiz, Alcorisa, Andorra, Calanda, Híjar, La Puebla de Híjar, Samper de Calanda y Urrea de Gaén.
- De los 53 municipios actualmente jugables pertenecen a la Ruta: Alcañiz (44013), Alcorisa (44014) y Calanda (44051).
- Fuente oficial de la asociación: https://rutadeltamborybombo.com/

## Guardado y migración

El estado pasa a versión 4.

Los favoritos antiguos por municipio se migran automáticamente a la edición genérica (`municipio::base`). Los futuros favoritos de cartas especiales serán independientes (`municipio::templar`, `municipio::tambor`, etc.).

Se añade `unlockedEditions` al estado para registrar futuras ediciones desbloqueadas sin alterar la colección de municipios.

## Interfaz

- Todas las cartas genéricas muestran el distintivo `Genérica`.
- Todas las cartas muestran ☆ / ★ de favorito, incluida la vista ampliada.
- En Mis cartas aparece una sección de “Ediciones especiales” que informa de los eventos preparados y bloqueados.
- En municipios vinculados a un evento, la vista ampliada puede indicar la edición especial bloqueada.
- Ninguna carta especial se muestra como obtenida ni usable en esta versión.

## Fotografías

Esta actualización no incorpora imágenes generadas por IA al juego. El posterior rediseño fotográfico de la carta genérica deberá utilizar exclusivamente fotografías reales con procedencia y licencia verificadas.

## Verificación

34/34 pruebas automáticas superadas.

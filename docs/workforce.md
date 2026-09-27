# Talento humano: turnos y asistencia

El módulo reproduce los flujos de Gestión de Turnos y del Cuadre unificado de `dev-pc`, adaptados a WorkOS, el aislamiento por empresa y los permisos de Lab Trxckin. Todos los trabajadores de ejemplo son ficticios. Calcula tiempo, no salarios ni una nómina monetaria.

## Recorrido

1. Un administrador habilita las rutas `workforce/*` desde Administración → Accesos y configura responsables TH para la empresa.
2. TH crea sedes, grupos con gestores y trabajadores. Puede vincular una cuenta activa de la empresa a un trabajador; programar no requiere una cuenta vinculada.
3. Los gestores asignan plantillas en una semana domingo–sábado, revisan la previsualización y guardan. La selección admite filas, días y rangos, copiar la semana anterior y recurrencias finitas.
4. El trabajador registra su entrada/salida; un supervisor puede hacerlo individualmente por una persona de su grupo con observación. El origen de la evidencia queda identificado.
5. En Cuadre se comparan horas previstas, marcaciones originales y horas efectivas. Las correcciones requieren motivo; no sobrescriben los instantes originales.
6. Se revisan las jornadas y se cierra cada grupo/quincena. Los gestores disponen de cinco días calendario después del final. TH puede reabrir con motivo; un cierre nunca oculta sesiones abiertas o incidencias sin resolver.

## Pantallas

- `/workforce/scheduling`: grupos, plantillas y calendario semanal.
- `/workforce/attendance`: Cuadre, marcaciones, revisión, cierre y Excel.
- `/workforce/check-in`: entrada/salida desde el dispositivo.
- `/workforce/employees`: catálogo, jornada pactada y cuentas vinculadas.
- `/workforce/locations`: Google Maps, coordenadas y límites GPS.
- `/workforce/settings`: responsables, políticas y carga explícita de demostración.

Los nuevos permisos son aditivos. El rol `member` continúa recibiendo únicamente dashboard/perfil. No se copian números de rol de `dev-pc`: TH se configura por empresa y los gestores por grupo.

## Cálculo

`lib/workforce/calculation.ts` es la única calculadora, usada por las vistas previas y el servidor. Los datos comienzan en la semana de habilitación de cada empresa. El régimen soportado es jornada ordinaria de adultos del sector privado colombiano, desde el lanzamiento; no reconstruye regímenes especiales ni transiciones normativas históricas.

- Zona `America/Bogota`; semana domingo–sábado; hasta tres bloques de una misma jornada.
- Límites iniciales: ordinarias hasta 8 h diarias y 42 semanales; extras hasta 2 h diarias y 12 semanales. La jornada pactada puede ser menor.
- Nocturnidad: 19:00–06:00. El contador de una jornada nocturna no se reinicia al cruzar medianoche; el semanal sí sigue la semana civil configurada.
- Clasificación por ordinaria/extra, diurna/nocturna y día normal/descanso obligatorio o festivo. Descanso y festivo coincidentes no se duplican.
- Festivos colombianos calculados para el año consultado, reutilizando `convex/lib/colombiaHolidays.ts`.
- Deducción elegida para la demo: 60 minutos después de cuatro horas desde el inicio cuando la jornada supera seis horas. Su intervalo se une a pausas/gaps para no descontar dos veces. Es política de la demo, no una duración de almuerzo impuesta universalmente por ley.
- Instantes originales con segundos; resultados en minutos completos, sin truncar extras a bloques de 30. Los restos de minuto se acumulan dentro de la jornada y se asignan a la categoría en la que se completa el minuto.
- La semana completa de un empleado se calcula conjuntamente para evitar contar dos veces los excesos diarios y semanales. Los turnos nuevos fuera de límites se bloquean; tiempo efectivamente trabajado se conserva con una incidencia.
- Las asignaciones guardan el acuerdo y la política aplicados. Cambiar una plantilla o una política no reescribe históricos silenciosamente. Los cambios de límite semanal se publican para domingos futuros.

Referencias del régimen inicial: [Ley 2101 de 2021](https://cancilleria.gov.co/normograma/compilacion/docs/ley_2101_2021.htm), [Ley 2466 de 2025, artículos 10–14](https://cancilleria.gov.co/normograma/compilacion/docs/ley_2466_2025.htm), [Código Sustantivo del Trabajo, artículos 158–168](https://cancilleria.gov.co/normograma/compilacion/docs/codigo_sustantivo_trabajo.htm). Por decisión de alcance no hay liquidación de dinero, acuerdos flexibles, regímenes exceptuados ni importación de datos de origen.

## GPS y Google Maps

La API exige una ubicación reciente; utiliza la hora del servidor para la marcación. Defaults editables de cada sede: radio 150 m, tolerancia 30 m, precisión máxima 100 m y antigüedad máxima 60 segundos. Se evalúan todas las sedes habilitadas del grupo, o la sede específica del turno. No basta con que una sede sea la de centro más cercano.

Entrada/salida son acciones explícitas con control de revisión. Solo puede haber una sesión abierta por trabajador/empresa. La salida de un turno nocturno conserva la fecha de su jornada. Si no existe programación, el registro queda pendiente de conciliación. La marcación por supervisor registra su identidad y el GPS de su dispositivo, no afirma haber localizado el teléfono del trabajador.

Permiso GPS denegado, falta de conexión, posición inválida o distancia excesiva bloquean la marcación y permiten reintentar/corregir con auditoría. No hay seguimiento continuo ni cola offline. Si una respuesta se pierde, el mismo `requestId` devuelve la operación ya registrada sin duplicarla. Una ubicación de navegador no ofrece garantía contra falsificación de coordenadas.

Para el mapa, habilitar Maps JavaScript API y Places en un proyecto Google y configurar `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Restringir la clave por dominio y API. Sin clave, los formularios siguen admitiendo coordenadas. La clave pública se incorpora al build: para Docker usar el build argument homónimo; el workflow lee la variable homónima del repositorio. Ninguna clave real está incluida.

## Arquitectura y seguridad

Convex almacena el catálogo del módulo, membresías con vigencia, sedes, plantillas, jornadas, evidencia original, conciliaciones, políticas, cierres, auditoría e idempotencia. Nest/Postgres conserva identidad, roles y empresas: este módulo no necesita una nueva tabla SQL de empleados ni una conexión al ERP.

El cliente consulta `GET /api/workforce?companyId=&from=&to=` y envía comandos a `POST /api/workforce` con `{companyId, requestId, command}`. Las lecturas tienen un máximo de seis semanas; los comandos son una unión validada con Zod y las ediciones incluyen `expectedRevision`. `/api/workforce/directory` entrega únicamente cuentas activas elegibles de la empresa.

El intermediario Next obtiene el usuario real de WorkOS/Nest, rechaza suplantación, verifica empresa y construye el actor. Convex exige el secreto del servidor **y** el JWT coincidente, además de validar permisos y alcance por grupo/registro. No confía en actores, roles o totales enviados desde el navegador. Cada llamada usa su propio token, sin modificar el cliente Convex global.

Las respuestas de datos usan `private, no-store`. Las pantallas actualizan cada 15 segundos, al volver a la ventana y después de un comando. El cambio de empresa descarta la vista anterior; revisiones optimistas detectan cambios de otro gestor antes de sobrescribirlos.

El guardado GPS reúne evidencia y conciliación en una transacción. Los cierres y ediciones leen el mismo bloqueo; las correcciones conservan auditoría. Excel no contiene coordenadas precisas.

## Desarrollo y activación

Trabajar en la rama `codex/workforce-scheduling`. Usar un backend/Convex de desarrollo separado para una prueba con autenticación real; no reutilizar un despliegue productivo para sembrar la demo. Las pruebas `convex-test` son locales y no requieren bases de datos ni secretos reales.

1. Instalar dependencias y generar clientes Prisma como indica el README.
2. Configurar WorkOS, backend y Convex de desarrollo con el secreto compartido.
3. Ejecutar la generación/despliegue de funciones en ese entorno de desarrollo.
4. Actualizar el catálogo de permisos mediante el seed existente, que conserva a `member` sin accesos nuevos; asignar las rutas necesarias explícitamente.
5. En Configuración, cargar datos ficticios con la acción de demostración y configurar responsables. Ajustar una sede de prueba y vincular las cuentas que van a participar.
6. Para un teléfono, servir la app mediante HTTPS y registrar la URL de retorno correspondiente en WorkOS.

No ejecutar pasos de activación sobre producción durante la implementación. El cambio es aditivo; retirar sus permisos oculta el módulo sin eliminar datos. No eliminar tablas de Convex como mecanismo de reversión.

## Verificación

Pruebas focalizadas: `pnpm --filter frontend exec vitest run lib/workforce app/api/workforce convex/workforce.test.ts`.

Verificación de integración: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` con las variables de entorno requeridas por el proyecto. Los tests cubren fronteras temporales y GPS, aislamiento, suplantación, reintentos, revisión, cierre y preservación de históricos. La verificación en navegador debe cubrir escritorio/móvil, teclado, permisos GPS y fallback del mapa.

### Resultado de esta implementación

Verificado localmente el 25 de septiembre de 2026: tipos y build de los tres paquetes correctos; lint sin errores (48 advertencias preexistentes); 1.038 pruebas correctas, incluidas 99 del módulo. Para evitar dos timeouts de la suite existente bajo alta concurrencia, la ejecución final usó cuatro workers por paquete: `pnpm test '--' '--maxWorkers=4'`. Las pruebas de Excel generan y vuelven a leer un archivo real para verificar totales, categorías, celdas pendientes, incidencias, identificación de empresa y ausencia de evidencia GPS.

El navegador verificó selección y cambio de plantilla, cálculo visible, deshacer, previsualización, diálogo de conciliación, modo supervisor y expansión de grupos con teclado. Se capturaron la [programación de escritorio](../apps/frontend/.impeccable/review/workforce/desktop.png) y la [marcación móvil](../apps/frontend/.impeccable/review/workforce/mobile.png) con datos ficticios en una vista local aislada. La persistencia, concurrencia y autorización se comprobaron con `convex-test`; la vista visual no utilizó servicios ni datos de producción.

La prueba con una cuenta real, GPS físico desde un teléfono mediante HTTPS y Google Maps con una clave habilitada requiere activar el entorno de desarrollo descrito arriba. No se ejecutó ese despliegue ni se modificaron datos productivos. El build local utilizó valores de entorno ficticios.

No están incluidos dispositivos biométricos, nómina monetaria, marcación masiva por supervisor, cola offline o migración de `dev-pc`.

# Calificación de Equipo Administrativo · Glow Up

## Cambios principales

- Dashboard en tema claro, más alineado con interfaces institucionales de Musicala.
- Nuevas estadísticas del período:
  - Miembros activos.
  - Evaluados del período.
  - Cobertura porcentual.
  - Promedio general.
  - Alertas por promedio menor a 3.0.
  - Total de evaluaciones históricas.
- Nuevo panel **Acumulado total por miembro**:
  - Puntos acumulados.
  - Promedio histórico.
  - Número de evaluaciones.
  - Tendencia frente al período anterior.
- Nuevo panel de pendientes por evaluar en el período seleccionado.
- Tendencia mensual del equipo con barras visuales.
- Diagnóstico de ítems más bajos con barras de desempeño.
- Tarjetas de equipo mejoradas con promedio del período, puntos históricos y tendencia.
- Historial individual ampliado:
  - Evaluaciones totales.
  - Puntos acumulados.
  - Mejor período.
  - Tendencia.
  - Puntos por evaluación.
  - Promedio histórico por criterio.

## Nota técnica

La app conserva la estructura actual con Firebase/Firestore. Se agregó un listener histórico sobre la colección `evaluaciones` para calcular acumulados y tendencias. Si las reglas de Firestore restringen lecturas generales de la colección, el dashboard del período seguirá funcionando, pero el acumulado histórico necesitará permiso de lectura sobre `evaluaciones`.

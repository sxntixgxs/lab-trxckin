import { describe, expect, it } from 'vitest';
import {
  assistantCellLabel,
  assistantCompletenessNote,
  assistantFieldLabel,
  assistantStatusLabel,
  assistantSummaryLabel,
  knownAssistantStatusLabel,
} from './assistant-labels';

describe('assistant business labels', () => {
  it('labels metric keys while retaining the currency qualifier', () => {
    expect(assistantFieldLabel('totalFactura')).toBe('Total de factura');
    expect(assistantFieldLabel('valorAPagar_COP')).toBe('Valor a pagar (COP)');
    expect(assistantFieldLabel('valorContable_sin_moneda')).toBe('Valor contable (sin moneda)');
    expect(assistantFieldLabel('nit')).toBe('NIT');
  });
  it('uses each module’s workflow vocabulary', () => {
    expect(assistantStatusLabel('revision_lider', 'billing')).toBe('Líder');
    expect(assistantStatusLabel('cerrada', 'billing')).toBe('Cerrada');
    expect(assistantStatusLabel('V_PENDIENTE_LEGALIZACION', 'advances')).toBe('Pendiente legalización');
    expect(assistantStatusLabel('COMPLETADO', 'advances')).toBe('Legalizado');
    expect(assistantStatusLabel('COMPLETADO', 'suppliers')).toBe('Completado');
    expect(knownAssistantStatusLabel('revision_lider')).toBe('Líder');
    expect(knownAssistantStatusLabel('COMPLETADO')).toBeUndefined();
    expect(knownAssistantStatusLabel('arbitrary_identifier')).toBeUndefined();
  });
  it('formats displayed cells without altering raw data keys or values', () => {
    const row = Object.freeze({ estado: 'revision_lider', totalFactura: 2000, moneda: 'COP' });
    expect(assistantCellLabel('estado', row.estado, 'billing')).toBe('Líder');
    expect(assistantCellLabel('totalFactura', row.totalFactura, 'billing', row.moneda)).toContain('2.000');
    expect(row.estado).toBe('revision_lider');
    expect(row.totalFactura).toBe(2000);
    expect(assistantSummaryLabel('totalFactura_COP', 2000)).toContain('2.000');
    expect(assistantCellLabel('empresa', 2)).toBe('Cordillera');
    expect(assistantCellLabel('totalFactura', null)).toBe('—');
  });
  it('explains historical pagination notes while keeping the empty-page caveat', () => {
    const note = assistantCompletenessNote(
      'Resultados parciales; continúa con nextCursor si está presente. Una página vacía no significa que no existan coincidencias.',
    );
    expect(note).toContain('cuando haya más resultados disponibles');
    expect(note).toContain('Una página vacía no significa que no existan coincidencias.');
    expect(note).not.toContain('nextCursor');
  });
  it('explains saved coverage exclusions and preserves unavailable-amount meaning', () => {
    const note = assistantCompletenessNote(
      'Listado basado en la proyección de facturación; las filas sin proyección requieren consulta por ID. No se calcula valorAPagar (COP): hay registros sin ese importe.',
    );
    expect(note).toContain('puede omitir facturas');
    expect(note).toContain('detalle en Facturación');
    expect(note).toContain('No se calcula valor a pagar (COP): hay registros sin ese importe.');
    expect(note).not.toMatch(/proyección|consulta por ID|valorAPagar/);
  });
  it('retains material limits, synchronization dates and permission caveats', () => {
    const note =
      'Resumen incompleto: límite de 250 registros por empresa o saldos no disponibles. Última sincronización completa: 2026-09-25. Solo se muestran facturas cuya consulta también está autorizada.';
    expect(assistantCompletenessNote(note)).toBe(note);
    expect(
      assistantCompletenessNote(
        'Cobertura de la proyección operativa del módulo; registros antiguos sin proyección no están incluidos.',
      ),
    ).toContain('puede omitir registros antiguos');
  });
});

import { describe, it, expect } from 'vitest';
import { validateStepSectorInfo, StepSectorInfoValues } from '../StepSectorInfo';

describe('StepSectorInfo validation', () => {
  it('returns no errors when all fields are valid', () => {
    const values: StepSectorInfoValues = { nodeName: 'Node Pintu Utara', sektorId: 'S-01' };
    const errors = validateStepSectorInfo(values);
    expect(errors).toEqual({});
  });

  it('returns error when nodeName is empty', () => {
    const values: StepSectorInfoValues = { nodeName: '', sektorId: 'S-01' };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node wajib diisi');
  });

  it('returns error when nodeName is only whitespace', () => {
    const values: StepSectorInfoValues = { nodeName: '   ', sektorId: 'S-01' };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node wajib diisi');
  });

  it('returns error when nodeName exceeds 100 characters', () => {
    const values: StepSectorInfoValues = { nodeName: 'a'.repeat(101), sektorId: 'S-01' };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node maksimal 100 karakter');
  });

  it('accepts nodeName with exactly 100 characters', () => {
    const values: StepSectorInfoValues = { nodeName: 'a'.repeat(100), sektorId: 'S-01' };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBeUndefined();
  });

  it('accepts nodeName with 1 character', () => {
    const values: StepSectorInfoValues = { nodeName: 'x', sektorId: 'S-01' };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBeUndefined();
  });

  it('returns error when sektorId is empty', () => {
    const values: StepSectorInfoValues = { nodeName: 'Node 1', sektorId: '' };
    const errors = validateStepSectorInfo(values);
    expect(errors.sektorId).toBe('Sektor wajib dipilih');
  });

  it('returns both errors when both fields are invalid', () => {
    const values: StepSectorInfoValues = { nodeName: '', sektorId: '' };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node wajib diisi');
    expect(errors.sektorId).toBe('Sektor wajib dipilih');
  });

  it('accepts any non-empty sektorId', () => {
    const values: StepSectorInfoValues = { nodeName: 'Test', sektorId: 'any-id-123' };
    const errors = validateStepSectorInfo(values);
    expect(errors.sektorId).toBeUndefined();
  });
});

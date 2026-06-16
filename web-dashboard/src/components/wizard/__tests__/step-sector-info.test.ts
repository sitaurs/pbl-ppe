import { describe, it, expect } from 'vitest';
import { validateStepSectorInfo, StepSectorInfoValues } from '../StepSectorInfo';

describe('StepSectorInfo validation', () => {
  it('returns no errors when all fields are valid', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node Pintu Utara',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '6281358959349',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors).toEqual({});
  });

  it('returns error when nodeName is empty', () => {
    const values: StepSectorInfoValues = {
      nodeName: '',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node wajib diisi');
  });

  it('returns error when nodeName is only whitespace', () => {
    const values: StepSectorInfoValues = {
      nodeName: '   ',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node wajib diisi');
  });

  it('returns error when nodeName exceeds 100 characters', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'a'.repeat(101),
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node maksimal 100 karakter');
  });

  it('accepts nodeName with exactly 100 characters', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'a'.repeat(100),
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBeUndefined();
  });

  it('accepts nodeName with 1 character', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'x',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBeUndefined();
  });

  it('returns error when sektorId is empty', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: '',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.sektorId).toBe('Sektor wajib dipilih');
  });

  it('returns both errors when both fields are invalid', () => {
    const values: StepSectorInfoValues = {
      nodeName: '',
      sektorId: '',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.nodeName).toBe('Nama node wajib diisi');
    expect(errors.sektorId).toBe('Sektor wajib dipilih');
  });

  it('accepts any non-empty sektorId', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Test',
      sektorId: 'any-id-123',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.sektorId).toBeUndefined();
  });

  // --- Bug 2 (PIC) — klausa 2.3, 2.4 ---

  it('returns error when picName is empty', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: '',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picName).toBe('Nama PIC wajib diisi');
  });

  it('returns error when picName is only whitespace', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: '   ',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picName).toBe('Nama PIC wajib diisi');
  });

  it('returns error when picName exceeds 100 characters', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: 'a'.repeat(101),
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picName).toBe('Nama PIC maksimal 100 karakter');
  });

  it('accepts empty picPhone (opt-out alert WA)', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picPhone).toBeUndefined();
  });

  it('returns error when picPhone is non-empty but invalid', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: 'abcd',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picPhone).toBe('Format nomor WhatsApp tidak valid');
  });

  it('accepts picPhone in 62… format', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '6281358959349',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picPhone).toBeUndefined();
  });

  it('accepts picPhone starting with 0 (will normalize to 62…)', () => {
    const values: StepSectorInfoValues = {
      nodeName: 'Node 1',
      sektorId: 'S-01',
      picName: 'Operator A',
      picPhone: '081358959349',
    };
    const errors = validateStepSectorInfo(values);
    expect(errors.picPhone).toBeUndefined();
  });
});

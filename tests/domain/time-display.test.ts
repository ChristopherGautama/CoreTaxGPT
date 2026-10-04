import { describe, expect, it } from 'vitest';
import { toJakartaDateTimeInput } from '../../src/features/Payments';

describe('clock form Asia/Jakarta', () => {
  it('shows the same WIB wall time for Z and +07:00 instants', () => {
    expect(toJakartaDateTimeInput('2026-11-15T02:00:00.000Z')).toBe('2026-11-15T09:00');
    expect(toJakartaDateTimeInput('2026-11-15T09:00:00+07:00')).toBe('2026-11-15T09:00');
  });

  it('preserves the instant when an unchanged minute-precision field is submitted', () => {
    for (const instant of ['2026-11-15T02:00:00.000Z', '2026-11-15T09:00:00+07:00']) {
      const submitted = `${toJakartaDateTimeInput(instant)}:00+07:00`;
      expect(Date.parse(submitted)).toBe(Date.parse(instant));
    }
  });

  it('normalizes across the Jakarta day and year boundary', () => {
    expect(toJakartaDateTimeInput('2026-12-31T18:30:00Z')).toBe('2027-01-01T01:30');
  });
});

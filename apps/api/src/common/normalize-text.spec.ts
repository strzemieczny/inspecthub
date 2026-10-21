import { normalizeText } from './normalize-text';

describe('human-authored text normalization', () => {
  it.each([
    [' \t  Czy\u00a0\u202f  część jest   OK? \r\n', 'Czy część jest OK?'],
    [
      '\ufeff\u200bZa\u00adżółć\u2060 gęślą\u200e\u202e\u2069\u0000 ',
      'Zażółć gęślą',
    ],
    [' \n\t\u200b\ufeff ', ''],
    [
      '  Cafe\u0301 — Ø 10 ± 0,5 mm; A/B + C. 👩‍🔧  ',
      'Café — Ø 10 ± 0,5 mm; A/B + C. 👩‍🔧',
    ],
    [
      'Linia 1\r\nLinia 2\rLinia 3\u2028Linia 4',
      'Linia 1 Linia 2 Linia 3 Linia 4',
    ],
  ])(
    'normalizes %j without changing meaningful characters',
    (input, expected) => {
      expect(normalizeText(input)).toBe(expected);
      expect(normalizeText(normalizeText(input))).toBe(expected);
    },
  );

  it('preserves paragraphs and list structure in descriptions', () => {
    const input =
      ' \r\n  Krok   1. \r\n\t- Sprawdź  część. \n \n\n\n  Krok  2.  \n ';
    const expected = 'Krok 1.\n- Sprawdź część.\n\nKrok 2.';
    expect(normalizeText(input, true)).toBe(expected);
    expect(normalizeText(expected, true)).toBe(expected);
  });
});

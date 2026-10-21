export type MediaPurpose = 'forms' | 'inspections';

export const LEGACY_OBJECT_NAME_PATTERN =
  /^\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[a-z0-9]{1,10})?$/i;

export function isMediaObjectName(name: string): boolean {
  return LEGACY_OBJECT_NAME_PATTERN.test(
    name.replace(/^(forms|inspections)\//, ''),
  );
}

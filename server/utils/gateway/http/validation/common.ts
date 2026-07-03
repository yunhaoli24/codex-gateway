import { createError } from "h3";
import { z } from "zod";

export const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

export function requireRecord<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw createError({ statusCode: 404, statusMessage: message });
  }
  return value;
}

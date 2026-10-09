import { ToolInputError } from '@/src/server/agent/tools/types';

type Input = Record<string, unknown>;

export function optionalString(input: Input, key: string, maxLength = 500): string | undefined {
  const value = input[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ToolInputError(`${key} must be a string`);
  return value.slice(0, maxLength);
}

export function requiredString(input: Input, key: string, maxLength = 10_000): string {
  const value = optionalString(input, key, maxLength);
  if (value === undefined) throw new ToolInputError(`${key} is required`);
  return value;
}

export function optionalDate(input: Input, key: string): string | undefined {
  const value = optionalString(input, key);
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ToolInputError(`${key} must be an ISO 8601 date`);
  return date.toISOString();
}

export function requiredDate(input: Input, key: string): string {
  const value = optionalDate(input, key);
  if (value === undefined) throw new ToolInputError(`${key} is required`);
  return value;
}

export function boundedInt(input: Input, key: string, fallback: number, min: number, max: number) {
  const value = input[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new ToolInputError(`${key} must be an integer`);
  return Math.min(Math.max(value, min), max);
}

export function stringList(input: Input, key: string, maxItems = 20): string[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== 'string'))
    throw new ToolInputError(`${key} must be a non-empty list of strings`);
  return (value as string[]).slice(0, maxItems);
}

import { z } from 'zod';
import { studyTypes } from '../types.js';

const nullableText = z.string().nullable();
const timestamp = z.string().datetime({ offset: true });
const nonEmptyObject = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

export const idParamSchema = z.object({ id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer.') });

export const createSessionSchema = z.object({
  sub_id: z.number().int().positive(),
  study_type: z.enum(studyTypes),
  started_at: timestamp.optional(),
  topics: nullableText.optional(),
  note: nullableText.optional(),
}).strict();

export const stopSessionSchema = z.object({ stopped_at: timestamp.optional() }).strict();

export const patchSessionSchema = nonEmptyObject(z.object({
  sub_id: z.number().int().positive().optional(),
  study_type: z.enum(studyTypes).optional(),
  started_at: timestamp.optional(),
  stopped_at: timestamp.nullable().optional(),
  topics: nullableText.optional(),
  note: nullableText.optional(),
}).strict());

export const revisionPatchSchema = nonEmptyObject(z.object({
  revision_number: z.number().int().nonnegative().nullable().optional(),
  topics: nullableText.optional(),
  notes: nullableText.optional(),
}).strict());

export const lecturePatchSchema = nonEmptyObject(z.object({
  topic: nullableText.optional(),
  notes: nullableText.optional(),
}).strict());

const questionCount = z.number().int().nonnegative();
export const qsolvePatchSchema = nonEmptyObject(z.object({
  topic: nullableText.optional(),
  questions_attempted: questionCount.optional(),
  questions_correct: questionCount.optional(),
  questions_wrong: questionCount.optional(),
}).strict());

export const testPatchSchema = nonEmptyObject(z.object({
  test_name: z.string().min(1).optional(),
  questions_attempted: questionCount.optional(),
  questions_correct: questionCount.optional(),
  score: z.number().nonnegative().nullable().optional(),
  max_score: z.number().nonnegative().nullable().optional(),
  notes: nullableText.optional(),
}).strict());

export const analysisPatchSchema = nonEmptyObject(z.object({
  analysis_type: nullableText.optional(),
  findings: nullableText.optional(),
  action_items: nullableText.optional(),
  notes: nullableText.optional(),
}).strict());

export const dateQuerySchema = z.object({ date: z.string() }).strict();
export const dateRangeQuerySchema = z.object({ from: z.string(), to: z.string() }).strict();
export const weeklyQuerySchema = z.object({ week_start: z.string() }).strict();
export const monthlyQuerySchema = z.object({ year: z.coerce.number().int().min(1), month: z.coerce.number().int().min(1).max(12) }).strict();

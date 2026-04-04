import { z } from 'zod';

export const RegisterSchema = z.object({
  legal_name: z.string().min(2).max(200).trim(),
  gstin:      z.string().length(15).trim().optional(),
  role:       z.enum(['supplier', 'buyer']),
  email:      z.string().email().trim(),
  password:   z.string().min(8),
});

export const LoginSchema = z.object({
  email:    z.string().email().trim(),
  password: z.string().min(1),
});
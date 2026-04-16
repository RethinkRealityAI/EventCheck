import { createSponsorForm } from '../../components/Sponsors/createSponsorForm';
import type { Form } from '../../types';

export function buildSponsorForm(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  const f = createSponsorForm();
  const { id, status, createdAt, ...rest } = f as any;
  return rest;
}

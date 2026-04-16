import type { Form } from '../../types';

export function buildBlank(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'New Form',
    description: '',
    fields: [],
    thankYouMessage: 'Thanks for registering!',
    settings: {},
    formType: 'event',
  } as any;
}

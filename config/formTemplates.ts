import type { Form } from '../types';
import type { SiteKey } from './sites';
import { buildBlank } from './formTemplates/buildBlank';
import { buildSponsorForm } from './formTemplates/buildSponsorForm';
import { buildGansidIndividualGroup } from './formTemplates/buildGansidIndividualGroup';

export interface FormTemplate {
  key: string;
  displayName: string;
  description: string;
  siteFilter?: SiteKey[];
  build: () => Omit<Form, 'id' | 'status' | 'createdAt'>;
}

export const TEMPLATES: FormTemplate[] = [
  { key: 'blank', displayName: 'Blank form',
    description: 'Start with an empty form and add fields manually.',
    build: buildBlank },
  { key: 'sponsor', displayName: 'Sponsor form',
    description: 'Outreach, tiers, scholarship/ad/booth add-ons, PayPal or cheque.',
    build: buildSponsorForm },
  { key: 'gansid-individual-group', displayName: 'GANSID Individual + Group Registration',
    description: 'Congress registration with Individual/Group path selector and dynamic per-person pricing.',
    siteFilter: ['gansid'],
    build: buildGansidIndividualGroup },
];

export function availableTemplatesForSite(siteKey: SiteKey): FormTemplate[] {
  return TEMPLATES.filter(t => !t.siteFilter || t.siteFilter.includes(siteKey));
}

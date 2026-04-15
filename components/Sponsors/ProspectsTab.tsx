import React from 'react';
import { SponsorProspect, AppSettings } from '../../types';
interface Props { prospects: SponsorProspect[]; settings: AppSettings; onChanged: () => void | Promise<void>; }
const ProspectsTab: React.FC<Props> = () => <div className="p-8 text-slate-500">Prospects tab — coming in Phase E</div>;
export default ProspectsTab;

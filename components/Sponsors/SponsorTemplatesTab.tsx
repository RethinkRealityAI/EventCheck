import React from 'react';
import { AppSettings } from '../../types';
interface Props { settings: AppSettings; onSaved: () => void | Promise<void>; }
const SponsorTemplatesTab: React.FC<Props> = () => <div className="p-8 text-slate-500">Templates tab — coming in Phase E</div>;
export default SponsorTemplatesTab;

import { Outlet } from 'react-router-dom';

export function PortalLayout() {
  return <div className="portal-root min-h-screen"><Outlet /></div>;
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../../../services/supabaseClient';
import { useAuth } from '../../AuthContext';
import { mapVirtualSessionRow, type VirtualSession } from '../../../utils/virtualSessions';

/**
 * Virtual presentations for the signed-in user, loaded once per portal visit.
 *
 * Visibility is enforced by the database, not here: `virtual_sessions` RLS
 * returns rows only to admins and to listed virtual presenters, so for anyone
 * else `sessions` is simply empty and every virtual surface stays hidden.
 * `myKey` comes from my_virtual_presenter_key() (matches the account email).
 */
export interface VirtualSessionsState {
  loaded: boolean;
  sessions: VirtualSession[];
  byId: Map<string, VirtualSession>;
  /** The signed-in user's presenter key, or null if they are not presenting virtually. */
  myKey: string | null;
  isAdmin: boolean;
  /** Admins and virtual presenters — the only people who see any of this. */
  canSee: boolean;
}

const EMPTY: VirtualSessionsState = {
  loaded: false,
  sessions: [],
  byId: new Map(),
  myKey: null,
  isAdmin: false,
  canSee: false,
};

export const VirtualSessionsContext = createContext<VirtualSessionsState>(EMPTY);

export function useVirtualSessions(): VirtualSessionsState {
  return useContext(VirtualSessionsContext);
}

export function VirtualSessionsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [data, setData] = useState<{ sessions: VirtualSession[]; myKey: string | null; loaded: boolean }>({
    sessions: [],
    myKey: null,
    loaded: false,
  });

  useEffect(() => {
    if (!user) {
      setData({ sessions: [], myKey: null, loaded: true });
      return;
    }
    let alive = true;
    Promise.all([
      supabase.from('virtual_sessions').select('session_id, zoom_url, meeting_id, presenters'),
      supabase.rpc('my_virtual_presenter_key'),
    ]).then(([rows, key]) => {
      if (!alive) return;
      if (rows.error) console.error('virtual_sessions', rows.error);
      const sessions = (rows.data ?? []).map(mapVirtualSessionRow).filter((v): v is VirtualSession => !!v);
      setData({ sessions, myKey: typeof key.data === 'string' && key.data ? key.data : null, loaded: true });
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const value = useMemo<VirtualSessionsState>(() => {
    const byId = new Map(data.sessions.map((s) => [s.sessionId, s]));
    return {
      loaded: data.loaded,
      sessions: data.sessions,
      byId,
      myKey: data.myKey,
      isAdmin,
      canSee: data.sessions.length > 0 && (isAdmin || !!data.myKey),
    };
  }, [data, isAdmin]);

  return <VirtualSessionsContext.Provider value={value}>{children}</VirtualSessionsContext.Provider>;
}

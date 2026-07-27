import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Bill, BillItem, Consumes, Member } from '../domain/types';

const STORAGE_KEY = 'hanmao:state:v1';

const empty: AppState = { members: [], bills: [], venue: null };

/** สร้าง id แบบง่าย ไม่ต้องพึ่ง lib ภายนอก */
let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

type Store = {
  state: AppState;
  ready: boolean;
  // members
  addMember: (name: string, consumes: Consumes) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  removeMember: (id: string) => void;
  toggleArrived: (id: string) => void;
  toggleLeft: (id: string) => void;
  // bills
  addBill: (name: string, category: Bill['category']) => string;
  updateBill: (id: string, patch: Partial<Bill>) => void;
  removeBill: (id: string) => void;
  addItem: (billId: string, name: string, price: number) => void;
  updateItem: (billId: string, itemId: string, patch: Partial<BillItem>) => void;
  removeItem: (billId: string, itemId: string) => void;
  toggleItemParticipant: (billId: string, itemId: string, memberId: string) => void;
  // venue
  setVenue: (v: AppState['venue']) => void;
  reset: () => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(empty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState({ ...empty, ...JSON.parse(raw) });
      } catch {
        // เริ่มด้วยสถานะว่างถ้าโหลดไม่ได้
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const api = useMemo<Store>(() => {
    const mutBill = (id: string, fn: (b: Bill) => Bill) =>
      setState((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? fn(b) : b)) }));

    return {
      state,
      ready,
      addMember: (name, consumes) =>
        setState((s) => ({
          ...s,
          members: [
            ...s.members,
            { id: uid('m'), name: name.trim(), consumes, arrivedAt: null, leftAt: null },
          ],
        })),
      updateMember: (id, patch) =>
        setState((s) => ({
          ...s,
          members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeMember: (id) =>
        setState((s) => ({
          ...s,
          members: s.members.filter((m) => m.id !== id),
          bills: s.bills.map((b) => ({
            ...b,
            paidById: b.paidById === id ? null : b.paidById,
            memberIds: b.memberIds.filter((x) => x !== id),
            items: b.items.map((it) => ({
              ...it,
              participantIds: it.participantIds.filter((x) => x !== id),
            })),
          })),
        })),
      toggleArrived: (id) =>
        setState((s) => ({
          ...s,
          members: s.members.map((m) =>
            m.id === id ? { ...m, arrivedAt: m.arrivedAt ? null : Date.now() } : m,
          ),
        })),
      toggleLeft: (id) =>
        setState((s) => ({
          ...s,
          members: s.members.map((m) =>
            m.id === id ? { ...m, leftAt: m.leftAt ? null : Date.now() } : m,
          ),
        })),
      addBill: (name, category) => {
        const id = uid('b');
        setState((s) => ({
          ...s,
          bills: [
            ...s.bills,
            {
              id,
              name: name.trim(),
              category,
              splitMode: 'equal',
              items: [],
              memberIds: [],
              paidById: null,
              discount: 0,
              serviceChargePct: 0,
              vatPct: 0,
              createdAt: Date.now(),
            },
          ],
        }));
        return id;
      },
      updateBill: (id, patch) => mutBill(id, (b) => ({ ...b, ...patch })),
      removeBill: (id) => setState((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) })),
      addItem: (billId, name, price) =>
        mutBill(billId, (b) => ({
          ...b,
          items: [...b.items, { id: uid('it'), name: name.trim(), price, participantIds: [] }],
        })),
      updateItem: (billId, itemId, patch) =>
        mutBill(billId, (b) => ({
          ...b,
          items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        })),
      removeItem: (billId, itemId) =>
        mutBill(billId, (b) => ({ ...b, items: b.items.filter((it) => it.id !== itemId) })),
      toggleItemParticipant: (billId, itemId, memberId) =>
        mutBill(billId, (b) => ({
          ...b,
          items: b.items.map((it) => {
            if (it.id !== itemId) return it;
            const has = it.participantIds.includes(memberId);
            return {
              ...it,
              participantIds: has
                ? it.participantIds.filter((x) => x !== memberId)
                : [...it.participantIds, memberId],
            };
          }),
        })),
      setVenue: (v) => setState((s) => ({ ...s, venue: v })),
      reset: () => setState(empty),
    };
  }, [state, ready]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

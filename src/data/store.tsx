import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Bill, BillItem, Consumes, Group, Member } from '../domain/types';
import {
  billPatchToRow,
  billToRow,
  fetchGroupState,
  itemPatchToRow,
  itemToRow,
  memberPatchToRow,
  memberToRow,
  subscribeGroup,
} from './remote';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { inviteCode, uuid } from '../utils/id';

const STORAGE_KEY = 'hanmao:state:v1';
const SESSION_KEY = 'hanmao:session:v1'; // ชี้ว่าอยู่วงไหน + เราเป็น member ไหน (ไว้กลับเข้าวงเดิม)
const ME_KEY = 'hanmao:me:v1'; // "ฉันคือ member ไหน" ในโหมด local (group mode เก็บใน SESSION_KEY)

const empty: AppState = { members: [], bills: [], venue: null, settlements: [] };

type Mode = 'local' | 'group';

type Store = {
  state: AppState;
  ready: boolean;
  // members
  addMember: (name: string, consumes: Consumes, promptPay?: string | null) => void;
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
  /** ติ๊ก/ยกเลิก "โอนแล้ว/จ่ายแล้ว" ของรายการโอนหนึ่ง (key = `${fromId}>${toId}`) */
  toggleSettlement: (key: string) => void;
  /**
   * ปิดวง/เคลียร์ทั้งหมด (เรียกเมื่อจ่ายครบทุกคนแล้ว)
   * - local mode: ล้าง state ทั้งหมดกลับเป็นว่าง
   * - group mode: ลบวงถาวรสำหรับทุกคน แล้วกลับ local mode
   */
  closeGroup: () => Promise<void>;
  // ---- group (multi-user) ----
  mode: Mode;
  group: Group | null;
  myMemberId: string | null;
  /** ตั้งว่า "ฉันคือ member ไหน" (โหมด local — สำหรับแท็บสรุปของฉัน); null = ล้าง */
  setMe: (memberId: string | null) => void;
  /** backend พร้อมใช้ไหม (มี env Supabase) */
  remoteEnabled: boolean;
  /** สร้างวงใหม่ แล้วย้าย state ปัจจุบัน (local) ขึ้นวง */
  createGroup: (groupName: string) => Promise<Group>;
  /** เข้าร่วมวงด้วยโค้ดเชิญ (จาก invite link/QR) */
  joinGroup: (code: string) => Promise<void>;
  /** ผูกตัวเองกับ member ที่มีอยู่ในวง */
  claimMember: (memberId: string) => Promise<void>;
  /** เข้าร่วมเป็น member ใหม่ (สร้าง member + claim) */
  joinAsNewMember: (name: string, consumes: Consumes) => Promise<void>;
  /** ออกจากวง → กลับ local mode */
  leaveGroup: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

/** สร้าง Bill ใหม่ (ใช้ร่วมทั้ง local/group) */
function newBill(id: string, name: string, category: Bill['category']): Bill {
  return {
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
  };
}

export function StoreProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [state, setState] = useState<AppState>(empty);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('local');
  const [group, setGroup] = useState<Group | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // ให้ mutation ใน group mode อ่าน groupId ล่าสุดได้โดยไม่ผูกกับ closure เก่า
  const groupIdRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>('local');
  modeRef.current = mode;

  const remoteEnabled = supabase != null;

  // ---------- โหลด/บันทึก local + กลับเข้าวงเดิมอัตโนมัติ ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState({ ...empty, ...JSON.parse(raw) });
        // "ฉันคือใคร" ในโหมด local (group mode จะถูก override ตอน enterGroup)
        const me = await AsyncStorage.getItem(ME_KEY);
        if (me) setMyMemberId(me);
        // กลับเข้าวงเดิมถ้ามี session ค้างและ backend พร้อม
        if (supabase) {
          const sessRaw = await AsyncStorage.getItem(SESSION_KEY);
          if (sessRaw) {
            const sess = JSON.parse(sessRaw) as { groupId: string; myMemberId: string | null };
            await enterGroup(sess.groupId, sess.myMemberId ?? null).catch(() => {});
          }
        }
      } catch {
        // เริ่มด้วยสถานะว่างถ้าโหลดไม่ได้
      } finally {
        setReady(true);
      }
    })();
    return () => {
      if (channelRef.current) supabase?.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist เฉพาะ local mode (group mode ข้อมูลอยู่ remote)
  useEffect(() => {
    if (ready && modeRef.current === 'local') {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }
  }, [state, ready]);

  // ---------- helper สำหรับ group mode ----------
  const sb = () => {
    if (!supabase) throw new Error('Supabase ยังไม่ถูกตั้งค่า');
    return supabase;
  };

  /** sign in แบบ anonymous ถ้ายังไม่มี session (login เต็มรูปทำต่อ Phase 2) */
  const ensureAuth = async () => {
    const client = sb();
    const { data } = await client.auth.getSession();
    if (data.session) return;
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  };

  /** refetch ทั้งวง แล้วเขียนกลับ state (authoritative) */
  const refetch = async (groupId: string) => {
    const next = await fetchGroupState(groupId);
    setState(next);
  };

  /** เข้าสู่ group mode: fetch + subscribe + จำ session */
  const enterGroup = async (groupId: string, memberId: string | null) => {
    await ensureAuth();
    const client = sb();
    const { data: g, error } = await client
      .from('groups')
      .select('id, name, invite_code')
      .eq('id', groupId)
      .single();
    if (error || !g) throw error ?? new Error('ไม่พบวง');

    groupIdRef.current = groupId;
    setGroup({ id: g.id, name: g.name, inviteCode: g.invite_code });
    setMyMemberId(memberId);
    setMode('group');
    modeRef.current = 'group';

    await refetch(groupId);

    if (channelRef.current) client.removeChannel(channelRef.current);
    channelRef.current = subscribeGroup(groupId, () => {
      refetch(groupId).catch(() => {});
    });

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ groupId, myMemberId: memberId }));
  };

  /** เขียน remote แบบ fire-and-forget แล้ว reconcile ด้วย realtime (optimistic UI ทำแยกก่อนหน้า) */
  const remote = (fn: () => PromiseLike<{ error: unknown } | void>) => {
    if (modeRef.current !== 'group') return;
    const reconcile = () => {
      if (groupIdRef.current) refetch(groupIdRef.current).catch(() => {});
    };
    Promise.resolve(fn()).then((res) => {
      // reconcile กลับให้ตรง server ถ้าเขียนพลาด
      if (res && 'error' in res && res.error) reconcile();
    }, reconcile);
  };

  const api = useMemo<Store>(() => {
    const gid = () => groupIdRef.current as string;

    // ปรับ state ในเครื่องทันที (optimistic ทั้ง local และ group)
    const mutBill = (id: string, fn: (b: Bill) => Bill) =>
      setState((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? fn(b) : b)) }));

    return {
      state,
      ready,
      mode,
      group,
      myMemberId,
      remoteEnabled,

      setMe: (memberId) => {
        setMyMemberId(memberId);
        if (memberId) AsyncStorage.setItem(ME_KEY, memberId).catch(() => {});
        else AsyncStorage.removeItem(ME_KEY).catch(() => {});
      },

      addMember: (name, consumes, promptPay) => {
        const m: Member = {
          id: uuid(),
          name: name.trim(),
          consumes,
          arrivedAt: null,
          leftAt: null,
          promptPay: promptPay ?? null,
        };
        setState((s) => ({ ...s, members: [...s.members, m] }));
        remote(() => sb().from('members').insert(memberToRow(gid(), m)));
      },
      updateMember: (id, patch) => {
        setState((s) => ({
          ...s,
          members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }));
        remote(() => sb().from('members').update(memberPatchToRow(patch)).eq('id', id));
      },
      removeMember: (id) => {
        // ถ้าลบ "ฉัน" ออก ให้ล้างตัวตนที่จำไว้ด้วย
        if (id === myMemberId) {
          setMyMemberId(null);
          AsyncStorage.removeItem(ME_KEY).catch(() => {});
        }
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
        }));
        // ลบ member + เคลียร์อ้างอิงในบิลฝั่ง server
        remote(async () => {
          const client = sb();
          await client.from('members').delete().eq('id', id);
          if (groupIdRef.current) {
            const st = await fetchGroupState(groupIdRef.current);
            // อัปเดตบิลที่ยังอ้างถึง member นี้ (paidBy / memberIds / participantIds)
            for (const b of st.bills) {
              const patch: Partial<Bill> = {};
              if (b.paidById === id) patch.paidById = null;
              if (b.memberIds.includes(id)) patch.memberIds = b.memberIds.filter((x) => x !== id);
              if (Object.keys(patch).length) {
                await client.from('bills').update(billPatchToRow(patch)).eq('id', b.id);
              }
              for (const it of b.items) {
                if (it.participantIds.includes(id)) {
                  await client
                    .from('bill_items')
                    .update({ participant_ids: it.participantIds.filter((x) => x !== id) })
                    .eq('id', it.id);
                }
              }
            }
          }
        });
      },
      toggleArrived: (id) => {
        let next: number | null = null;
        setState((s) => ({
          ...s,
          members: s.members.map((m) => {
            if (m.id !== id) return m;
            next = m.arrivedAt ? null : Date.now();
            return { ...m, arrivedAt: next };
          }),
        }));
        remote(() => sb().from('members').update({ arrived_at: next }).eq('id', id));
      },
      toggleLeft: (id) => {
        let next: number | null = null;
        setState((s) => ({
          ...s,
          members: s.members.map((m) => {
            if (m.id !== id) return m;
            next = m.leftAt ? null : Date.now();
            return { ...m, leftAt: next };
          }),
        }));
        remote(() => sb().from('members').update({ left_at: next }).eq('id', id));
      },

      addBill: (name, category) => {
        const bill = newBill(uuid(), name, category);
        setState((s) => ({ ...s, bills: [...s.bills, bill] }));
        remote(() => sb().from('bills').insert(billToRow(gid(), bill)));
        return bill.id;
      },
      updateBill: (id, patch) => {
        mutBill(id, (b) => ({ ...b, ...patch }));
        remote(() => sb().from('bills').update(billPatchToRow(patch)).eq('id', id));
      },
      removeBill: (id) => {
        setState((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) }));
        remote(() => sb().from('bills').delete().eq('id', id)); // bill_items ลบตาม cascade
      },
      addItem: (billId, name, price) => {
        const it: BillItem = { id: uuid(), name: name.trim(), price, participantIds: [] };
        mutBill(billId, (b) => ({ ...b, items: [...b.items, it] }));
        remote(() => sb().from('bill_items').insert(itemToRow(gid(), billId, it)));
      },
      updateItem: (billId, itemId, patch) => {
        mutBill(billId, (b) => ({
          ...b,
          items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        }));
        remote(() => sb().from('bill_items').update(itemPatchToRow(patch)).eq('id', itemId));
      },
      removeItem: (billId, itemId) => {
        mutBill(billId, (b) => ({ ...b, items: b.items.filter((it) => it.id !== itemId) }));
        remote(() => sb().from('bill_items').delete().eq('id', itemId));
      },
      toggleItemParticipant: (billId, itemId, memberId) => {
        let nextIds: string[] = [];
        mutBill(billId, (b) => ({
          ...b,
          items: b.items.map((it) => {
            if (it.id !== itemId) return it;
            const has = it.participantIds.includes(memberId);
            nextIds = has
              ? it.participantIds.filter((x) => x !== memberId)
              : [...it.participantIds, memberId];
            return { ...it, participantIds: nextIds };
          }),
        }));
        remote(() => sb().from('bill_items').update({ participant_ids: nextIds }).eq('id', itemId));
      },

      setVenue: (v) => {
        setState((s) => ({ ...s, venue: v }));
        remote(() => sb().from('groups').update({ venue: v }).eq('id', gid()));
      },
      reset: () => setState(empty),

      toggleSettlement: (key) => {
        let next: string[] = [];
        setState((s) => {
          const has = s.settlements.includes(key);
          next = has ? s.settlements.filter((k) => k !== key) : [...s.settlements, key];
          return { ...s, settlements: next };
        });
        remote(() => sb().from('groups').update({ settlements: next }).eq('id', gid()));
      },

      closeGroup: async () => {
        if (modeRef.current !== 'group') {
          // local mode: เคลียร์ทั้งหมดกลับเป็นว่าง
          setState(empty);
          return;
        }
        // group mode: ลบวงถาวร (cascade ลบ members/bills/items) แล้วกลับ local
        const client = supabase;
        const gidClose = groupIdRef.current;
        if (channelRef.current && client) client.removeChannel(channelRef.current);
        channelRef.current = null;
        if (client && gidClose) {
          await client.from('groups').delete().eq('id', gidClose);
        }
        groupIdRef.current = null;
        setGroup(null);
        setMode('local');
        modeRef.current = 'local';
        await AsyncStorage.removeItem(SESSION_KEY);
        // กลับไปใช้ state local เดิม (ถ้ามี) + "ฉัน" ของ local
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setState(raw ? { ...empty, ...JSON.parse(raw) } : empty);
        const me = await AsyncStorage.getItem(ME_KEY);
        setMyMemberId(me);
      },

      // ---------- group ----------
      createGroup: async (groupName) => {
        await ensureAuth();
        const client = sb();
        const id = uuid();
        const code = inviteCode();
        const { error } = await client
          .from('groups')
          .insert({ id, name: groupName.trim() || 'วงใหม่', invite_code: code, venue: state.venue });
        if (error) throw error;
        // เป็น participant ของวงที่เพิ่งสร้าง
        const { error: pErr } = await client.from('group_participants').insert({ group_id: id });
        if (pErr) throw pErr;

        // ย้าย state local ปัจจุบันขึ้นวง (migrate)
        if (state.members.length) {
          await client.from('members').insert(state.members.map((m) => memberToRow(id, m)));
        }
        if (state.bills.length) {
          await client.from('bills').insert(state.bills.map((b) => billToRow(id, b)));
          const items = state.bills.flatMap((b) => b.items.map((it) => itemToRow(id, b.id, it)));
          if (items.length) await client.from('bill_items').insert(items);
        }
        await enterGroup(id, null);
        return { id, name: groupName.trim() || 'วงใหม่', inviteCode: code };
      },
      joinGroup: async (code) => {
        await ensureAuth();
        const client = sb();
        const { data, error } = await client.rpc('join_group', { code: code.trim().toUpperCase() });
        if (error) throw error;
        await enterGroup(data as string, null);
      },
      claimMember: async (memberId) => {
        const client = sb();
        const { data: u } = await client.auth.getUser();
        const uid = u.user?.id ?? null;
        await client.from('members').update({ user_id: uid }).eq('id', memberId);
        setMyMemberId(memberId);
        if (groupIdRef.current) {
          await AsyncStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ groupId: groupIdRef.current, myMemberId: memberId }),
          );
        }
      },
      joinAsNewMember: async (name, consumes) => {
        const client = sb();
        const { data: u } = await client.auth.getUser();
        const m: Member = {
          id: uuid(),
          name: name.trim(),
          consumes,
          arrivedAt: null,
          leftAt: null,
          userId: u.user?.id ?? null,
        };
        const { error } = await client.from('members').insert(memberToRow(gid(), m));
        if (error) throw error;
        setMyMemberId(m.id);
        if (groupIdRef.current) {
          await AsyncStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ groupId: groupIdRef.current, myMemberId: m.id }),
          );
        }
      },
      leaveGroup: async () => {
        const client = supabase;
        if (channelRef.current && client) client.removeChannel(channelRef.current);
        channelRef.current = null;
        const gidLeft = groupIdRef.current;
        if (client && gidLeft) {
          await client.from('group_participants').delete().eq('group_id', gidLeft);
        }
        groupIdRef.current = null;
        setGroup(null);
        setMyMemberId(null);
        setMode('local');
        modeRef.current = 'local';
        await AsyncStorage.removeItem(SESSION_KEY);
        // กลับไปใช้ state local ที่บันทึกไว้ (หรือว่างถ้าไม่มี) + "ฉัน" ของ local
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setState(raw ? { ...empty, ...JSON.parse(raw) } : empty);
        const me = await AsyncStorage.getItem(ME_KEY);
        setMyMemberId(me);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready, mode, group, myMemberId, remoteEnabled]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

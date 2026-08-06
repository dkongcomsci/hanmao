import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Bill, BillItem, Consumes, Group, Member } from '../domain/types';
import { pruneSettlements, settleUp, transferKey } from '../domain/split';
import {
  billPatchToRow,
  billToRow,
  fetchGroupState,
  itemPatchToRow,
  itemToRow,
  memberPatchToRow,
  memberToRow,
  seqStamp,
  subscribeGroup,
} from './remote';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { inviteCode, uuid } from '../utils/id';

const STORAGE_KEY = 'hanmao:state:v1';
const SESSION_KEY = 'hanmao:session:v1'; // ชี้ว่าอยู่กลุ่มไหน + เราเป็น member ไหน (ไว้กลับเข้ากลุ่มเดิม)
const ME_KEY = 'hanmao:me:v1'; // "ฉันคือ member ไหน" ในโหมด local (group mode เก็บใน SESSION_KEY)
// theme เป็น device preference (ธีมสว่าง/มืดของเครื่องนี้) — ไม่ผูกกับ local/group mode
// ไม่อยู่ใน AppState และไม่ sync ขึ้น Supabase; persist แยกคีย์ของตัวเอง
const THEME_KEY = 'hanmao:theme:v1';

const empty: AppState = { members: [], bills: [], venue: null, settlements: [] };

type Mode = 'local' | 'group';

type Theme = 'light' | 'dark';

type Store = {
  state: AppState;
  ready: boolean;
  // ---- theme (device preference; ไม่ผูกกับ local/group mode, ไม่ sync ขึ้น server) ----
  /** ธีมปัจจุบันของเครื่องนี้ (ค่าเริ่มต้น 'light') */
  theme: Theme;
  /** สลับ light↔dark */
  toggleTheme: () => void;
  /** ตั้งค่าธีมตรง ๆ */
  setTheme: (t: Theme) => void;
  // members
  addMember: (name: string, consumes: Consumes, promptPay?: string | null) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  removeMember: (id: string) => void;
  toggleArrived: (id: string) => void;
  toggleLeft: (id: string) => void;
  // bills
  addBill: (name: string, category: Bill['category']) => string;
  updateBill: (id: string, patch: Partial<Bill>) => void;
  /** บันทึกทั้งบิล (รวมเมนู) ทีเดียว — ใช้กับหน้าแก้บิลที่หน่วงจนกดปุ่มบันทึก */
  saveBill: (bill: Bill) => void;
  removeBill: (id: string) => void;
  addItem: (billId: string, name: string, price: number) => void;
  updateItem: (billId: string, itemId: string, patch: Partial<BillItem>) => void;
  removeItem: (billId: string, itemId: string) => void;
  toggleItemParticipant: (billId: string, itemId: string, memberId: string) => void;
  // venue
  setVenue: (v: AppState['venue']) => void;
  reset: () => void;
  /**
   * ติ๊ก/ยกเลิก "โอนแล้ว/จ่ายแล้ว" ของรายการโอนหนึ่ง
   * key ต้องมาจาก `transferKey(t)` ของ transfer ที่ `settleUp()` คืนมาเท่านั้น — ห้ามประกอบเอง
   * (บาง transfer ผูก key กับ `stamp` ไม่ใช่ยอดเงิน ดู transferKey() ใน split.ts)
   * group mode: ยิง RPC ที่ append/remove แบบ atomic ฝั่ง Postgres (สองคนติ๊กพร้อมกันไม่ทับกัน)
   */
  toggleSettlement: (key: string) => void;
  /**
   * ปิดกลุ่ม/เคลียร์ทั้งหมด (เรียกเมื่อจ่ายครบทุกคนแล้ว)
   * - local mode: ล้าง state ทั้งหมดกลับเป็นว่าง
   * - group mode: ลบกลุ่มถาวรสำหรับทุกคน แล้วกลับ local mode
   */
  closeGroup: () => Promise<void>;
  // ---- group (multi-user) ----
  mode: Mode;
  group: Group | null;
  /**
   * เราเป็นผู้สร้างกลุ่ม (host) ไหม — มีแค่ host ที่ลบกลุ่มทั้งกลุ่มได้ (RLS บังคับ ดู patch-004)
   * local mode = true เสมอ (ข้อมูลอยู่ในเครื่องเรา)
   * ใช้ตั้งข้อความปุ่มปิดกลุ่ม: host = "ปิดกลุ่ม (ลบของทุกคน)", คนอื่น = "ออกจากกลุ่ม"
   */
  isHost: boolean;
  myMemberId: string | null;
  /** ตั้งว่า "ฉันคือ member ไหน" (สำหรับแท็บสรุปของฉัน); null = ล้าง */
  setMe: (memberId: string | null) => void;
  /** backend พร้อมใช้ไหม (มี env Supabase) */
  remoteEnabled: boolean;
  /** สร้างกลุ่มใหม่ แล้วย้าย state ปัจจุบัน (local) ขึ้นกลุ่ม */
  createGroup: (groupName: string) => Promise<Group>;
  /** เข้าร่วมกลุ่มด้วยโค้ดเชิญ (จาก invite link/QR) */
  joinGroup: (code: string) => Promise<void>;
  /** ผูกตัวเองกับ member ที่มีอยู่ในกลุ่ม (throw ถ้ามีคนอื่น claim ไปแล้ว) */
  claimMember: (memberId: string) => Promise<void>;
  /** เข้าร่วมเป็น member ใหม่ (สร้าง member + claim) */
  joinAsNewMember: (name: string, consumes: Consumes) => Promise<void>;
  /** ออกจากกลุ่ม → กลับ local mode */
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

/**
 * ตัด settlements ที่ไม่ตรงกับรายการโอนปัจจุบันออก (ยอดเปลี่ยน = การติ๊ก "โอนแล้ว" เดิมเป็นโมฆะ)
 * คืน state เดิม (reference เดียวกัน) ถ้าไม่มีอะไรต้องตัด + คืน key ที่ยังใช้ได้ไว้ sync ขึ้น server
 *
 * asOf ส่ง Date.now() ให้ตรงกับที่หน้าจอ (summary/me) ใช้คิด key
 * key ที่ค้างอยู่ไม่ทำให้ "จ่ายครบแล้ว" ขึ้นผิด (nothingOwed เทียบทั้ง key) — prune แค่เก็บบ้าน
 *
 * prune ทุกเคสรวมบิลโหมด time ที่ยังมีคนไม่กลับได้แล้ว: settleUp() ติด `stamp` (ลายนิ้วมือข้อมูล
 * ไม่ผูกนาฬิกา) ให้ transfer ที่ยอดลอยตามเวลา → transferKey นิ่งข้าม asOf ที่ต่างกัน
 * ⇒ prune ที่ asOf = ตอนนี้ ให้ชุด key เดียวกับที่หน้าจอใช้ ไม่ลบติ๊กที่ยังใช้อยู่ (ดู ADR 0003)
 *
 * เคสเดียวที่ key หายไปเพราะเวลา: หนี้ของคนที่กลับไปแล้วเจือจางจนเหลือ 0 บาท
 * รายการโอนนั้นหลุดจากรายการทั้งฝั่ง prune และฝั่งหน้าจอ (คิดจาก settleUp(state, now) ชุดเดียวกัน)
 * → ผู้ใช้ไม่เห็นแถวนั้นอีกแล้วอยู่ดี ไม่กระทบ "จ่ายครบทุกคนแล้ว"
 */
function pruneState(s: AppState): { next: AppState; validKeys: string[] } {
  if (s.settlements.length === 0) return { next: s, validKeys: [] };
  const transfers = settleUp(s, Date.now());
  const kept = pruneSettlements(transfers, s.settlements);
  const validKeys = transfers.map(transferKey);
  if (kept.length === s.settlements.length) return { next: s, validKeys };
  return { next: { ...s, settlements: kept }, validKeys };
}

export function StoreProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [state, setState] = useState<AppState>(empty);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('local');
  const [group, setGroup] = useState<Group | null>(null);
  // เราสร้างกลุ่มนี้เองไหม (local mode = true เพราะข้อมูลอยู่ในเครื่องเรา)
  const [isHost, setIsHost] = useState(true);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  // theme เป็น state แยกใน provider (device preference) ไม่แตะ AppState/Supabase
  const [theme, setTheme] = useState<Theme>('light');

  const channelRef = useRef<RealtimeChannel | null>(null);
  // ให้ mutation ใน group mode อ่าน groupId ล่าสุดได้โดยไม่ผูกกับ closure เก่า
  const groupIdRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>('local');
  modeRef.current = mode;
  /**
   * กระจกเงาของ state ล่าสุด — ทุก mutation คำนวณจาก ref นี้ให้ "จบก่อน" แล้วค่อย setState
   * เหตุผล: React อาจเรียก updater ซ้ำ/ทิ้งผล (eager state + StrictMode) ถ้าอ่านค่าที่คำนวณ
   * ในตัว updater ออกมายิง Supabase ค่าที่ส่งจะไม่ตรงกับ state จริง
   */
  const stateRef = useRef<AppState>(empty);
  // กัน response ของ refetch รอบเก่ามาทับ state ที่ใหม่กว่า (generation counter)
  const fetchSeqRef = useRef(0);

  const remoteEnabled = supabase != null;

  /** เขียน state จริง + อัปเดตกระจกเงาให้ตรงกันเสมอ (ทางเข้าเดียวของการเปลี่ยน state) */
  const applyState = (next: AppState) => {
    stateRef.current = next;
    setState(next);
  };

  /** ทิ้งผลลัพธ์ refetch ที่ยังค้างอยู่ทั้งหมด (ใช้ตอนออกจากกลุ่ม/สลับโหมด) */
  const invalidateFetches = () => {
    fetchSeqRef.current++;
  };

  // ---------- โหลด/บันทึก local + กลับเข้ากลุ่มเดิมอัตโนมัติ ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        // merge กับ empty เสมอ → state เก่าที่ไม่มีฟิลด์ใหม่ยังใช้ได้ (backward compatible)
        // + ตัด settlements ที่ยอดไม่ตรงแล้วออกตั้งแต่ตอนโหลด
        if (raw) applyState(pruneState({ ...empty, ...JSON.parse(raw) }).next);
        // "ฉันคือใคร" ในโหมด local (group mode จะถูก override ตอน enterGroup)
        const me = await AsyncStorage.getItem(ME_KEY);
        if (me) setMyMemberId(me);
        // โหลดธีมที่เคยตั้งไว้ (device preference); ค่าเพี้ยน/ไม่มี → คงไว้ 'light' (default)
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
        // กลับเข้ากลุ่มเดิมถ้ามี session ค้างและ backend พร้อม
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

  // persist ธีมทุกครั้งที่เปลี่ยน — เป็น device preference จึงเขียนทุกโหมด (ไม่รอ mode ใด ๆ)
  // รอ ready ก่อน กันเขียนทับตอน mount ก่อนโหลดค่าที่บันทึกไว้
  useEffect(() => {
    if (ready) AsyncStorage.setItem(THEME_KEY, theme).catch(() => {});
  }, [theme, ready]);

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

  /** uid ของ session ปัจจุบัน (ต้องเรียก ensureAuth มาก่อน) */
  const currentUid = async (): Promise<string> => {
    const { data } = await sb().auth.getUser();
    const uid = data.user?.id;
    if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    return uid;
  };

  /** refetch ทั้งกลุ่ม แล้วเขียนกลับ state (authoritative); ทิ้งผลถ้ามีรอบใหม่กว่าแล้ว */
  const refetch = async (groupId: string) => {
    const seq = ++fetchSeqRef.current;
    const next = await fetchGroupState(groupId);
    // response ช้ากว่ารอบใหม่ / ออกจากกลุ่มไปแล้ว / สลับกลุ่ม → ทิ้งไป อย่าทับ state ใหม่กว่า
    if (seq !== fetchSeqRef.current) return;
    if (groupIdRef.current !== groupId || modeRef.current !== 'group') return;
    applyState(next);
  };

  /** เข้าสู่ group mode: fetch + subscribe + จำ session */
  const enterGroup = async (groupId: string, memberId: string | null) => {
    await ensureAuth();
    const client = sb();
    const uid = await currentUid();
    // created_by อาจยังไม่มีคอลัมน์ถ้า project ไม่ได้รัน patch-004 → ถอยไป select แบบเดิม
    // และถือว่าเป็น host (พฤติกรรมเดิม: สมาชิกคนไหนก็ลบกลุ่มได้) ไม่ให้ปุ่มปิดกลุ่มหายไปเฉย ๆ
    let g: { id: string; name: string; invite_code: string } | null = null;
    let host = true;
    const withHost = await client
      .from('groups')
      .select('id, name, invite_code, created_by')
      .eq('id', groupId)
      .single();
    if (withHost.error) {
      const fallback = await client
        .from('groups')
        .select('id, name, invite_code')
        .eq('id', groupId)
        .single();
      if (fallback.error || !fallback.data) throw fallback.error ?? new Error('ไม่พบกลุ่ม');
      g = fallback.data;
    } else if (withHost.data) {
      g = withHost.data;
      host = (withHost.data as { created_by?: string | null }).created_by === uid;
    }
    if (!g) throw new Error('ไม่พบกลุ่ม');

    invalidateFetches(); // ทิ้ง refetch ของกลุ่มก่อนหน้า
    groupIdRef.current = groupId;
    setGroup({ id: g.id, name: g.name, inviteCode: g.invite_code });
    setIsHost(host);
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

  /** กลับสู่ local mode: ปิด channel + ล้าง session + โหลด state local เดิมคืน */
  const backToLocal = async () => {
    const client = supabase;
    if (channelRef.current && client) client.removeChannel(channelRef.current);
    channelRef.current = null;
    invalidateFetches();
    groupIdRef.current = null;
    setGroup(null);
    setIsHost(true); // local mode: ข้อมูลอยู่ในเครื่องเรา เคลียร์ได้เสมอ
    setMode('local');
    modeRef.current = 'local';
    await AsyncStorage.removeItem(SESSION_KEY);
    // กลับไปใช้ state local ที่บันทึกไว้ (หรือว่างถ้าไม่มี) + "ฉัน" ของ local
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    applyState(raw ? pruneState({ ...empty, ...JSON.parse(raw) }).next : empty);
    const me = await AsyncStorage.getItem(ME_KEY);
    setMyMemberId(me);
  };

  /**
   * error นี้คือ "ยังไม่มีฟังก์ชันนี้ใน DB" ไหม (project ที่ยังไม่ได้รัน patch-004)
   * PGRST202 = ไม่พบใน schema cache ของ PostgREST, 42883 = undefined_function
   */
  const isMissingFunction = (err: unknown): boolean => {
    const code = (err as { code?: string } | null)?.code;
    return code === 'PGRST202' || code === '42883';
  };

  /**
   * เรียก RPC ของ settlements แบบ atomic; ถ้า DB ยังไม่ได้รัน patch-004 (ไม่มีฟังก์ชัน)
   * ถอยไปเขียน array ทั้งก้อนแทน เพื่อให้ project เดิมยังใช้งานได้ (ไม่ atomic — ควรรัน patch)
   */
  const settlementsRpc = async (
    fn: 'settlement_toggle' | 'settlements_prune',
    args: Record<string, unknown>,
    fallbackList: () => string[],
  ): Promise<{ error: unknown }> => {
    const client = sb();
    const groupId = groupIdRef.current;
    const res = await client.rpc(fn, args);
    if (res.error && isMissingFunction(res.error) && groupId) {
      return client.from('groups').update({ settlements: fallbackList() }).eq('id', groupId);
    }
    return res;
  };

  /** เขียน remote แบบ fire-and-forget แล้ว reconcile ด้วย realtime (optimistic UI ทำแยกก่อนหน้า) */
  const remote = (fn: () => PromiseLike<{ error: unknown } | void>) => {
    if (modeRef.current !== 'group') return; // local mode ไม่แตะ Supabase เลย
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

    /**
     * apply mutation ทันที (optimistic ทั้ง local และ group) โดยคำนวณจาก state ล่าสุดใน ref
     * คืน state ใหม่ให้ผู้เรียกเอาไปประกอบ payload ที่ยิงขึ้น server ได้ตรงกับที่ UI เห็น
     */
    const commit = (fn: (s: AppState) => AppState): AppState => {
      const next = fn(stateRef.current);
      // ทิ้ง refetch ที่ยิงไปก่อนหน้านี้ (ยังไม่รู้จักการแก้รอบนี้) ไม่ให้มาทับของใหม่
      // การเขียนขึ้น server จะทำให้ realtime ยิง refetch รอบใหม่มา reconcile เองอยู่แล้ว
      if (next !== stateRef.current) invalidateFetches();
      applyState(next);
      return next;
    };

    /**
     * เหมือน commit แต่ตัด settlements ที่ยอดโอนไม่ตรงแล้วออกด้วย (บิล/สมาชิกเปลี่ยน)
     * ถ้ามีการตัดจริงและอยู่ group mode → sync การตัดขึ้น server แบบ atomic
     */
    const commitPrune = (fn: (s: AppState) => AppState): AppState => {
      const draft = fn(stateRef.current);
      const { next, validKeys } = pruneState(draft);
      if (next !== stateRef.current) invalidateFetches(); // เหมือน commit: ทิ้ง fetch ที่ค้างอยู่
      applyState(next);
      if (next !== draft) {
        remote(() =>
          settlementsRpc(
            'settlements_prune',
            { p_group_id: gid(), p_keep: validKeys },
            () => next.settlements,
          ),
        );
      }
      return next;
    };

    /** แก้บิลใบเดียว (+ prune settlements ที่ยอดเปลี่ยนไปแล้ว) */
    const mutBill = (id: string, fn: (b: Bill) => Bill) =>
      commitPrune((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? fn(b) : b)) }));

    /**
     * จำ "ฉันคือ member ไหน" ลงที่เก็บให้ตรงโหมดปัจจุบัน
     * group mode → SESSION_KEY (id ของ member ในกลุ่ม), local mode → ME_KEY
     * แยกกันเพราะ id ของกลุ่มกับของ local เป็นคนละชุด ถ้าเขียนข้ามกันจะได้ "ฉัน" ที่ไม่มีตัวตน
     */
    const rememberMe = (memberId: string | null) => {
      setMyMemberId(memberId);
      if (modeRef.current === 'group' && groupIdRef.current) {
        AsyncStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ groupId: groupIdRef.current, myMemberId: memberId }),
        ).catch(() => {});
        return;
      }
      if (memberId) AsyncStorage.setItem(ME_KEY, memberId).catch(() => {});
      else AsyncStorage.removeItem(ME_KEY).catch(() => {});
    };

    return {
      state,
      ready,
      mode,
      group,
      isHost,
      myMemberId,
      remoteEnabled,

      // theme: sync ธรรมดา (setState เข้าคิว persist ผ่าน useEffect ด้านบน)
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      setTheme: (t: Theme) => setTheme(t),

      setMe: rememberMe,

      addMember: (name, consumes, promptPay) => {
        const m: Member = {
          id: uuid(),
          name: name.trim(),
          consumes,
          arrivedAt: null,
          leftAt: null,
          promptPay: promptPay ?? null,
        };
        commitPrune((s) => ({ ...s, members: [...s.members, m] }));
        remote(() => sb().from('members').insert(memberToRow(gid(), m)));
      },
      updateMember: (id, patch) => {
        commitPrune((s) => ({
          ...s,
          members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }));
        remote(() => sb().from('members').update(memberPatchToRow(patch)).eq('id', id));
      },
      removeMember: (id) => {
        // ถ้าลบ "ฉัน" ออก ให้ล้างตัวตนที่จำไว้ด้วย (ไม่งั้นหน้า "ฉัน" ชี้ไปคนที่ไม่มีอยู่)
        if (id === myMemberId) rememberMe(null);
        // ล้างการอ้างอิงถึง member นี้ทุกที่ (paidBy / memberIds / participantIds)
        commitPrune((s) => ({
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
        // คำนวณค่าที่จะเขียนให้จบก่อน setState → ค่าที่ยิงขึ้น server ตรงกับที่ UI เห็นแน่นอน
        const cur = stateRef.current.members.find((m) => m.id === id);
        if (!cur) return;
        const next = cur.arrivedAt ? null : Date.now();
        commitPrune((s) => ({
          ...s,
          members: s.members.map((m) => (m.id === id ? { ...m, arrivedAt: next } : m)),
        }));
        remote(() => sb().from('members').update({ arrived_at: next }).eq('id', id));
      },
      toggleLeft: (id) => {
        const cur = stateRef.current.members.find((m) => m.id === id);
        if (!cur) return;
        const next = cur.leftAt ? null : Date.now();
        commitPrune((s) => ({
          ...s,
          members: s.members.map((m) => (m.id === id ? { ...m, leftAt: next } : m)),
        }));
        remote(() => sb().from('members').update({ left_at: next }).eq('id', id));
      },

      addBill: (name, category) => {
        const bill = newBill(uuid(), name, category);
        commit((s) => ({ ...s, bills: [...s.bills, bill] })); // บิลใหม่ยังไม่มีเมนู = ยอดไม่เปลี่ยน
        remote(() => sb().from('bills').insert(billToRow(gid(), bill)));
        return bill.id;
      },
      updateBill: (id, patch) => {
        mutBill(id, (b) => ({ ...b, ...patch }));
        remote(() => sb().from('bills').update(billPatchToRow(patch)).eq('id', id));
      },
      saveBill: (bill) => {
        // เมนูเดิมใน store (ก่อนเขียนทับ) — ใช้ diff ว่าต้อง insert/update/delete อะไรบ้างบน server
        const prevItems = stateRef.current.bills.find((b) => b.id === bill.id)?.items ?? [];
        // เขียนทั้งบิล (ฟิลด์ + เมนู) ลง state ทีเดียว
        mutBill(bill.id, () => bill);
        remote(async () => {
          const client = sb();
          const groupId = gid();
          // ต้อง await ทุก query — builder ของ supabase-js เป็น thenable แบบ lazy
          // ยิงจริงตอน .then()/await เท่านั้น ปล่อยลอย (void) = ไม่ยิงเลย
          // (เดิมฟิลด์บิล/เมนูที่ลบไม่ถูกเขียน แล้ว realtime refetch ทับ optimistic ทิ้ง)
          // 1) ฟิลด์ของบิลเอง (ไม่รวม items — items อยู่คนละตาราง)
          const bres = await client.from('bills').update(billPatchToRow(bill)).eq('id', bill.id);
          if (bres.error) return bres;
          // 2) เมนูที่ถูกลบออก
          const nextIds = new Set(bill.items.map((it) => it.id));
          const removed = prevItems.filter((it) => !nextIds.has(it.id)).map((it) => it.id);
          if (removed.length) {
            const dres = await client.from('bill_items').delete().in('id', removed);
            if (dres.error) return dres;
          }
          // 3) เมนูที่เหลือ/เพิ่มใหม่ — upsert ทั้งชุด (insert ตัวใหม่, update ตัวเดิม)
          if (bill.items.length) {
            return client
              .from('bill_items')
              .upsert(bill.items.map((it) => itemToRow(groupId, bill.id, it)));
          }
          return Promise.resolve();
        });
      },
      removeBill: (id) => {
        commitPrune((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) }));
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
        // หา participantIds ชุดใหม่ให้เสร็จก่อน (ไม่อ่านค่าที่คำนวณในตัว updater)
        const item = stateRef.current.bills
          .find((b) => b.id === billId)
          ?.items.find((it) => it.id === itemId);
        if (!item) return;
        const has = item.participantIds.includes(memberId);
        const nextIds = has
          ? item.participantIds.filter((x) => x !== memberId)
          : [...item.participantIds, memberId];
        mutBill(billId, (b) => ({
          ...b,
          items: b.items.map((it) => (it.id === itemId ? { ...it, participantIds: nextIds } : it)),
        }));
        remote(() => sb().from('bill_items').update({ participant_ids: nextIds }).eq('id', itemId));
      },

      setVenue: (v) => {
        commit((s) => ({ ...s, venue: v }));
        remote(() => sb().from('groups').update({ venue: v }).eq('id', gid()));
      },
      reset: () => {
        // group mode: ต้องลบข้อมูลบนเซิร์ฟเวอร์ด้วย ไม่งั้น realtime refetch จะดึงของเก่ากลับมาทับ
        // (เก็บ id ไว้ก่อน commit → หลัง commit stateRef เป็น empty แล้ว)
        const prev = stateRef.current;
        const memberIds = prev.members.map((m) => m.id);
        const billIds = prev.bills.map((b) => b.id);
        commit(() => empty);
        remote(async () => {
          const client = sb();
          const groupId = gid();
          // bills ลบก่อน (bill_items ตาม cascade) แล้วค่อย members (paid_by_id/references เคลียร์ตาม cascade/set null)
          if (billIds.length) {
            const bres = await client.from('bills').delete().in('id', billIds);
            if (bres.error) return bres;
          }
          if (memberIds.length) {
            const mres = await client.from('members').delete().in('id', memberIds);
            if (mres.error) return mres;
          }
          // เคลียร์การติ๊ก "โอนแล้ว" บนแถวกลุ่มด้วย (ยอดหายหมดแล้ว key เดิมเป็นโมฆะ)
          if (prev.settlements.length && groupId) {
            return client.from('groups').update({ settlements: [] }).eq('id', groupId);
          }
        });
      },

      toggleSettlement: (key) => {
        // เจตนาผู้ใช้ = ตรงข้ามกับที่เห็นบนจอตอนกด
        const done = !stateRef.current.settlements.includes(key);
        const after = commit((s) => {
          const has = s.settlements.includes(key);
          if (has === done) return s; // idempotent (กันติ๊กซ้ำจาก re-render/realtime)
          return {
            ...s,
            settlements: done ? [...s.settlements, key] : s.settlements.filter((k) => k !== key),
          };
        });
        // group mode: ให้ Postgres append/remove ทีละ element แบบ atomic (ไม่เขียนทับ array ทั้งก้อน)
        remote(() =>
          settlementsRpc(
            'settlement_toggle',
            { p_group_id: gid(), p_key: key, p_done: done },
            () => after.settlements,
          ),
        );
      },

      closeGroup: async () => {
        if (modeRef.current !== 'group') {
          // local mode: เคลียร์ทั้งหมดกลับเป็นว่าง
          applyState(empty);
          return;
        }
        // group mode: ลบกลุ่มถาวร (cascade ลบ members/bills/items) แล้วกลับ local
        // RLS ยอมให้เฉพาะผู้สร้างกลุ่ม — คนอื่นกดจะได้แค่ "ออกจากกลุ่ม" (แถวไม่ถูกลบ ไม่ error)
        const client = supabase;
        const gidClose = groupIdRef.current;
        if (client && gidClose) {
          if (isHost) {
            const { error } = await client.from('groups').delete().eq('id', gidClose);
            if (error) throw error;
          } else {
            // ไม่ใช่ host: ถอนตัวเองออกจากกลุ่ม ไม่ลบของคนอื่น
            await client.from('group_participants').delete().eq('group_id', gidClose);
            setMyMemberId(null);
          }
        }
        await backToLocal();
      },

      // ---------- group ----------
      createGroup: async (groupName) => {
        await ensureAuth();
        const client = sb();
        const uid = await currentUid();
        const id = uuid();
        const code = inviteCode();
        const name = groupName.trim() || 'กลุ่มใหม่';
        const local = stateRef.current;
        const mine = myMemberId && local.members.some((m) => m.id === myMemberId) ? myMemberId : null;

        // created_by ไม่ส่งจาก client — คอลัมน์มี default auth.uid() (ดู patch-004)
        // เพื่อให้ project ที่ยังไม่ได้รัน patch ยัง insert ผ่าน
        const { error } = await client.from('groups').insert({
          id,
          name,
          invite_code: code,
          venue: local.venue,
          // ยกการติ๊ก "โอนแล้ว" ขึ้นกลุ่มด้วย (ไม่งั้นสถานะที่ทำไว้ตอน local หายหมด)
          settlements: local.settlements,
        });
        if (error) throw error;
        // เป็น participant ของกลุ่มที่เพิ่งสร้าง
        const { error: pErr } = await client.from('group_participants').insert({ group_id: id });
        if (pErr) throw pErr;
        setIsHost(true); // เราสร้างกลุ่มนี้เอง (enterGroup จะยืนยันซ้ำจาก created_by)

        // ย้าย state local ปัจจุบันขึ้นกลุ่ม (migrate) — คง id เดิมไว้ทั้งหมด
        // created_at ต้องส่งเองแบบไล่ทีละ ms: default now() ของ Postgres คงที่ทั้งทรานแซกชัน
        // → insert ชุดเดียวจะได้เวลาเท่ากันหมด แล้ว order by created_at คืนลำดับที่ไม่นิ่ง
        // (ลำดับสมาชิกมีผลถึงการเกลี่ยเศษสตางค์ ดูคอมเมนต์ที่ fetchGroupState)
        const base = Date.now();
        if (local.members.length) {
          const rows = local.members.map((m, i) =>
            // ผูก "ฉัน" กับ auth uid ของเครื่องนี้ไปเลย เพื่อไม่ให้คนอื่น claim ทับ
            memberToRow(id, m.id === mine ? { ...m, userId: uid } : m, seqStamp(base, i)),
          );
          const { error: mErr } = await client.from('members').insert(rows);
          if (mErr) throw mErr;
        }
        if (local.bills.length) {
          const { error: bErr } = await client
            .from('bills')
            .insert(local.bills.map((b) => billToRow(id, b)));
          if (bErr) throw bErr;
          // ไล่ stamp ต่อเนื่องข้ามบิล (เมนูของบิลไหนก็เรียงตามลำดับเดิมของบิลนั้น)
          let n = 0;
          const items = local.bills.flatMap((b) =>
            b.items.map((it) => itemToRow(id, b.id, it, seqStamp(base, n++))),
          );
          if (items.length) {
            const { error: iErr } = await client.from('bill_items').insert(items);
            if (iErr) throw iErr;
          }
        }
        // เข้ากลุ่มพร้อมตัวตนเดิม (myMemberId) ไม่ใช่ null
        await enterGroup(id, mine);
        return { id, name, inviteCode: code };
      },
      joinGroup: async (code) => {
        await ensureAuth();
        const client = sb();
        const { data, error } = await client.rpc('join_group', { code: code.trim().toUpperCase() });
        if (error) throw error;
        if (!data) throw new Error('ไม่พบกลุ่มจากโค้ดนี้');
        await enterGroup(data as string, null);
      },
      claimMember: async (memberId) => {
        await ensureAuth();
        const client = sb();
        const uid = await currentUid();
        // claim แบบมีเงื่อนไข: สำเร็จเฉพาะเมื่อยังไม่มีใครถือ หรือเป็นของเราเองอยู่แล้ว
        // (เงื่อนไขอยู่ใน UPDATE เดียว → สองเครื่องแย่งกัน claim จะสำเร็จแค่คนเดียว)
        const { data: claimed, error } = await client
          .from('members')
          .update({ user_id: uid })
          .eq('id', memberId)
          .or(`user_id.is.null,user_id.eq.${uid}`)
          .select('id');
        if (error) throw error;
        if (!claimed || claimed.length === 0) {
          throw new Error('ชื่อนี้มีคนเลือกไปแล้ว เลือกชื่ออื่นหรือเพิ่มชื่อใหม่');
        }
        rememberMe(memberId);
      },
      joinAsNewMember: async (name, consumes) => {
        await ensureAuth();
        const client = sb();
        const uid = await currentUid();
        const m: Member = {
          id: uuid(),
          name: name.trim(),
          consumes,
          arrivedAt: null,
          leftAt: null,
          userId: uid,
        };
        const { error } = await client.from('members').insert(memberToRow(gid(), m));
        if (error) throw error;
        // optimistic: เห็นตัวเองในรายชื่อทันที (realtime จะ reconcile ตามมา)
        commit((s) =>
          s.members.some((x) => x.id === m.id) ? s : { ...s, members: [...s.members, m] },
        );
        rememberMe(m.id);
      },
      leaveGroup: async () => {
        const client = supabase;
        const gidLeft = groupIdRef.current;
        if (client && gidLeft) {
          await client.from('group_participants').delete().eq('group_id', gidLeft);
        }
        setMyMemberId(null);
        await backToLocal();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready, mode, group, isHost, myMemberId, remoteEnabled, theme]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

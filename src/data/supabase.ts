import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// env ถูก inject โดย Expo เฉพาะตัวที่ขึ้นต้น EXPO_PUBLIC_ (ดู config/.env.example)
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase client — null ถ้ายังไม่ตั้งค่า env
 * เมื่อ null → store จะบังคับ local-only mode (แอปยังใช้งานคนเดียวได้ตามปกติ)
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

/** แอปนี้ต่อ backend ได้ไหม (มี env ครบ) */
export const isRemoteEnabled = supabase != null;

# config

ค่าตั้งและข้อมูลสนับสนุนของโปรเจกต์

- `.env.example` — เทมเพลต env (คัดลอกเป็น `.env` ที่ root แล้วกรอกค่า Supabase; **ห้าม commit `.env`**)

Expo inject เฉพาะตัวแปรที่ขึ้นต้น `EXPO_PUBLIC_` เข้าไปใน client bundle ผ่าน `process.env`

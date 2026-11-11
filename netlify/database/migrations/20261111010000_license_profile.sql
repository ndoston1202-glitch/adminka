-- CafePOS'da kalit kiritilgandan keyin mijoz to'ldiradigan ro'yxatdan o'tish ma'lumotlari
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS profile JSONB;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS profile_at TIMESTAMPTZ;

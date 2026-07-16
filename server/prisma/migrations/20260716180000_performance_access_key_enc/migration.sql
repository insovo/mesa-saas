-- AES-256-GCM ciphertext of access-key plaintext (admin share Modal re-reveal).
-- Public verify still uses bcrypt *_hash only. Old hash-only rows stay null until regenerate/set.
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "self_access_key_enc" TEXT;
ALTER TABLE "performance_evaluations" ADD COLUMN IF NOT EXISTS "manager_access_key_enc" TEXT;

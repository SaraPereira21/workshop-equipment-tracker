UPDATE public.app_assets
SET data = (data - 'inspetorLockId' - 'inspetorLockNome' - 'inspetorLockEm'),
    updated_at = now()
WHERE data ? 'inspetorLockId' OR data ? 'inspetorLockNome' OR data ? 'inspetorLockEm';
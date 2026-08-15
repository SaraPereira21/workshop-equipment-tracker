UPDATE public.app_assets
SET data = data - 'libNovoStatus' - 'libNovoInspetorSig' - 'libNovoInspetorEm' - 'libNovoSupervisorSig' - 'libNovoSupervisorEm',
    updated_at = now()
WHERE id = 'a-1785953777779';
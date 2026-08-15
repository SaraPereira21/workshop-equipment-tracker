
-- Garantir pgcrypto para crypt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_password text := 'Oficina@2026';
  v_encrypted text := crypt('Oficina@2026', gen_salt('bf'));
  r record;
  v_uid uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('60502123338', 'ALEF SILVA MAXIMIANO',                'Lavador',                          'mecanico'::app_role),
      ('02162529386', 'ANDERSON ABREU DE LIMA',              'Mecânico Sênior II',               'mecanico'::app_role),
      ('60957300310', 'ANDERSON JOSE RODRIGUES DA FONSECA',  'Auxiliar de Mecânico I',           'mecanico'::app_role),
      ('03014091375', 'CARLOS LEANDRO SILVA DA COSTA',       'Mecânico Pleno IV',                'mecanico'::app_role),
      ('21904065368', 'EDNARDO FELIX DE OLIVEIRA',           'Mecânico Sênior VI',               'mecanico'::app_role),
      ('44683669315', 'ERINEUDO DA SILVA BARROS',            'Mecânico Sênior VI',               'mecanico'::app_role),
      ('96273380368', 'FRANCISCO AZEVEDO DOS SANTOS LIMA',   'Mecânico Pleno',                   'mecanico'::app_role),
      ('91733804315', 'FRANCISCO LUZIVALDO DA SILVA ROSA',   'Mecânico Eletricista Pleno I',     'mecanico'::app_role),
      ('07800725375', 'FRANCISCO SAMUEL XAVIER DE SOUZA',    'Mecânico Júnior I',                'mecanico'::app_role),
      ('01203930348', 'GLAILTON OLIVEIRA SOARES',            'Auxiliar de Mecânico I',           'mecanico'::app_role),
      ('62380793395', 'MARCIO LEAN BERNARDINO DA SILVA',     'Auxiliar de Mecânico I',           'mecanico'::app_role),
      ('63170529307', 'MATHEUS MESQUITA DE ARAUJO',          'Auxiliar de Mecânico de Comboio',  'mecanico'::app_role),
      ('61560786302', 'PEDRO HENRIQUE MORAIS BASTOS',        'Inspetor de Manutenção',           'inspetor'::app_role)
    ) AS t(cpf, nome, cargo, role)
  LOOP
    -- Pula se já existe profile com este CPF
    IF EXISTS (SELECT 1 FROM public.profiles WHERE cpf = r.cpf) THEN
      CONTINUE;
    END IF;

    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      r.cpf || '@oficinamatriz.local',
      v_encrypted,
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object(
        'nome', r.nome,
        'cpf', r.cpf,
        'cargo', r.cargo,
        'must_change_password', true
      ),
      now(), now(), '', '', '', ''
    );

    -- O trigger handle_new_user já criou o profile. Atualiza campos extras.
    UPDATE public.profiles SET
      nome = r.nome,
      cpf = r.cpf,
      cargo = r.cargo,
      turno = 'manha',
      must_change_password = true,
      ativo = true
    WHERE id = v_uid;

    -- Perfil de acesso
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, r.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;

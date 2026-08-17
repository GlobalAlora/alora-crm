-- Add a description field to pipeline_stages, and seed it for the
-- lead-quality stages whose meaning was clarified 2026-08-17 (see
-- memory: project_alora_crm_lead_quality_definitions).

alter table pipeline_stages
  add column if not exists descripcion text;

update pipeline_stages set descripcion =
  'No es una consulta real (spam, número equivocado, alguien preguntando por un envío). No cuenta como lead.'
  where key = 'basura';

update pipeline_stages set descripcion =
  'Hubo respuesta/diálogo real, pero evaluamos que ALORA no puede o no debe resolver esa necesidad.'
  where key = 'no_cualificado';

update pipeline_stages set descripcion =
  'Contactamos, nunca respondió nada — ni reunión ni propuesta. Sigue siendo un lead cualificado, solo que se enfrió antes de avanzar.'
  where key = 'sin_respuesta';

update pipeline_stages set descripcion =
  'Hubo reunión y/o propuesta real (formal o una charla avanzada por WhatsApp) y después dejó de responder. Si nunca respondió nada desde el contacto inicial, va a "Sin respuesta", no acá.'
  where key = 'ghosting';

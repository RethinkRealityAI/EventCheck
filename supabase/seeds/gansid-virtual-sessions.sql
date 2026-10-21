-- GANSID ONLY. Virtual sessions + presenter emails for the 2026 Congress.
-- Source: the operator's "GANSID Zoom Schedule" (Oct 2026). Idempotent: re-run
-- after editing to update. Requires 20261020120000_add_virtual_sessions.sql.
--
-- presenter_key ties a presenter's email(s) to their entries in
-- virtual_sessions.presenters. Akshat Jain and Abdulaziz Mohammed have no
-- portal account on GANSID yet, so they have no email rows — add them when
-- their addresses are known (they still appear as virtual presenters).

INSERT INTO public.virtual_presenters (email, presenter_key, name) VALUES
  ('carllander@pkdia.org',            'carl-lander',         'Mr. Carl Lander'),
  ('drvarunbafna6@gmail.com',         'varun-bafna',         'Dr. Varun Bafna'),
  ('baba.inusa@kcl.ac.uk',            'baba-inusa',          'Dr. Baba Inusa'),
  ('e.oteng-ntim@nhs.net',            'eugene-oteng-ntim',   'Dr. Eugene Oteng-Ntim'),
  ('oennodu@gmail.com',               'obiageli-nnodu',      'Prof. Obiageli Nnodu'),
  ('drmoussaoubeche2021@outlook.com', 'moussa-aden-oubeche', 'Dr. Moussa Aden Oubeche'),
  ('moussaoubechefarah@gmail.com',    'moussa-aden-oubeche', 'Dr. Moussa Aden Oubeche'),
  ('adekile@gmail.com',               'adekunle-adekile',    'Prof. Adekunle Adekile'),
  ('kunleadekile@gmail.com',          'adekunle-adekile',    'Prof. Adekunle Adekile'),
  ('klingon@bu.edu',                  'elizabeth-klings',    'Dr. Elizabeth Klings'),
  ('prabhatpositive@gmail.com',       'prabhat-sinha',       'Mr. Prabhat Sinha'),
  ('prabhat.sinha@takeda.com',        'prabhat-sinha',       'Mr. Prabhat Sinha')
ON CONFLICT (email) DO UPDATE
  SET presenter_key = EXCLUDED.presenter_key, name = EXCLUDED.name;

INSERT INTO public.virtual_sessions (session_id, zoom_url, meeting_id, presenters) VALUES
  ('d1-plenary-2',        'https://us06web.zoom.us/j/86701701992', '86701701992', '[{"key":"carl-lander","name":"Mr. Carl Lander","role":"Speaker"}]'),
  ('d2-iron',             'https://us06web.zoom.us/j/85152568178', '85152568178', '[{"key":"varun-bafna","name":"Dr. Varun Bafna","role":"Speaker"}]'),
  ('d2-africa-cdc',       'https://us06web.zoom.us/j/84438713604', '84438713604', '[{"key":"abdulaziz-mohammed","name":"Dr. Abdulaziz Mohammed","role":"Speaker"},{"key":"baba-inusa","name":"Dr. Baba Inusa","role":"Moderator"}]'),
  ('d2-plenary-1',        'https://us06web.zoom.us/j/87865086834', '87865086834', '[{"key":"eugene-oteng-ntim","name":"Dr. Eugene Oteng-Ntim","role":"Speaker"}]'),
  ('d2-abs-hall1',        'https://us06web.zoom.us/j/89863854834', '89863854834', '[{"key":"obiageli-nnodu","name":"Prof. Obiageli Nnodu","role":"Abstract presenter"}]'),
  ('d2-abs-room6',        'https://us06web.zoom.us/j/88526929695', '88526929695', '[{"key":"moussa-aden-oubeche","name":"Dr. Moussa Aden Oubeche","role":"Abstract presenter"}]'),
  ('d2-hsct',             'https://us06web.zoom.us/j/84734469839', '84734469839', '[{"key":"akshat-jain","name":"Dr. Akshat Jain","role":"Speaker"}]'),
  ('d2-patient',          'https://us06web.zoom.us/j/88083249144', '88083249144', '[{"key":"carl-lander","name":"Mr. Carl Lander","role":"Speaker"}]'),
  ('d2-plenary-3',        'https://us06web.zoom.us/j/85828473428', '85828473428', '[{"key":"adekunle-adekile","name":"Prof. Adekunle Adekile","role":"Speaker"}]'),
  ('d3-inflammation',     'https://us06web.zoom.us/j/81331951344', '81331951344', '[{"key":"adekunle-adekile","name":"Prof. Adekunle Adekile","role":"Speaker"}]'),
  ('d3-thrombocytopenia', 'https://us06web.zoom.us/j/81636014359', '81636014359', '[{"key":"varun-bafna","name":"Dr. Varun Bafna","role":"Speaker"}]'),
  ('d3-pkd',              'https://us06web.zoom.us/j/82633989463', '82633989463', '[{"key":"carl-lander","name":"Mr. Carl Lander","role":"Speaker"},{"key":"prabhat-sinha","name":"Mr. Prabhat Sinha","role":"Moderator"}]'),
  ('d3-plenary-cardio',   'https://us06web.zoom.us/j/81302531685', '81302531685', '[{"key":"elizabeth-klings","name":"Dr. Elizabeth Klings","role":"Speaker"}]'),
  ('d3-toxicities',       'https://us06web.zoom.us/j/86929089876', '86929089876', '[{"key":"akshat-jain","name":"Dr. Akshat Jain","role":"Speaker"}]')
ON CONFLICT (session_id) DO UPDATE
  SET zoom_url = EXCLUDED.zoom_url, meeting_id = EXCLUDED.meeting_id,
      presenters = EXCLUDED.presenters, updated_at = now();

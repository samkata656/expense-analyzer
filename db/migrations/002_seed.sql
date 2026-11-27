-- 002_seed: demo employees (PoC: the client fills users by hand; IDs intentionally have no fixed format).
INSERT INTO users (first_name, last_name, employee_code, role) VALUES
  ('Иван',     'Петров',    'EMP-001',  'employee'),
  ('Мария',    'Георгиева', '1042',     'employee'),
  ('Георги',   'Димитров',  'TC-2025-17','employee'),
  ('Елена',    'Николова',  'en77',     'employee'),
  ('Димитър',  'Стоянов',   'DS/0099',  'employee'),
  ('Цветелина','Иванова',   'TCV-3',    'employee'),
  ('Росица',   'Ангелова',  'CFO-7781', 'cfo')
ON CONFLICT (employee_code) DO NOTHING;

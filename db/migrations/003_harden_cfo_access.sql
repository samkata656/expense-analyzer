-- 003_harden_cfo_access: employee codes act as the login secret, so the CFO agent must never see them.
-- Column-level grant: cfo_readonly can read users without employee_code.
REVOKE SELECT ON users FROM cfo_readonly;
GRANT SELECT (id, first_name, last_name, role, created_at) ON users TO cfo_readonly;

-- Older embeddings carried the code in their text and metadata; scrub them.
UPDATE expense_embeddings
SET metadata = metadata - 'employee_code',
    text = regexp_replace(text, ' \(служебен номер [^)]*\)', '')
WHERE metadata ? 'employee_code' OR text LIKE '%служебен номер%';

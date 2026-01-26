ALTER TABLE assignments ADD COLUMN IF NOT EXISTS created_by INT NULL;
-- (Optional) add FK/index
ALTER TABLE assignments ADD INDEX idx_assignments_created_by (created_by);

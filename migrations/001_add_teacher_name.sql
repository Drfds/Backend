ALTER TABLE assignments ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(255) DEFAULT NULL;

-- populate teacher_name from created_by when possible
UPDATE assignments a
JOIN users u ON a.created_by = u.id
SET a.teacher_name = u.username
WHERE (a.teacher_name IS NULL OR a.teacher_name = '') AND a.created_by IS NOT NULL;

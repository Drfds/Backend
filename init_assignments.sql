CREATE TABLE IF NOT EXISTS assignments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due DATE NULL,
  not_submitted TEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE assignments ADD INDEX idx_assignments_created_by (created_by);




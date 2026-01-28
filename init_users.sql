-- สร้างตาราง users ถ้ายังไม่มี
CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('teacher','parent','student') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_users_email (email),
  UNIQUE KEY ux_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ถ้ามีตาราง users อยู่แล้วแต่ยังไม่มีคอลัมน์ role (รันแยก ถ้ามี error ให้ตรวจสอบ)
ALTER TABLE users ADD COLUMN role ENUM('teacher','parent','student') NOT NULL DEFAULT 'student';

-- ตัวอย่างแทรกข้อมูล (สำหรับทดสอบเท่านั้น) — ควรเก็บรหัสผ่านเป็น bcrypt hash ผ่าน backend
INSERT INTO users (username, email, password, role) VALUES
('teacher1', 'teacher1@example.com', 'password123', 'teacher'),
('parent1', 'parent1@example.com', 'password123', 'parent'),
('student1', 'student1@example.com', 'password123', 'student');

#!/usr/bin/env bash
DB_USER="root"
DB_PASS=""   # ใส่รหัสผ่านถ้ามี
DB_NAME="DB_karnbarn"
SQL_FILE="$(dirname "$0")/migrations/001_add_teacher_name.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "Migration file not found: $SQL_FILE"
  exit 1
fi

# รัน migration
mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$SQL_FILE" && echo "Migration applied."

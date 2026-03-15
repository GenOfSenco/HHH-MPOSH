DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select" ON users;
DROP POLICY IF EXISTS "Allow anon insert" ON users;
DROP POLICY IF EXISTS "Allow anon update" ON users;
DROP POLICY IF EXISTS "Allow anon delete" ON users;
DROP POLICY IF EXISTS "Allow service role all" ON users;

CREATE POLICY "Allow anon select" ON users
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Allow anon insert" ON users
    FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow anon update" ON users
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow anon delete" ON users
    FOR DELETE
    TO anon
    USING (true);

CREATE POLICY "Allow service role all" ON users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

INSERT INTO users (username, password, first_name, last_name, role)
VALUES (
    'admin',
    '$2b$12$WjcvijmYJuR3E4/JRtwhCexgGpJAzEZ3e5zwwEhL9I69H7uGEnc3i',
    'Admin',
    'System',
    'admin'
)
ON CONFLICT (username) DO UPDATE SET
    password = EXCLUDED.password,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role;

SELECT
    id,
    username,
    first_name,
    last_name,
    role,
    LEFT(password, 15) || '...' as password_preview,
    created_at
FROM users;

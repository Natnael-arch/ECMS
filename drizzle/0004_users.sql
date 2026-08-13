-- Demo seed: users table with bcrypt-hashed credentials.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (name, email, password_hash, role) VALUES
('Project Manager',   'pm@ecms.app',         '$2b$10$nGv5bUkT03mHOuzTpaXK0.1we2F.oLl9ixrcT180thtjyVFKpy0Hy', 'pm'),
('Site Supervisor',   'supervisor@ecms.app', '$2b$10$nGv5bUkT03mHOuzTpaXK0.1we2F.oLl9ixrcT180thtjyVFKpy0Hy', 'supervisor'),
('Storekeeper',       'store@ecms.app',      '$2b$10$nGv5bUkT03mHOuzTpaXK0.1we2F.oLl9ixrcT180thtjyVFKpy0Hy', 'storekeeper')
ON CONFLICT (email) DO NOTHING;

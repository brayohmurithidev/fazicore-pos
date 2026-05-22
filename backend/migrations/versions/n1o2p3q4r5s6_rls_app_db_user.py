"""rls: create restricted fazipos_app database user for runtime queries

Revision ID: n1o2p3q4r5s6
Revises: m0n1o2p3q4r5
Create Date: 2026-05-21

Creates a dedicated PostgreSQL role (fazipos_app) that:
  - Has LOGIN but no SUPERUSER / BYPASSRLS / CREATEROLE / CREATEDB
  - Is subject to all RLS policies (tenant_isolation policies enforced)
  - Has DML + SELECT on all existing tables, sequences, functions
  - Gets default privileges so future migrations auto-grant access

The running API must connect as fazipos_app via DATABASE_URL_APP.
Alembic migrations continue to use DATABASE_URL (superuser) so schema
changes can run without RLS restrictions.

IMPORTANT — CREATEROLE required:
  The CREATE ROLE statement requires the Alembic DB user to have the
  CREATEROLE attribute (or be a superuser). If your DATABASE_URL user
  lacks this, create the role manually first as the postgres superuser:

    psql -U postgres -d fazipos -c "
      CREATE ROLE fazipos_app
        WITH LOGIN PASSWORD '<strong-password>'
        NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOINHERIT NOREPLICATION;
    "

  Then re-run `alembic upgrade head` — the IF NOT EXISTS guard will skip
  CREATE ROLE and the grants will succeed (as long as the Alembic user
  owns the tables or has GRANT OPTION).

Production setup:
  1. After running this migration, change fazipos_app's password:
       ALTER ROLE fazipos_app PASSWORD '<strong-password>';
  2. Set DATABASE_URL_APP in your environment:
       postgresql+asyncpg://fazipos_app:<strong-password>@host:5432/fazipos
"""

from alembic import op

revision = "n1o2p3q4r5s6"
down_revision = "m0n1o2p3q4r5"
branch_labels = None
depends_on = None

_APP_ROLE = "fazipos_app"
# Placeholder password — change immediately in production (see docstring).
_DEV_PASSWORD = "fazipos_app_dev"


def upgrade() -> None:
    # Create the role if it does not already exist.
    # NOSUPERUSER + no BYPASSRLS → RLS policies will apply.
    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT FROM pg_catalog.pg_roles WHERE rolname = '{_APP_ROLE}'
            ) THEN
                CREATE ROLE {_APP_ROLE}
                    WITH LOGIN
                    PASSWORD '{_DEV_PASSWORD}'
                    NOSUPERUSER NOCREATEDB NOCREATEROLE
                    NOINHERIT NOREPLICATION;
            END IF;
        END
        $$;
    """)

    # CONNECT on the current database (avoids hardcoding DB name).
    op.execute(f"""
        DO $$
        DECLARE
            db text := current_database();
        BEGIN
            EXECUTE format('GRANT CONNECT ON DATABASE %%I TO {_APP_ROLE}', db);
        END
        $$;
    """)

    op.execute(f"GRANT USAGE ON SCHEMA public TO {_APP_ROLE}")

    # Existing tables & sequences (covers everything already migrated).
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {_APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {_APP_ROLE}")
    op.execute(f"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO {_APP_ROLE}")

    # Default privileges — future CREATE TABLE / SEQUENCE / FUNCTION in migrations
    # automatically grant access to fazipos_app.
    op.execute(f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {_APP_ROLE};
    """)
    op.execute(f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE, SELECT ON SEQUENCES TO {_APP_ROLE};
    """)
    op.execute(f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT EXECUTE ON FUNCTIONS TO {_APP_ROLE};
    """)


def downgrade() -> None:
    op.execute(f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM {_APP_ROLE}")
    op.execute(f"REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM {_APP_ROLE}")
    op.execute(f"REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM {_APP_ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {_APP_ROLE}")
    op.execute(f"""
        DO $$
        DECLARE db text := current_database();
        BEGIN
            EXECUTE format('REVOKE CONNECT ON DATABASE %%I FROM {_APP_ROLE}', db);
        END
        $$;
    """)
    op.execute(f"DROP ROLE IF EXISTS {_APP_ROLE}")

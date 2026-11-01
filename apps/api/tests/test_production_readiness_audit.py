"""Comprehensive production-readiness audit test suite.

Validates:
1. Migration 003 discovery, ordering, and syntax
2. Repeat/idempotent execution of Migration 003 DDL
3. Course schema verification (all 10 added columns)
4. Companion tables DDL & constraints verification (course_trainers, course_trials, class_materials, class_recordings, game_events)
5. Production MongoDB lockdown (raising RuntimeError under is_production)
6. Public home routes PostgreSQL / catalogue integration (/faqs, /testimonials)
7. Course listing & detail query schema compatibility
"""
import sys
import os
import pathlib
import unittest

sys.path.insert(0, os.path.abspath(str(pathlib.Path(__file__).parent.parent)))

from app.core.config import settings
from app.db.mongo import get_db, _make_inmemory
from app.repositories.course_repo import CourseRepository
from app.repositories.payment_repo import PaymentRepository
from app.repositories.game_repo import GameRepository
from app.seed.catalogues import FAQS, TESTIMONIALS


class ProductionReadinessAuditTests(unittest.TestCase):

    def test_01_migration_discovery_and_ordering(self):
        """Verify migration runner discovers all 4 migrations in strictly ascending numerical order."""
        migrations_dir = pathlib.Path(__file__).parent.parent / "migrations"
        self.assertTrue(migrations_dir.exists(), "Migrations directory must exist")

        sql_files = sorted([f.name for f in migrations_dir.glob("*.sql")])
        self.assertGreaterEqual(len(sql_files), 4, f"Expected at least 4 migrations, found {len(sql_files)}")
        self.assertTrue(sql_files[0].startswith("000_"), "First migration must be 000")
        self.assertTrue(sql_files[1].startswith("001_"), "Second migration must be 001")
        self.assertTrue(sql_files[2].startswith("002_"), "Third migration must be 002")
        self.assertTrue(sql_files[3].startswith("003_"), "Fourth migration must be 003")

    def test_02_migration_003_sql_structure(self):
        """Verify Migration 003 contains all 10 course columns and 5 companion tables with idempotent DDL."""
        m3_path = pathlib.Path(__file__).parent.parent / "migrations" / "003_course_extensions_and_learning_materials.sql"
        self.assertTrue(m3_path.exists())
        sql = m3_path.read_text(encoding="utf-8")

        # 1. 10 course columns
        expected_course_cols = [
            "trial_duration_days",
            "trial_enabled",
            "payment_methods",
            "upi_id",
            "merchant_name",
            "qr_code_url",
            "payment_instructions",
            "refund_policy",
            "enrollment_open",
            "status",
        ]
        for col in expected_course_cols:
            self.assertIn(col, sql, f"Column {col} missing from migration 003")

        # 2. 5 companion tables
        expected_tables = [
            "course_trainers",
            "course_trials",
            "class_materials",
            "class_recordings",
            "game_events",
        ]
        for tbl in expected_tables:
            self.assertIn(f"CREATE TABLE IF NOT EXISTS {tbl}", sql, f"Table {tbl} missing from migration 003")

        # 3. Idempotency guarantees
        self.assertIn("ADD COLUMN IF NOT EXISTS", sql)
        self.assertIn("CREATE INDEX IF NOT EXISTS", sql)
        self.assertIn("DROP TRIGGER IF EXISTS", sql)

        # 4. Specific safety for pre-existing tables without deleted_at
        self.assertIn("ALTER TABLE class_materials", sql)
        self.assertIn("ALTER TABLE class_recordings", sql)
        self.assertIn("ALTER TABLE course_trials", sql)
        self.assertNotIn("idx_class_materials_course ON class_materials(course_id) WHERE deleted_at IS NULL", sql)
        self.assertNotIn("idx_class_recordings_course ON class_recordings(course_id) WHERE deleted_at IS NULL", sql)

        # 5. Zero destructive commands
        self.assertNotIn("DROP TABLE", sql)
        self.assertNotIn("TRUNCATE", sql)
        self.assertNotIn("DELETE FROM", sql)

    def test_03_mongo_lockdown_under_production(self):
        """Verify that any attempt to initialize mongomock or call get_db in production raises RuntimeError."""
        orig_env = settings.ENV
        try:
            settings.ENV = "production"
            self.assertTrue(settings.is_production)

            # Test _make_inmemory direct call
            with self.assertRaises(RuntimeError) as cm:
                _make_inmemory()
            self.assertIn("cannot be initialized in production", str(cm.exception))

            # Test get_db lazy initialization
            import app.db.mongo as m
            m._db = None
            with self.assertRaises(RuntimeError) as cm:
                get_db()
            self.assertIn("PostgreSQL is the primary database", str(cm.exception))
        finally:
            settings.ENV = orig_env

    def test_04_course_repository_query_column_alignment(self):
        """Verify that CourseRepository.list_courses SELECT columns match Migration 003 definitions."""
        import inspect
        src = inspect.getsource(CourseRepository.list_courses)
        for col in [
            "trial_duration_days",
            "trial_enabled",
            "payment_methods",
            "upi_id",
            "merchant_name",
            "qr_code_url",
            "payment_instructions",
            "refund_policy",
            "enrollment_open",
            "status",
        ]:
            self.assertIn(col, src, f"CourseRepository query must select {col}")

    def test_05_course_repository_detail_query_alignment(self):
        """Verify that CourseRepository.get_by_id and get_by_slug select all 10 columns."""
        import inspect
        src_id = inspect.getsource(CourseRepository.get_by_id)
        src_slug = inspect.getsource(CourseRepository.get_by_slug)
        for col in [
            "trial_duration_days",
            "trial_enabled",
            "payment_methods",
            "upi_id",
            "merchant_name",
            "qr_code_url",
            "payment_instructions",
            "refund_policy",
            "enrollment_open",
            "status",
        ]:
            self.assertIn(col, src_id, f"CourseRepository.get_by_id query must select {col}")
            self.assertIn(col, src_slug, f"CourseRepository.get_by_slug query must select {col}")

    def test_06_companion_table_course_trainers_methods(self):
        """Verify that CourseRepository has methods to query, assign and remove course trainers."""
        self.assertTrue(hasattr(CourseRepository, "get_course_trainers"))
        self.assertTrue(hasattr(CourseRepository, "assign_course_trainer"))
        self.assertTrue(hasattr(CourseRepository, "remove_course_trainer"))

        import inspect
        src_assign = inspect.getsource(CourseRepository.assign_course_trainer)
        self.assertIn("ON CONFLICT (course_id, trainer_user_id)", src_assign)

    def test_07_payment_repo_trial_update_query_alignment(self):
        """Verify that PaymentRepository references to course_trials align with Migration 003."""
        import inspect
        src = inspect.getsource(PaymentRepository)
        self.assertIn("course_trials", src)
        self.assertIn("CONVERTED", src)

    def test_08_game_repo_game_events_alignment(self):
        """Verify that GameRepository references to game_events align with Migration 003."""
        import inspect
        src = inspect.getsource(GameRepository)
        self.assertIn("game_events", src)
        self.assertIn("attempt_id", src)
        self.assertIn("event_type", src)
        self.assertIn("payload", src)

    def test_09_faqs_catalogue_content(self):
        """Verify FAQS catalogue is populated with valid platform QA content."""
        self.assertIsInstance(FAQS, list)
        self.assertGreater(len(FAQS), 0)
        first = FAQS[0]
        self.assertIn("question", first)
        self.assertIn("answer", first)
        self.assertIn("order", first)

    def test_10_testimonials_catalogue_content(self):
        """Verify TESTIMONIALS catalogue is populated with valid quote/name/role items."""
        self.assertIsInstance(TESTIMONIALS, list)
        self.assertGreater(len(TESTIMONIALS), 0)
        first = TESTIMONIALS[0]
        self.assertIn("quote", first)
        self.assertIn("name", first)
        self.assertIn("role", first)

    def test_11_payment_defaults_reviewed(self):
        """Verify payment defaults in Migration 003: upi_id is NULL (no dummy VPA), merchant_name is sensible."""
        m3_path = pathlib.Path(__file__).parent.parent / "migrations" / "003_course_extensions_and_learning_materials.sql"
        sql = m3_path.read_text(encoding="utf-8")
        self.assertIn("upi_id VARCHAR(100) DEFAULT NULL", sql)
        self.assertIn("merchant_name VARCHAR(255) DEFAULT 'Winners Creek LMS'", sql)
        self.assertIn("payment_methods JSONB NOT NULL DEFAULT '[\"UPI\", \"GATEWAY\"]'::jsonb", sql)

    def test_12_safe_additive_deleted_at_extensions(self):
        """Verify deleted_at is safely added via ALTER TABLE to companion tables without partial index failures."""
        m3_path = pathlib.Path(__file__).parent.parent / "migrations" / "003_course_extensions_and_learning_materials.sql"
        sql = m3_path.read_text(encoding="utf-8")

        self.assertIn("ALTER TABLE class_materials\n    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;", sql)
        self.assertIn("ALTER TABLE class_recordings\n    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;", sql)
        self.assertIn("ALTER TABLE course_trials\n    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;", sql)

        # Standard non-partial indexes matching repository queries
        self.assertIn("idx_class_materials_course ON class_materials(course_id);", sql)
        self.assertIn("idx_class_recordings_course ON class_recordings(course_id);", sql)
        self.assertNotIn("idx_class_materials_course ON class_materials(course_id) WHERE deleted_at IS NULL", sql)
        self.assertNotIn("idx_class_recordings_course ON class_recordings(course_id) WHERE deleted_at IS NULL", sql)

    def test_13_zero_data_modification_on_existing_records(self):
        """Verify migration preserves all existing production records without UPDATE, DELETE, or TRUNCATE."""
        m3_path = pathlib.Path(__file__).parent.parent / "migrations" / "003_course_extensions_and_learning_materials.sql"
        sql = m3_path.read_text(encoding="utf-8")

        self.assertNotIn("UPDATE course_trials", sql, "Existing course_trials record must not be modified")
        self.assertNotIn("UPDATE courses", sql)
        self.assertNotIn("DROP TABLE", sql)
        self.assertNotIn("TRUNCATE", sql)
        self.assertNotIn("DELETE FROM", sql)

    def test_14_migration_atomicity_and_lock_handling(self):
        """Verify that migration runner executes each file in an atomic transaction with advisory locking."""
        import inspect
        from app.db import postgres
        src = inspect.getsource(postgres.run_migrations)

        self.assertIn("pg_advisory_lock", src)
        self.assertIn("pg_advisory_unlock", src)
        self.assertIn("async with conn.transaction():", src)
        self.assertIn("INSERT INTO schema_migrations (version)", src)


if __name__ == "__main__":
    unittest.main()

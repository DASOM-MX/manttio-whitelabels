-- Dedup script for A16: customer_contacts.email unique index
-- https://github.com/DASOM-MX/manttio-whitelabeled/.claude/plans/client-portal/01-data-model.md §0
--
-- The unique email index on customer_contacts (A16, 2026-08-31) lands on live data.
-- The shared test DB may carry duplicate emails from older data. This script
-- blanks the losers (rows that cannot claim email uniqueness) by setting email = NULL.
--
-- NEVER deletes rows — the fork's no-hard-deletes rule applies everywhere.
-- Nulling email is safe because email is nullable and contacts without an address
-- are unaffected by the unique constraint.
--
-- Run this BEFORE 0044_black_jubilee.sql is applied. After it runs, the index
-- creation will not fail 23505 (unique violation).
--
-- The strategy: for each duplicate email, keep the default contact if one exists
-- (is_default DESC), then by earliest creation time, then by id for determinism.
-- Null out the email on the rest. Preserving the default contact prevents a customer's
-- denormalized email field from mirroring a non-existent contact.

WITH ranked AS (
  SELECT
    id,
    email,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY email ORDER BY is_default DESC, created_at ASC, id ASC) AS rn
  FROM customer_contacts
  WHERE email IS NOT NULL
)
UPDATE customer_contacts
SET email = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Position in time of an imported line within its statement: larger is later,
-- whichever way the bank sorted the file. Every line of one import shares a
-- created_at, so without this nothing orders several transactions on the same
-- day, and the account's latest balance cannot be read off the latest row.
-- NULL for a line not imported from a statement.
ALTER TABLE bank_transactions ADD COLUMN statement_sequence INTEGER;

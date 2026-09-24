-- US-ACC-050: an exemption can expire. NULL means indefinite.
ALTER TABLE customers ADD COLUMN tax_exempt_until DATE;

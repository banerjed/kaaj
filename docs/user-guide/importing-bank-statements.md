# Importing bank statements

Bring your bank's transactions into Kaaj so you can reconcile them against
your invoices, bills and payments. You need to be in the finance team (or an
owner or administrator) to import.

## What you need

A statement file downloaded from your bank's website, in one of these formats:

- **OFX or QFX** ("Money", "Quicken" or "Web Connect" download) — the most
  reliable choice if your bank offers it.
- **CSV** ("comma-separated", "Excel-compatible" or "spreadsheet" download).

A PDF statement can't be imported, and neither can an Excel `.xlsx` file: open
it and save it as CSV first, or download CSV from the bank instead.

## Importing

1. Go to **Accounting → Banking** and choose **Import statement**.
2. Choose the bank account the statement belongs to, choose the file, and
   select **Preview**.
3. Check the preview. It shows how many transactions the file holds, how many
   are new, the total money in and out, and the first rows as Kaaj read them.
4. Select **Import**.

Nothing is saved until you select Import. If something is wrong, change the
settings on the preview and select **Preview again**.

## The first time you import from a bank

Banks lay their files out differently. The first time you import a CSV for an
account, Kaaj works out which column is which, then asks you to check two
things:

- **The columns.** Each column has a box saying what it holds — Date,
  Description, Amount, Money in, Money out, Balance and so on. Correct any that
  are wrong, or set a column to *Ignore*.
- **Which way money moves.** Money coming in should show as a positive number
  and money going out as a negative one. Some statements — especially credit
  card statements — show purchases as positive. If yours does, tick **Money out
  is shown as positive**. Then tick the box confirming you've checked.

Kaaj remembers these choices for that account, so the next statement from the
same bank imports in one click. If your bank changes its file layout, Kaaj
notices and asks you to check the columns again.

## When Kaaj asks a question

Kaaj never guesses. If a file could be read two ways, it asks:

- **Date format.** In `03/04/2026`, is that 3 April or March 4? If every date
  in the file could be either, choose the date format.
- **Decimal mark.** Is `1.234` one thousand two hundred and thirty-four, or
  just over one? If the file doesn't make it clear, choose the decimal mark.
- **No column names.** If the file doesn't start with a row of column names,
  or Kaaj doesn't recognise them, tell it what each column holds. If the first
  line *is* column names in another language, tick **Line 1 holds column
  names**.

## Checks Kaaj makes for you

- **Running balance.** If your statement has a balance column, Kaaj checks
  that every transaction adds up to the balance the bank printed. If it
  doesn't, a column is probably set wrong (for example Money in and Money out
  swapped), and Kaaj tells you the line where it stopped adding up.
- **No duplicates.** Importing the same statement twice, or two statements
  whose dates overlap, adds each transaction only once. The preview shows how
  many are already imported. For a CSV file a transaction is recognised by its
  date, amount and description exactly as the bank printed them — if your bank
  later changes how it words descriptions, the preview will show those lines
  as new, so check the count before importing.
- **Look-alikes.** If a new transaction has the same date and amount as one
  already in the account — perhaps one you entered by hand — the preview
  points it out so you can check it isn't the same payment.
- **Currency.** A statement in a different currency from the account is
  refused.
- **Exact amounts.** Amounts are never rounded. A figure with more than two
  decimal places is refused rather than changed.

## After importing

Imported transactions appear on the Banking page as **unmatched**, ready to
reconcile. Each import is listed under **Recent imports** with the file name,
the period it covered, and how many transactions it added or skipped.

## Limits

- Up to 5 MB and 20,000 transactions per file. For a longer history, import
  one period at a time.
- One bank account per file. If your bank's OFX download holds several
  accounts, download them one at a time.

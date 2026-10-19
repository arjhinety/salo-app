# Parser development set (tuning evenings E01–E10 only)

`donor_messages_tuning.csv` holds the 170 rows of `donor_messages.csv` (Salo Evening Dataset v1.2, public, github.com/arjhinety/salo-evening-dataset; source sha256 `5ee09c01485a…`, matching the dataset's SHA256SUMS) whose lot belongs to a tuning evening. An `evening_id` column was added in front; every other column and the row order are unchanged.

**Filter used (2026-10-20, orchestrator):** `donor_messages.csv` has no evening column, so each message's `lot_id` was joined to `food_offers.csv` → `evening_id`, and only rows with `evening_id` in E01–E10 were kept while reading; all other rows were discarded without being printed. Check: the same 170 message ids as `split == "tuning"` (0 mismatches). File sha256 `4f269299f5201029512af17bda028efd539a621bc8df80e89ed499d573995700`.

**Hard rule (Arjhine, 2026-10-20):** the rule-based fallback's vocabulary, synonyms, unit words, number words, time phrases, and any example messages in the server prompt may be built only from this file. Agents filter by `evening_id` (E01–E10) first and assert it, and never open or print pilot (E11–E20) or main (E21–E30) rows, and never open the full `donor_messages.csv`. No scoring on pilot or main messages without asking Arjhine first.

The messages are template-generated, so any accuracy measured here is an optimistic upper bound (dataset README, caveats).

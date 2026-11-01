# Bundled dataset

These are 10 tables from my **Salo Evening Dataset v1.3**, copied byte for byte from the dataset repo
https://github.com/arjhinety/salo-evening-dataset (commit `9e140ca`). v1.3 is **not published yet**: it is
not on Hugging Face (no `v1.3` tag) until Arjhine approves the upload. Only `evenings`, `pantry_needs` and
`food_offers` changed from v1.2 (commit `75d6ff7`): 34 more main evenings, E21–E64, appended.
`donor_messages.csv` is left out because the app does not read it (architecture D-13).

`npm run build-data` checks every file against `SHA256SUMS` (the same hashes as the dataset repo's
`SHA256SUMS`), then writes `src/data/dataset.generated.ts`. Do not edit the CSVs by hand.

All businesses, pantries and people in these files are fictional. Licences: ODbL 1.0 for pantries,
donors, drivers, road_distances and driver_distances (OpenStreetMap-derived); CC BY 4.0 for the rest.
© OpenStreetMap contributors.

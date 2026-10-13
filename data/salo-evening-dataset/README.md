# Bundled dataset

These are 10 tables from my **Salo Evening Dataset v1.2**, copied byte for byte from
https://huggingface.co/datasets/arjhinety/salo-evening-dataset (tag `v1.2`) and
https://github.com/arjhinety/salo-evening-dataset (commit `75d6ff7`).
`donor_messages.csv` is left out because the app does not read it (architecture D-13).

`npm run build-data` checks every file against `SHA256SUMS` (the same hashes as the dataset repo's
`SHA256SUMS`), then writes `src/data/dataset.generated.ts`. Do not edit the CSVs by hand.

All businesses, pantries and people in these files are fictional. Licences: ODbL 1.0 for pantries,
donors, drivers, road_distances and driver_distances (OpenStreetMap-derived); CC BY 4.0 for the rest.
© OpenStreetMap contributors.


import csv
from pathlib import Path

source = Path("data/raw/GLB.Ts+dSST.csv")
output = Path("data/processed/GLB_Temperature_Anomaly_1995_2024.csv")

output.parent.mkdir(parents=True, exist_ok=True)

with source.open("r", newline="", encoding="utf-8-sig") as file:
    all_rows = list(csv.reader(file))

# Detect whether the first row is a header
header = None
if all_rows and not all_rows[0][0].strip().isdigit():
    header = all_rows.pop(0)

# Select exactly 1995–2024
selected = [
    row for row in all_rows
    if row and row[0].strip().isdigit()
    and 1995 <= int(row[0].strip()) <= 2024
]

if not selected:
    raise ValueError("No data found for 1995–2024.")

with output.open("w", newline="", encoding="utf-8") as file:
    writer = csv.writer(file)
    if header:
        writer.writerow(header)
    writer.writerows(selected)

years = sorted({int(row[0]) for row in selected})

print("NASA data filtering completed!")
print("First year:", years[0])
print("Last year:", years[-1])
print("Number of years:", len(years))
print("Output file:", output)

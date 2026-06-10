from datasets import load_dataset
import pandas as pd
import json
from pathlib import Path

Path("reports").mkdir(exist_ok=True)

print("Loading dataset...")

ds = load_dataset("LevMuchnik/SupremeCourtOfIsrael")

split_name = list(ds.keys())[0]

df = ds[split_name].to_pandas()

report = {
    "rows": len(df),
    "columns": list(df.columns),
}

with open("reports/schema.json", "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

summary = []

for col in df.columns:
    summary.append({
        "column": col,
        "dtype": str(df[col].dtype),
        "non_null": int(df[col].notna().sum())
    })

pd.DataFrame(summary).to_csv(
    "reports/column_summary.csv",
    index=False
)

print("Done.")

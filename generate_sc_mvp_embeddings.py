import pandas as pd
import json
from datasets import load_dataset
from sentence_transformers import SentenceTransformer
import os

TARGET_DISTRIBUTION = {
    'ע"א': 5000,
    'בג"ץ': 4000,
    'ע"פ': 4000,
    'רע"א': 2000,
    'עע"ם': 2000,
    'רע"פ': 1000,
    'דנ"א': 400,
    'דנג"ץ': 300,
    'דנ"פ': 300,
    'בר"ם': 1000
}

def main():
    print("Loading dataset from Hugging Face...")
    # התיקון כאן: השם המדויק של המאגר הפתוח
    dataset = load_dataset("LevMuchnik/SupremeCourtOfIsrael", split="train")
    df = dataset.to_pandas()

    print("Filtering and sampling cases...")
    sampled_dfs = []
    
    for inyan, count in TARGET_DISTRIBUTION.items():
        subset = df[(df['meta_inyan_nm'] == inyan) & (df['text'].notnull()) & (df['text'].str.len() > 100)]
        n_samples = min(count, len(subset))
        
        if n_samples > 0:
            sampled_subset = subset.sample(n=n_samples, random_state=42)
            sampled_dfs.append(sampled_subset)
            print(f"Sampled {n_samples} cases for {inyan}")

    final_df = pd.concat(sampled_dfs, ignore_index=True)
    print(f"Total cases sampled: {len(final_df)}")

    print("Loading Embedding Model (multilingual)...")
    model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-mpnet-base-v2')

    print("Generating Embeddings and saving to JSONL...")
    output_file = "factum_il_mvp.jsonl"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        for idx, row in final_df.iterrows():
            text_for_embedding = str(row['text'])[:2000]
            embedding = model.encode(text_for_embedding).tolist()
            
            record = {
                "id": str(row.get('meta_case_nbr', idx)),
                "case_name": str(row.get('meta_case_nm', '')),
                "court": str(row.get('meta_court_nm', '')),
                "case_type": str(row.get('meta_inyan_nm', '')),
                "date": str(row.get('meta_verdict_dt', '')),
                "judges": str(row.get('meta_judge', '')),
                "text": str(row['text']),
                "embedding": embedding
            }
            
            f.write(json.dumps(record, ensure_ascii=False) + '\n')
            
            if (idx + 1) % 1000 == 0:
                print(f"Processed {idx + 1} records...")

    print(f"Done! Saved to {output_file}")

if __name__ == "__main__":
    main()

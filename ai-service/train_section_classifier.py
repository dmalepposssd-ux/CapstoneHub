"""
Training entry point for the research classification head.

This script is intentionally separate from the FastAPI runtime. It defines a
Transformer encoder plus a custom classification head for academic section
quality labels: weak, acceptable, good, excellent.

Expected dataset format: JSONL
{"text": "...", "label": "good"}
"""

import argparse
import json
from pathlib import Path


LABEL_TO_ID = {"weak": 0, "acceptable": 1, "good": 2, "excellent": 3}


def load_jsonl(path: str):
    rows = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        if item.get("label") in LABEL_TO_ID and item.get("text"):
            rows.append(item)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--model", default="aubmindlab/bert-base-arabertv2")
    parser.add_argument("--output", default="models/section-quality-classifier")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    import torch
    from torch import nn
    from torch.utils.data import DataLoader
    from transformers import AutoModel, AutoTokenizer, AdamW

    rows = load_jsonl(args.data)
    tokenizer = AutoTokenizer.from_pretrained(args.model)

    class Dataset(torch.utils.data.Dataset):
        def __len__(self):
            return len(rows)

        def __getitem__(self, index):
            item = rows[index]
            encoded = tokenizer(item["text"], truncation=True, padding="max_length", max_length=384, return_tensors="pt")
            return {
                "input_ids": encoded["input_ids"].squeeze(0),
                "attention_mask": encoded["attention_mask"].squeeze(0),
                "label": torch.tensor(LABEL_TO_ID[item["label"]], dtype=torch.long),
            }

    class AcademicSectionClassifier(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = AutoModel.from_pretrained(args.model)
            hidden = self.encoder.config.hidden_size
            self.dropout = nn.Dropout(0.2)
            self.classifier = nn.Linear(hidden, len(LABEL_TO_ID))

        def forward(self, input_ids, attention_mask):
            output = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
            cls = output.last_hidden_state[:, 0, :]
            return self.classifier(self.dropout(cls))

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = AcademicSectionClassifier().to(device)
    loader = DataLoader(Dataset(), batch_size=args.batch_size, shuffle=True)
    optimizer = AdamW(model.parameters(), lr=2e-5)
    loss_fn = nn.CrossEntropyLoss()

    model.train()
    for epoch in range(args.epochs):
        total = 0
        for batch in loader:
            optimizer.zero_grad()
            logits = model(batch["input_ids"].to(device), batch["attention_mask"].to(device))
            loss = loss_fn(logits, batch["label"].to(device))
            loss.backward()
            optimizer.step()
            total += float(loss.item())
        print(f"epoch={epoch + 1} loss={total / max(1, len(loader)):.4f}")

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), output / "classifier.pt")
    tokenizer.save_pretrained(output)
    print(f"saved={output}")


if __name__ == "__main__":
    main()

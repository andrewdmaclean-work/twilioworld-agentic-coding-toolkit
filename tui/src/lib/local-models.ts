// lib/local-models.ts — local model catalog and selection helpers.

import { existsSync, statSync } from "fs";
import { join } from "path";
import { MODELS_DIR } from "./constants.ts";
import { readConfig } from "./config.ts";
import { fileExecutable } from "./exec.ts";
import { LLAMAFILE_DEST } from "./constants.ts";

export interface LocalModel {
  slug: string;
  name: string;
  description: string;
  url: string;
  sizeBytes: number;
  sizeLabel: string;
  minBytes: number;
  dest: string;
  staging: string;
  mmproj?: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    slug: "gemma4-e2b",
    name: "Gemma 4 E2B",
    description: "Google · multimodal · ~3.3 GB",
    url: "https://www.kaggle.com/api/v1/models/google/gemma-4/gguf/gemma-4-e2b-it-qat-q4_0-gguf/2/download",
    sizeBytes: 3_543_348_429,
    sizeLabel: "3.3 GB",
    minBytes: 1_500_000_000,
    dest: join(MODELS_DIR, "gemma4-e2b.gguf"),
    staging: join(MODELS_DIR, "gemma4-e2b.download"),
    mmproj: join(MODELS_DIR, "gemma4-e2b-mmproj.gguf"),
  },
  {
    slug: "phi4-mini",
    name: "Phi-4-mini",
    description: "Microsoft · reasoning + code · ~2.5 GB",
    url: "https://huggingface.co/microsoft/Phi-4-mini-instruct-gguf/resolve/main/Phi-4-mini-instruct-Q4_0.gguf",
    sizeBytes: 2_500_000_000,
    sizeLabel: "2.5 GB",
    minBytes: 1_500_000_000,
    dest: join(MODELS_DIR, "phi4-mini.gguf"),
    staging: join(MODELS_DIR, "phi4-mini.download"),
  },
];

export const DEFAULT_MODEL_SLUG = "gemma4-e2b";

export function getModel(slug: string): LocalModel {
  const m = LOCAL_MODELS.find((m) => m.slug === slug);
  if (!m) throw new Error(`Unknown model slug: ${slug}`);
  return m;
}

export function getSelectedModel(): LocalModel {
  const cfg = readConfig();
  const slug = (cfg.settings as any).localModelSlug ?? DEFAULT_MODEL_SLUG;
  return LOCAL_MODELS.find((m) => m.slug === slug) ?? LOCAL_MODELS[0];
}

export function localModelInstalled(model: LocalModel): boolean {
  if (!fileExecutable(LLAMAFILE_DEST)) return false;
  if (!existsSync(model.dest)) return false;
  try { return statSync(model.dest).size >= model.minBytes; } catch { return false; }
}

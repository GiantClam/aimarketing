import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getVersionedArtifactToolUtilsCandidates() {
  const presentationsRoot = path.join(
    os.homedir(),
    ".codex",
    "plugins",
    "cache",
    "openai-primary-runtime",
    "presentations",
  );

  try {
    const entries = await fs.readdir(presentationsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => right.name.localeCompare(left.name))
      .map((entry) =>
        path.join(
          presentationsRoot,
          entry.name,
          "skills",
          "presentations",
          "scripts",
          "artifact_tool_utils.mjs",
        ),
      );
  } catch {
    return [];
  }
}

async function resolveArtifactToolUtilsPath() {
  const candidates = [
    process.env.CODEX_ARTIFACT_TOOL_UTILS_PATH,
    path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "plugins",
      "openai-primary-runtime",
      "plugins",
      "presentations",
      "skills",
      "presentations",
      "scripts",
      "artifact_tool_utils.mjs",
    ),
    ...(await getVersionedArtifactToolUtilsCandidates()),
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("artifact_tool_utils_not_found");
}

async function loadArtifactToolUtils() {
  const utilsPath = await resolveArtifactToolUtilsPath();
  return await import(pathToFileURL(utilsPath).href);
}

function requireArg(args, key) {
  const index = args.indexOf(key);
  if (index === -1 || index === args.length - 1) {
    throw new Error(`Missing required argument: ${key}`);
  }
  return args[index + 1];
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toBulletLines(items) {
  return items.filter(Boolean).map((item) => `• ${item}`).join("\n");
}

function getScenarioLabel(language, scenario) {
  const table = {
    "marketing-campaign": { zh: "营销策划", en: "Marketing Campaign" },
    "product-launch": { zh: "产品发布", en: "Product Launch" },
    "sales-deck": { zh: "销售提案", en: "Sales Proposal" },
    training: { zh: "培训课件", en: "Training Deck" },
  };
  const labels = table[scenario] || table["marketing-campaign"];
  return language === "zh-CN" ? labels.zh : labels.en;
}

function buildSlideLayout(variant, index, deck) {
  const titleTop = index === 0 ? 170 : 120;
  const bodyTop = index === 0 ? 280 : 245;
  const bulletsTop = index === 0 ? 420 : 360;
  return {
    titleTop,
    bodyTop,
    bulletsTop,
    footer: `${getScenarioLabel(deck.language, deck.scenario)} · ${index + 1}/${variant.slides.length}`,
  };
}

async function main() {
  const payloadPath = path.resolve(requireArg(process.argv, "--payload"));
  const outputPath = path.resolve(requireArg(process.argv, "--output"));
  const workspace = path.resolve(requireArg(process.argv, "--workspace"));
  const { ensureArtifactToolWorkspace, importArtifactTool, createSlideContext } = await loadArtifactToolUtils();

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const { deck, variant } = payload;

  await ensureArtifactToolWorkspace(workspace);
  const artifact = await importArtifactTool(workspace);
  const { Presentation, PresentationFile } = artifact;
  const slideSize = { width: 1280, height: 720 };
  const presentation = Presentation.create({ slideSize });
  const ctx = createSlideContext(artifact, {
    slideSize,
    workspaceDir: workspace,
    outputDir: path.dirname(outputPath),
    assetDir: path.join(workspace, "assets"),
  });

  for (let index = 0; index < variant.slides.length; index += 1) {
    const slidePlan = variant.slides[index];
    const slide = presentation.slides.add();
    const layout = buildSlideLayout(variant, index, deck);
    const isLight = variant.palette.background.toLowerCase() === "#ffffff";
    const subtleText = isLight ? "#5f4a45" : "#d7cbc8";

    ctx.addShape(slide, {
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      fill: { color: variant.palette.background },
      line: { width: 0, fill: "transparent", style: "solid" },
    });

    ctx.addShape(slide, {
      left: 72,
      top: 64,
      width: 1136,
      height: 40,
      fill: { color: variant.palette.panel },
      line: { width: 0, fill: "transparent", style: "solid" },
      radius: 12,
    });

    ctx.addText(slide, {
      left: 84,
      top: 71,
      width: 520,
      height: 24,
      text: normalizeText(slidePlan.kicker) || getScenarioLabel(deck.language, deck.scenario),
      fontSize: 14,
      color: variant.palette.accent,
      bold: true,
    });

    ctx.addText(slide, {
      left: 72,
      top: layout.titleTop,
      width: 880,
      height: 96,
      text: normalizeText(slidePlan.title) || normalizeText(deck.title),
      fontSize: index === 0 ? 28 : 24,
      color: variant.palette.foreground,
      bold: true,
    });

    ctx.addText(slide, {
      left: 72,
      top: layout.bodyTop,
      width: 780,
      height: 120,
      text: normalizeText(slidePlan.body),
      fontSize: 18,
      color: subtleText,
    });

    ctx.addShape(slide, {
      left: 890,
      top: 160,
      width: 318,
      height: 430,
      fill: { color: variant.palette.panel },
      line: { width: 1, fill: variant.palette.border, style: "solid" },
      radius: 18,
    });

    ctx.addText(slide, {
      left: 918,
      top: 192,
      width: 262,
      height: 28,
      text: deck.language === "zh-CN" ? "关键要点" : "Key points",
      fontSize: 15,
      color: variant.palette.accent,
      bold: true,
    });

    ctx.addText(slide, {
      left: 918,
      top: 236,
      width: 248,
      height: 260,
      text: toBulletLines(slidePlan.bullets || []),
      fontSize: 18,
      color: variant.palette.foreground,
    });

    ctx.addText(slide, {
      left: 72,
      top: 652,
      width: 480,
      height: 24,
      text: deck.title,
      fontSize: 12,
      color: subtleText,
    });

    ctx.addText(slide, {
      left: 968,
      top: 652,
      width: 240,
      height: 24,
      text: layout.footer,
      fontSize: 12,
      color: subtleText,
      align: "right",
    });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(outputPath);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

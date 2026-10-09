import { mkdir, writeFile } from "node:fs/promises";

const user = process.env.GITHUB_REPOSITORY_OWNER ?? "owaisazmal";
const outDir = new URL("../assets/", import.meta.url);

const themes = {
  dark: {
    bg: "#12151b",
    border: "#262a33",
    text: "#f3f4f6",
    muted: "#8b92a0",
    levels: ["#232831", "#016620", "#109932", "#28c244", "#7fe18b"],
  },
  light: {
    bg: "#f6f7f9",
    border: "#dfe2e7",
    text: "#111318",
    muted: "#5d6471",
    levels: ["#e3e6eb", "#7fe18b", "#28c244", "#109932", "#016620"],
  },
};

const WIDTH = 960;
const PAD = 28;
const GAP = 2.8;
const MONTH_GAP = 9;
const GRID_TOP = 66;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const round = (n) => Number(n.toFixed(2));

async function loadDays() {
  const res = await fetch(`https://github.com/users/${user}/contributions`);
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const html = await res.text();

  const counts = new Map();
  for (const [, id, label] of html.matchAll(/<tool-tip[^>]*\sfor="([^"]+)"[^>]*>([^<]*)</g)) {
    counts.set(id, Number.parseInt(label, 10) || 0);
  }

  const days = [];
  for (const [tag] of html.matchAll(/<td[^>]*\sdata-date="[^"]+"[^>]*>/g)) {
    const attr = (name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))[1];
    days.push({
      date: attr("data-date"),
      level: Number(attr("data-level")),
      count: counts.get(attr("id")) ?? 0,
    });
  }
  if (!days.length) throw new Error("No contribution days found");
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function summarize(days) {
  let total = 0;
  let active = 0;
  let streak = 0;
  let maxStreak = 0;
  for (const { count } of days) {
    total += count;
    streak = count > 0 ? streak + 1 : 0;
    if (count > 0) active += 1;
    maxStreak = Math.max(maxStreak, streak);
  }
  return { total, active, maxStreak };
}

// One block per month, split mid week the way LeetCode draws its heatmap.
function layout(days) {
  const blocks = [];
  let col = -1;
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const month = date.getUTCMonth();
    const row = date.getUTCDay();
    const block = blocks.at(-1);
    if (!block || block.month !== month) {
      col += 1;
      blocks.push({ month, firstCol: col, lastCol: col, cells: [] });
    } else if (row === 0) {
      col += 1;
      block.lastCol = col;
    }
    blocks.at(-1).cells.push({ col, row, level: day.level });
  }

  const cols = col + 1;
  const pitch = (WIDTH - PAD * 2 - (blocks.length - 1) * MONTH_GAP + GAP) / cols;
  const x = (c, blockIndex) => PAD + c * pitch + blockIndex * MONTH_GAP;
  return { blocks, pitch, size: pitch - GAP, x };
}

function render(days, theme) {
  const { total, active, maxStreak } = summarize(days);
  const { blocks, pitch, size, x } = layout(days);
  const labelY = GRID_TOP + pitch * 7 - GAP + 21;
  const height = Math.ceil(labelY + 22);

  const byLevel = theme.levels.map(() => []);
  const labels = [];
  blocks.forEach((block, i) => {
    for (const cell of block.cells) {
      byLevel[cell.level].push(`<use href="#day" x="${round(x(cell.col, i))}" y="${round(GRID_TOP + cell.row * pitch)}"/>`);
    }
    if (block.lastCol > block.firstCol) {
      const center = (x(block.firstCol, i) + x(block.lastCol, i) + size) / 2;
      labels.push(`<text x="${round(center)}" y="${round(labelY)}" text-anchor="middle">${MONTHS[block.month]}</text>`);
    }
  });

  const cells = byLevel
    .map((uses, level) => `  <g fill="${theme.levels[level]}">${uses.join("")}</g>`)
    .join("\n");
  const title = `${total.toLocaleString("en-US")} contributions in the past one year`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">Total active days: ${active}. Max streak: ${maxStreak}.</desc>
  <defs>
    <rect id="day" width="${round(size)}" height="${round(size)}" rx="2.4"/>
  </defs>
  <rect x=".5" y=".5" width="${WIDTH - 1}" height="${height - 1}" rx="20" fill="${theme.bg}" stroke="${theme.border}"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${theme.muted}">
    <text x="${PAD}" y="42" font-size="15"><tspan font-size="18" font-weight="700" fill="${theme.text}">${total.toLocaleString("en-US")}</tspan> contributions in the past one year</text>
    <text x="${WIDTH - PAD}" y="42" font-size="13" text-anchor="end">Total active days: <tspan font-weight="600" fill="${theme.text}">${active}</tspan><tspan dx="18">Max streak: </tspan><tspan font-weight="600" fill="${theme.text}">${maxStreak}</tspan></text>
    <g font-size="12">${labels.join("")}</g>
  </g>
${cells}
</svg>
`;
}

const days = await loadDays();
await mkdir(outDir, { recursive: true });
for (const [name, theme] of Object.entries(themes)) {
  await writeFile(new URL(`contributions-${name}.svg`, outDir), render(days, theme));
}
console.log(`Drew ${days.length} days for ${user}`);

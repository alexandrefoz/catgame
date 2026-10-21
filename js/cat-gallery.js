// Galeria de personagens: variações de gato desenhadas em SVG próprio (sem imagens externas,
// sem APIs, sem fontes/emoji dependentes de plataforma). Cada preset é só uma combinação de
// cores/traços sobre o mesmo template de rosto de gato, exceto o "pixel" (desenho em blocos).
import { getItem, setItem } from "./storage.js";

const SELECTED_SKIN_KEY = "selectedCatSkin";
export const DEFAULT_SKIN_ID = "default"; // bolinha verde lisa (sem personagem), o visual original

// Template base: duas orelhas (triângulos), cabeça (círculo), orelhas internas, olhos, focinho,
// bigodes. "earColor"/"headColor" aceitam qualquer cor; "accents" desenha elementos extras por cima.
function catFaceSvg({
  headColor,
  earColor = headColor,
  innerEarColor = "#ffd7c2",
  eyeColor = "#2e2a26",
  noseColor = "#d98a8a",
  strokeColor = "none",
  mouth = "smile", // "smile" | "tongue" | "surprised"
  eyeStyle = "normal", // "normal" | "wink" | "cross"
  extras = "",
} = {}) {
  const stroke = strokeColor !== "none" ? `stroke="${strokeColor}" stroke-width="2.5"` : "";

  const mouthShape =
    mouth === "tongue"
      ? `<path d="M44 66 Q50 72 56 66" fill="none" stroke="${eyeColor}" stroke-width="2.5" stroke-linecap="round"/>
         <ellipse cx="50" cy="72" rx="5" ry="6" fill="#e8798f"/>`
      : mouth === "surprised"
      ? `<ellipse cx="50" cy="68" rx="5" ry="6" fill="${eyeColor}"/>`
      : `<path d="M42 66 Q50 72 50 66 Q50 72 58 66" fill="none" stroke="${eyeColor}" stroke-width="2.5" stroke-linecap="round"/>`;

  const rightEye =
    eyeStyle === "wink"
      ? `<path d="M64 56 Q68 52 72 56" stroke="${eyeColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : eyeStyle === "cross"
      ? `<circle cx="66" cy="57" r="4.5" fill="${eyeColor}"/>`
      : `<circle cx="68" cy="57" r="4.5" fill="${eyeColor}"/>`;
  const leftEye =
    eyeStyle === "cross"
      ? `<circle cx="34" cy="57" r="4.5" fill="${eyeColor}"/>`
      : `<circle cx="32" cy="57" r="4.5" fill="${eyeColor}"/>`;

  return `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
  <polygon points="14,38 28,8 40,36" fill="${earColor}" ${stroke}/>
  <polygon points="86,38 72,8 60,36" fill="${earColor}" ${stroke}/>
  <polygon points="19,34 28,16 35,33" fill="${innerEarColor}"/>
  <polygon points="81,34 72,16 65,33" fill="${innerEarColor}"/>
  <circle cx="50" cy="55" r="36" fill="${headColor}" ${stroke}/>
  ${extras}
  ${leftEye}
  ${rightEye}
  <polygon points="46,63 54,63 50,69" fill="${noseColor}"/>
  ${mouthShape}
  <g stroke="${eyeColor}" stroke-width="1.6" stroke-linecap="round" opacity="0.55">
    <line x1="8" y1="58" x2="26" y2="60"/>
    <line x1="8" y1="66" x2="26" y2="64"/>
    <line x1="92" y1="58" x2="74" y2="60"/>
    <line x1="92" y1="66" x2="74" y2="64"/>
  </g>
</svg>`.trim();
}

function pixelCatSvg() {
  // Gato em blocos (8-bit), paleta de 3 cores, estruturalmente diferente dos outros presets.
  const px = 10;
  const grid = [
    "..XX....XX..",
    ".XXXXXXXXXX.",
    "XXoXXXXoXXXX",
    "XXXXXXXXXXXX",
    "XX.XXXXXX.XX",
    "XXXX.XX.XXXX",
    ".XXXXXXXXXX.",
    "..XXXXXXXX..",
  ];
  let rects = "";
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const ch = grid[row][col];
      if (ch === ".") continue;
      const fill = ch === "o" ? "#2e2a26" : "#f1c453";
      rects += `<rect x="${col * px}" y="${row * px}" width="${px}" height="${px}" fill="${fill}"/>`;
    }
  }
  return `
<svg viewBox="0 0 ${12 * px} ${8 * px}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" shape-rendering="crispEdges">
  ${rects}
</svg>`.trim();
}

export const CAT_PRESETS = [
  { id: "orange", name: "Gato laranja", svg: () => catFaceSvg({ headColor: "#f2a65a" }) },
  {
    id: "black",
    name: "Gato preto",
    svg: () => catFaceSvg({ headColor: "#2e2a26", innerEarColor: "#514840", eyeColor: "#d9e85a" }),
  },
  {
    id: "white",
    name: "Gato branco",
    svg: () => catFaceSvg({ headColor: "#fdfaf4", strokeColor: "#d8cfbf" }),
  },
  { id: "gray", name: "Gato cinza", svg: () => catFaceSvg({ headColor: "#9aa0a6" }) },
  {
    id: "tabby",
    name: "Gato rajado",
    svg: () =>
      catFaceSvg({
        headColor: "#c48a4f",
        extras: `<g stroke="#8a5a2b" stroke-width="3" opacity="0.6" stroke-linecap="round">
          <line x1="30" y1="24" x2="34" y2="36"/>
          <line x1="42" y1="20" x2="44" y2="34"/>
          <line x1="58" y1="20" x2="56" y2="34"/>
          <line x1="70" y1="24" x2="66" y2="36"/>
        </g>`,
      }),
  },
  {
    id: "siamese",
    name: "Gato siamês",
    svg: () =>
      catFaceSvg({
        headColor: "#ece0cc",
        earColor: "#6b4a37",
        innerEarColor: "#8a6450",
        eyeColor: "#5a8fc4",
        extras: `<ellipse cx="50" cy="72" rx="16" ry="10" fill="#6b4a37" opacity="0.85"/>`,
      }),
  },
  {
    id: "tricolor",
    name: "Gato tricolor",
    svg: () =>
      catFaceSvg({
        headColor: "#fdfaf4",
        strokeColor: "#d8cfbf",
        extras: `<path d="M14 40 Q30 20 46 38 Q40 60 20 60 Q10 50 14 40 Z" fill="#2e2a26"/>
                 <path d="M86 42 Q78 60 60 58 Q62 40 78 30 Q88 34 86 42 Z" fill="#f2a65a"/>`,
      }),
  },
  {
    id: "kitten",
    name: "Gato filhote",
    svg: () =>
      catFaceSvg({
        headColor: "#f6c9a0",
        innerEarColor: "#ffe6d2",
        extras: `<polygon points="50,6 56,16 44,16" fill="#e8798f"/>`,
      }),
  },
  {
    id: "funny",
    name: "Gato engraçado",
    svg: () => catFaceSvg({ headColor: "#f2d36b", eyeStyle: "cross", mouth: "tongue" }),
  },
  { id: "pixel", name: "Gato pixel art", svg: pixelCatSvg },
];

export function getSelectedSkin() {
  return getItem(SELECTED_SKIN_KEY, DEFAULT_SKIN_ID);
}

export function setSelectedSkin(skinId) {
  setItem(SELECTED_SKIN_KEY, skinId);
}

export function getPresetById(id) {
  return CAT_PRESETS.find((p) => p.id === id) ?? null;
}

// Retratos ilustrados (SVG) dos quatro apresentadores. A boca anima enquanto o personagem fala.
const olhos = (cx1, cx2, cy, cor = '#2b1a12') => `
  <g class="olhos">
    <ellipse cx="${cx1}" cy="${cy}" rx="3.4" ry="4.2" fill="${cor}"/><ellipse cx="${cx2}" cy="${cy}" rx="3.4" ry="4.2" fill="${cor}"/>
    <circle cx="${cx1 + 1.2}" cy="${cy - 1.5}" r="1.2" fill="#fff"/><circle cx="${cx2 + 1.2}" cy="${cy - 1.5}" r="1.2" fill="#fff"/>
  </g>`;

const boca = (cy, cor = '#7a2b2b') => `
  <g class="boca" style="transform-origin:60px ${cy}px">
    <path d="M51 ${cy - 1} Q60 ${cy + 9} 69 ${cy - 1} Q60 ${cy + 3} 51 ${cy - 1}Z" fill="${cor}"/>
    <path d="M54 ${cy + 1.5} Q60 ${cy + 6} 66 ${cy + 1.5}" fill="none" stroke="#ff9a9a" stroke-width="2" stroke-linecap="round"/>
  </g>`;

export const AVATARES = {
  jurema: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dona Jurema">
  <defs><linearGradient id="fJ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd29c"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
  <circle cx="60" cy="60" r="58" fill="url(#fJ)"/>
  <path d="M14 120 C18 94 38 84 60 84 C82 84 102 94 106 120Z" fill="#2fbf71"/>
  <g fill="#ffd23f"><circle cx="34" cy="104" r="3.5"/><circle cx="50" cy="96" r="3"/><circle cx="72" cy="98" r="3.5"/><circle cx="88" cy="108" r="3"/><circle cx="60" cy="112" r="3"/></g>
  <path d="M44 86 Q60 100 76 86" fill="none" stroke="#ff4d8d" stroke-width="4" stroke-linecap="round"/>
  <rect x="52" y="70" width="16" height="16" rx="7" fill="#6b3f22"/>
  <g fill="#d9d9d9"><circle cx="36" cy="58" r="7"/><circle cx="34" cy="68" r="6"/><circle cx="84" cy="58" r="7"/><circle cx="86" cy="68" r="6"/></g>
  <ellipse cx="60" cy="57" rx="23" ry="25" fill="#7d4a28"/>
  <path d="M33 46 C33 22 87 22 87 46 C80 38 40 38 33 46Z" fill="#ff8a3d"/>
  <path d="M35 44 C40 30 80 30 85 44 C76 36 44 36 35 44Z" fill="#ffd23f"/>
  <circle cx="60" cy="25" r="9" fill="#ff4d8d"/><circle cx="60" cy="25" r="4" fill="#ffd23f"/>
  <path d="M40 40 Q60 33 80 40" fill="none" stroke="#2fbf71" stroke-width="3"/>
  <circle cx="37" cy="66" r="3" fill="#ffd23f"/><circle cx="83" cy="66" r="3" fill="#ffd23f"/>
  <path d="M45 48 Q51 45 56 48 M64 48 Q69 45 75 48" fill="none" stroke="#bdbdbd" stroke-width="2.4" stroke-linecap="round"/>
  ${olhos(51, 69, 55)}
  <g fill="none" stroke="#5a3a1e" stroke-width="2"><circle cx="51" cy="55" r="7.5"/><circle cx="69" cy="55" r="7.5"/><path d="M58.5 55 L61.5 55"/></g>
  <ellipse cx="45" cy="64" rx="4" ry="2.5" fill="#ff7a7a" opacity=".45"/><ellipse cx="75" cy="64" rx="4" ry="2.5" fill="#ff7a7a" opacity=".45"/>
  <path d="M58 60 Q60 63 62 60" fill="none" stroke="#5a3418" stroke-width="1.8" stroke-linecap="round"/>
  ${boca(68)}
</svg>`,

  caio: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Professor Caio">
  <defs><linearGradient id="fC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ef0e6"/><stop offset="1" stop-color="#12a5b8"/></linearGradient></defs>
  <circle cx="60" cy="60" r="58" fill="url(#fC)"/>
  <path d="M14 120 C18 93 38 84 60 84 C82 84 102 93 106 120Z" fill="#ffd23f"/>
  <path d="M48 84 L60 98 L72 84" fill="#ffffff"/>
  <path d="M60 98 L60 120" stroke="#e0b100" stroke-width="2"/>
  <rect x="52" y="70" width="16" height="16" rx="7" fill="#a86b3c"/>
  <ellipse cx="60" cy="56" rx="22" ry="25" fill="#c68642"/>
  <ellipse cx="37.5" cy="58" rx="4" ry="6" fill="#b5763a"/><ellipse cx="82.5" cy="58" rx="4" ry="6" fill="#b5763a"/>
  <path d="M37 50 C34 26 86 24 83 50 C80 38 70 33 60 34 C50 33 40 38 37 50Z" fill="#2b1d14"/>
  <path d="M40 66 C42 84 78 84 80 66 C76 74 70 78 60 78 C50 78 44 74 40 66Z" fill="#3a2a1e"/>
  <path d="M50 66 Q60 62 70 66 Q60 64 50 66Z" fill="#3a2a1e"/>
  <path d="M45 47 Q51 44 56 46 M64 46 Q69 44 75 47" fill="none" stroke="#2b1d14" stroke-width="2.8" stroke-linecap="round"/>
  ${olhos(51, 69, 54)}
  <g fill="rgba(255,255,255,.15)" stroke="#1d3557" stroke-width="2.4"><rect x="42" y="48" width="17" height="12" rx="4"/><rect x="61" y="48" width="17" height="12" rx="4"/><path d="M59 53 L61 53" fill="none"/></g>
  <path d="M58 60 Q60 63 62 60" fill="none" stroke="#8a5428" stroke-width="1.8" stroke-linecap="round"/>
  ${boca(69, '#5a1e1e')}
</svg>`,

  lia: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Engenheira Lia">
  <defs><linearGradient id="fL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6c2ff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
  <circle cx="60" cy="60" r="58" fill="url(#fL)"/>
  <path d="M34 52 C30 80 32 98 40 108 L80 108 C88 98 90 80 86 52Z" fill="#1b1b1b"/>
  <path d="M14 120 C18 93 38 84 60 84 C82 84 102 93 106 120Z" fill="#3fa9f5"/>
  <path d="M30 104 L44 92 M90 104 L76 92" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>
  <rect x="52" y="70" width="16" height="16" rx="7" fill="#e8b97e"/>
  <ellipse cx="60" cy="57" rx="22" ry="25" fill="#f1c27d"/>
  <path d="M38 52 C40 40 50 36 60 36 C72 36 80 42 82 52 C76 46 66 44 60 44 C50 44 44 48 38 52Z" fill="#1b1b1b"/>
  <path d="M30 42 C30 18 90 18 90 42 Z" fill="#ffd23f"/>
  <rect x="26" y="40" width="68" height="7" rx="3.5" fill="#ffc300"/>
  <path d="M58 20 L62 20 L63 40 L57 40Z" fill="#ffe066"/>
  <circle cx="38" cy="66" r="2.6" fill="#ff4d8d"/><circle cx="82" cy="66" r="2.6" fill="#ff4d8d"/>
  <path d="M45 50 Q51 47 56 49 M64 49 Q69 47 75 50" fill="none" stroke="#1b1b1b" stroke-width="2.4" stroke-linecap="round"/>
  ${olhos(51, 69, 57)}
  <path d="M46 53 L48 55 M74 53 L72 55" stroke="#1b1b1b" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="45" cy="65" rx="4" ry="2.5" fill="#ff7a9a" opacity=".5"/><ellipse cx="75" cy="65" rx="4" ry="2.5" fill="#ff7a9a" opacity=".5"/>
  <path d="M58 62 Q60 64.5 62 62" fill="none" stroke="#c98c4a" stroke-width="1.6" stroke-linecap="round"/>
  ${boca(70, '#8a2240')}
</svg>`,

  teo: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Téo">
  <defs><linearGradient id="fT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8f5c8"/><stop offset="1" stop-color="#2fbf71"/></linearGradient></defs>
  <circle cx="60" cy="60" r="58" fill="url(#fT)"/>
  <path d="M12 120 C16 92 38 82 60 82 C82 82 104 92 108 120Z" fill="#8b5cf6"/>
  <path d="M44 84 C46 96 74 96 76 84" fill="none" stroke="#6d3fd9" stroke-width="5"/>
  <path d="M52 92 L50 108 M68 92 L70 108" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="52" y="70" width="16" height="14" rx="7" fill="#4a2c18"/>
  <ellipse cx="60" cy="57" rx="22" ry="24" fill="#5c3a21"/>
  <g fill="#141414"><circle cx="44" cy="38" r="9"/><circle cx="54" cy="31" r="10"/><circle cx="66" cy="31" r="10"/><circle cx="76" cy="38" r="9"/><circle cx="60" cy="36" r="10"/><circle cx="40" cy="46" r="6"/><circle cx="80" cy="46" r="6"/></g>
  <path d="M30 60 C30 42 90 42 90 60" fill="none" stroke="#ff4d8d" stroke-width="4"/>
  <rect x="25" y="56" width="10" height="15" rx="5" fill="#ff4d8d"/><rect x="85" y="56" width="10" height="15" rx="5" fill="#ff4d8d"/>
  <path d="M45 49 Q51 46 56 48 M64 48 Q69 46 75 49" fill="none" stroke="#141414" stroke-width="2.6" stroke-linecap="round"/>
  ${olhos(51, 69, 56, '#140b05')}
  <path d="M58 61 Q60 64 62 61" fill="none" stroke="#3a2211" stroke-width="1.8" stroke-linecap="round"/>
  <g class="boca" style="transform-origin:60px 69px">
    <path d="M49 67 Q60 80 71 67 Z" fill="#5a1414"/>
    <path d="M51 67.5 L69 67.5 L68 70 L52 70Z" fill="#ffffff"/>
  </g>
</svg>`,
};

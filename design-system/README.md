# CIAP Design System (extraido)

Pacote extraido de `ciap-v136-wizard-refinado.jsx` para reuso em outros projetos.

## Arquivos

| Arquivo | Conteudo |
|--------|----------|
| `ciap-tokens.css` | Spacing, radius, tipografia, motion (duracao/easing), temas claro/escuro, status, fases |
| `ciap-components.css` | Classes base: botao, card, badge, progress, icon-button |
| `ciap-effects.css` | Keyframes (`pulse`, `breathing`, `chevron-bounce`), scrollbar, input com focus ring |
| `ciap-motion.ts` | Presets **Framer Motion** (`initial` / `animate` / `exit` / `transition`), `ciapStagger`, painel deslizante, confete deterministico |
| `ciap-tokens.json` | Tokens + indice das animacoes e springs |
| `package.json` | `peerDependencies`: `react`, `framer-motion` (motion e opcional se voce so usar CSS) |

## Instalacao no outro projeto

```bash
npm install framer-motion
```

Copie a pasta `design-system` e importe os CSS no entry:

```css
@import "./design-system/ciap-tokens.css";
@import "./design-system/ciap-components.css";
@import "./design-system/ciap-effects.css";
```

Envolva a app com `ciap-theme-light` ou `ciap-theme-dark` (classes definidas em `ciap-tokens.css`).

## Classes utilitarias (CSS)

- Componentes: `ciap-surface`, `ciap-icon-button`, `ciap-button-primary`, `ciap-button-status-executing`, `ciap-button-status-paused`, `ciap-card`, `ciap-badge`, `ciap-badge-accent`, `ciap-progress`, `ciap-progress__fill`
- Efeitos: `ciap-scrollable`, `ciap-input`, `ciap-animate-pulse`, `ciap-animate-breathing`, `ciap-animate-chevron-bounce`

## Animacoes (Framer Motion)

Importe presets de `ciap-motion.ts`:

```tsx
import { motion } from 'framer-motion';
import { ciapMotion, ciapStagger, ciapSlidePanelPreset } from './design-system/ciap-motion';

/* Grid de cards (entrada + stagger como no CIAP) */
<motion.section {...ciapMotion.projectGridSection}>
  {items.map((item, index) => (
    <motion.div
      key={item.id}
      className="ciap-card"
      {...ciapMotion.projectCard}
      transition={ciapStagger(index)}
    >
      {item.title}
    </motion.div>
  ))}
</motion.section>

/* Drawer / painel lateral */
const slide = ciapSlidePanelPreset(true);
<motion.div {...slide}>{/* ... */}</motion.div>
```

Presets disponiveis (detalhes no codigo): `nudgeY`, `fadeScale`, `modalSpring`, `popover`, `headerLift`, `fade`, `innerModal`, `backdropFade`, `sheetScale`, `listSlide`, `dockChip`, `microLift`, `projectGridSection`, `projectCard`, `sectionFade`, fluxos `onboarding*`, `celebration*`, `wizardModal`, `wizardIconPop`, e `ciapCelebrationConfettiPiece(index)` para particulas estaveis.

Transicoes nomeadas: `ciapTransition.*` — `modalSpring`, `slidePanelSpring`, duracoes e easings alinhados ao app.

## Efeitos e motion (resumo)

- **CSS**: sombras, overlay, duracoes (`--ciap-motion-*`), easings (`--ciap-ease-*`), hover em `ciap-card` / botoes
- **Keyframes**: ver `ciap-effects.css`
- **Framer**: ver `ciap-motion.ts` (espelhado em `ciap-tokens.json` → `motion`)

## O que ainda e especifico do monolito

- Alguns hovers com `onMouseEnter` alterando estilo inline em telas concretas
- Layouts e SVGs unicos (diamantes, Gantt, etc.) — nao sao “tokens”, sao implementacao

## Tailwind (opcional)

Use `ciap-tokens.json` para `theme.extend` (cores, spacing, radius, fontSize, shadow, motion.durationsSeconds, motion.easing).

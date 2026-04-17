/**
 * CIAP — presets de animação extraídos de `ciap-v136-wizard-refinado.jsx`
 * Requer: `framer-motion` (peer dependency)
 *
 * Uso:
 *   import { motion } from 'framer-motion';
 *   import { ciapMotion, ciapStagger } from './ciap-motion';
 *   <motion.div {...ciapMotion.projectCard} transition={ciapStagger(index)} />
 */

import type { TargetAndTransition, Transition } from 'framer-motion';

/** Curvas de easing usadas no app original */
export const ciapEase = {
  /** Material-like (comum em popovers e painéis) */
  standard: [0.4, 0, 0.2, 1] as const,
  /** Entradas “premium” / onboarding */
  emphasized: [0.16, 1, 0.3, 1] as const,
} as const;

/** Transições nomeadas (reutilize em `transition={...}`) */
export const ciapTransition = {
  fast150: { duration: 0.15 } satisfies Transition,
  base200: { duration: 0.2 } satisfies Transition,
  base200Standard: { duration: 0.2, ease: ciapEase.standard } satisfies Transition,
  base180Standard: { duration: 0.18, ease: ciapEase.standard } satisfies Transition,
  base250Standard: { duration: 0.25, ease: ciapEase.standard } satisfies Transition,
  base300: { duration: 0.3 } satisfies Transition,
  base300Standard: { duration: 0.3, ease: ciapEase.standard } satisfies Transition,
  base400: { duration: 0.4 } satisfies Transition,
  base400Emphasized: { duration: 0.4, ease: ciapEase.emphasized } satisfies Transition,
  base500: { duration: 0.5 } satisfies Transition,
  base500Emphasized: { duration: 0.5, ease: ciapEase.emphasized } satisfies Transition,
  easeOut200: { duration: 0.2, ease: 'easeOut' } satisfies Transition,
  modalSpring: {
    type: 'spring',
    damping: 20,
    stiffness: 300,
  } satisfies Transition,
  slidePanelSpring: {
    type: 'spring',
    damping: 25,
    stiffness: 200,
  } satisfies Transition,
} as const;

export type CiapMotionPreset = {
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  exit?: TargetAndTransition;
  transition?: Transition;
};

/** Stagger usado em grids de cards (`delay: index * step`) */
export function ciapStagger(index: number, step = 0.1): Transition {
  return { delay: index * step };
}

/** Painel que entra pela esquerda ou direita (drawer / split) */
export function ciapSlidePanelPreset(isLeft: boolean): CiapMotionPreset {
  const x = isLeft ? '-100%' : '100%';
  return {
    initial: { x },
    animate: { x: 0 },
    exit: { x },
    transition: ciapTransition.slidePanelSpring,
  };
}

/**
 * Presets agrupados por uso na UI (nomes alinhados ao comportamento do CIAP).
 * Espalhe com `<motion.div {...ciapMotion.projectCard} />` ou mescle `transition`.
 */
export const ciapMotion = {
  /** Tooltip / micro fade vertical curto */
  nudgeY: {
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: ciapTransition.fast150,
  } satisfies CiapMotionPreset,

  /** Pop leve com scale */
  fadeScale: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: ciapTransition.base200,
  } satisfies CiapMotionPreset,

  /** Modal central com spring */
  modalSpring: {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.9, y: 20 },
    transition: ciapTransition.modalSpring,
  } satisfies CiapMotionPreset,

  /** Popover / dropdown padrão (muito usado) */
  popover: {
    initial: { opacity: 0, y: -10, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -10, scale: 0.95 },
    transition: ciapTransition.base200Standard,
  } satisfies CiapMotionPreset,

  /** Cabeçalho ou bloco que desce um pouco mais */
  headerLift: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: ciapTransition.base250Standard,
  } satisfies CiapMotionPreset,

  /** Apenas fade */
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: ciapTransition.easeOut200,
  } satisfies CiapMotionPreset,

  /** Conteúdo interno de modal (scale + Y) */
  innerModal: {
    initial: { scale: 0.95, y: 20 },
    animate: { scale: 1, y: 0 },
    exit: { scale: 0.95, y: 20 },
  } satisfies CiapMotionPreset,

  /** Backdrop + conteúdo: primeiro fade, segundo scale */
  backdropFade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: ciapTransition.easeOut200,
  } satisfies CiapMotionPreset,

  sheetScale: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
    transition: ciapTransition.easeOut200,
  } satisfies CiapMotionPreset,

  /** Lista / troca de painel horizontal */
  listSlide: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: ciapTransition.base300,
  } satisfies CiapMotionPreset,

  /** Tabs / dock compacto */
  dockChip: {
    initial: { opacity: 0, scale: 0.95, x: -8 },
    animate: { opacity: 1, scale: 1, x: 0 },
    exit: { opacity: 0, scale: 0.95, x: -8 },
    transition: ciapTransition.base180Standard,
  } satisfies CiapMotionPreset,

  /** Micro lift (listas internas) */
  microLift: {
    initial: { opacity: 0, y: -5 },
    animate: { opacity: 1, y: 0 },
    transition: ciapTransition.fast150,
  } satisfies CiapMotionPreset,

  /** Seção que envolve grid de project cards (container) */
  projectGridSection: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: ciapTransition.base500,
  } satisfies CiapMotionPreset,

  /** Card de projeto — entrada; use `transition={{ ...ciapStagger(i) }}` nos itens */
  projectCard: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  } satisfies CiapMotionPreset,

  /** Fade de secção (0.3s) — usado em wrappers de lista */
  sectionFade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 },
  } satisfies CiapMotionPreset,

  /** Onboarding / checklist — entradas em Y menor */
  onboardingY12: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12 },
    transition: ciapTransition.base300,
  } satisfies CiapMotionPreset,

  onboardingY8: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: ciapTransition.base300,
  } satisfies CiapMotionPreset,

  onboardingX8: {
    initial: { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 8 },
    transition: ciapTransition.base300,
  } satisfies CiapMotionPreset,

  onboardingYN8: {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: ciapTransition.base300,
  } satisfies CiapMotionPreset,

  /** Botão flutuante checklist */
  fabChecklist: {
    initial: { opacity: 0, scale: 0.8, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.8, y: 10 },
    transition: ciapTransition.base300,
  } satisfies CiapMotionPreset,

  /** Modal grande onboarding */
  onboardingHero: {
    initial: { opacity: 0, y: 30, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 30, scale: 0.95 },
    transition: ciapTransition.base400Emphasized,
  } satisfies CiapMotionPreset,

  /** Celebração — card central */
  celebrationCard: {
    initial: { scale: 0.7, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.9, opacity: 0 },
    transition: ciapTransition.base500Emphasized,
  } satisfies CiapMotionPreset,

  /** Ícone / badge que “pula” no celebrate */
  celebrationIcon: {
    initial: { scale: 0 },
    animate: { scale: [0, 1.2, 1] },
    transition: { delay: 0.3, duration: 0.6 },
  } satisfies CiapMotionPreset,

  /** Overlay escuro da celebração */
  celebrationBackdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.5 },
  } satisfies CiapMotionPreset,

  /** Título / texto com delay em sequência (celebração) */
  celebrationTitle: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.5, duration: 0.4 },
  } satisfies CiapMotionPreset,

  celebrationBody: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.7, duration: 0.4 },
  } satisfies CiapMotionPreset,

  celebrationButton: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { delay: 1 },
  } satisfies CiapMotionPreset,

  /** Barra de progresso onboarding (só animate/transition no uso) */
  onboardingProgressBar: {
    transition: ciapTransition.base500Emphasized,
  } satisfies CiapMotionPreset,

  /** Passo do wizard com escala + ease emphasized */
  wizardModal: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: ciapTransition.base500Emphasized,
  } satisfies CiapMotionPreset,

  /** Ícone decorativo no wizard */
  wizardIconPop: {
    initial: { rotate: -10, scale: 0.8 },
    animate: { rotate: 0, scale: 1 },
    transition: { delay: 0.2, duration: 0.6, ease: [...ciapEase.emphasized] },
  } satisfies CiapMotionPreset,
} as const;

/**
 * Confetes da celebração (equivalente determinístico ao `Math.random()` do original).
 * Passe o índice do partícula para obter trajetórias estáveis entre renders.
 */
export function ciapCelebrationConfettiPiece(index: number): CiapMotionPreset {
  const r1 = ((index * 73856093) % 1000) / 1000;
  const r2 = ((index * 19349663) % 1000) / 1000;
  const r3 = ((index * 83492791) % 1000) / 1000;
  return {
    initial: { opacity: 0, y: 0, x: 0, scale: 0 },
    animate: {
      opacity: [0, 1, 0],
      y: [0, -(80 + r1 * 120)],
      x: [(r2 - 0.5) * 200],
      scale: [0, 1, 0.5],
      rotate: [0, r3 * 360],
    },
    transition: {
      duration: 2 + r1,
      delay: 0.2 + r2 * 0.5,
      ease: 'easeOut',
    },
  };
}
